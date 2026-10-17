"""Exercise the research graph and real MCP SDK against an HTTP fixture."""

import asyncio
import json
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.agents.researcher_agent import Action, GapAnalysis, ResearcherAgent
from src.config import Config
from src.tools.parallel_tool import MCP_URL, USER_AGENT


SOURCE_URL = "https://example.org/article?topic=web&lang=en"
CLIENT = httpx.AsyncClient


class ScriptedModel(RunnableLambda):
    """Deterministic model decisions, with real prompts and LangGraph execution."""

    def __init__(self):
        self.prompts = []
        self.gap_checks = 0
        super().__init__(self.write)

    def write(self, prompt):
        text = prompt.to_string()
        self.prompts.append(text)
        return AIMessage(content=f"Research draft citing {SOURCE_URL}")

    def with_structured_output(self, schema):
        def respond(prompt):
            self.gap_checks += 1
            return GapAnalysis(
                is_complete=self.gap_checks > 1,
                missing_info="Read the source",
                actions=[Action(tool="crawl", query_or_url=SOURCE_URL)],
            )
        return RunnableLambda(respond)


class MCPFixture:
    def __init__(self):
        self.requests = []
        self.clients = []
        self.error = None
        self.data = None
        self.text_only = False
        self.wait = False
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()

    def client(self, **kwargs):
        client = CLIENT(transport=httpx.MockTransport(self.respond), **kwargs)
        self.clients.append(client)
        return client

    async def respond(self, request):
        message = json.loads(request.content)
        self.requests.append((request, message))
        method = message["method"]
        if "id" not in message:
            return httpx.Response(202)
        if method == "initialize":
            result = {
                "protocolVersion": message["params"]["protocolVersion"],
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "fixture", "version": "1"},
            }
        elif method == "tools/list":
            result = {"tools": [
                {"name": name, "inputSchema": {"type": "object"}}
                for name in ["web_search", "web_fetch"]
            ]}
        else:
            self.started.set()
            if self.wait:
                try:
                    await asyncio.Event().wait()
                finally:
                    self.cancelled.set()
            if self.error == "http":
                return httpx.Response(503)
            if self.error == "transport":
                raise httpx.ReadTimeout("fixture timeout", request=request)
            data = self.data if self.data is not None else {
                "results": [{"title": "Source title", "url": SOURCE_URL,
                             "excerpts": ["First excerpt", "Second excerpt"]}]
            }
            text = "Search quota exhausted" if self.error == "tool" else json.dumps(data)
            result = {"content": [{"type": "text", "text": text}], "isError": self.error == "tool"}
            if not self.text_only and not self.error:
                result["structuredContent"] = data
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": message["id"], "result": result})


class TestParallelResearch(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Ignore ambient keys and Config values loaded from .env at import time.
        self.keys = patch.object(Config, "SERPER_API_KEY", None)
        self.provider = patch.object(Config, "SEARCH_PROVIDER", "auto")
        self.keys.start()
        self.provider.start()
        self.addCleanup(self.keys.stop)
        self.addCleanup(self.provider.stop)
        self.fixture = MCPFixture()
        self.http = patch("src.tools.parallel_tool.AsyncClient", side_effect=self.fixture.client)
        self.http.start()
        self.addCleanup(self.http.stop)

    def agent(self, **kwargs):
        return ResearcherAgent(ScriptedModel(), include_illustrations=False,
                               search_session_id="conversation-fixture", **kwargs)

    async def search(self, agent):
        return await agent.search_node({"pending_actions": [{"tool": "search", "query_or_url": "web research sources"}]})

    async def test_unconfigured_graph_search_fetch_and_synthesis(self):
        events = []
        agent = self.agent(event_callback=lambda kind, data: events.append((kind, data)))
        result = await agent.run_research("Web research", "Find and read a source")
        self.assertEqual(agent.search_provider, "parallel")
        self.assertEqual(len(result["sources"]), 2)
        self.assertIn(SOURCE_URL, result["content"])
        self.assertIsNone(result["illustration"])
        self.assertIn("First excerpt\n\nSecond excerpt", agent.model.prompts[-1])
        self.assertIn(SOURCE_URL, agent.model.prompts[-1])
        self.assertTrue(any(kind == "source_found" and data["url"] == SOURCE_URL for kind, data in events))
        calls = [message["params"] for _, message in self.fixture.requests if message["method"] == "tools/call"]
        self.assertEqual([call["name"] for call in calls], ["web_search", "web_fetch"])
        self.assertEqual(calls[0]["arguments"]["search_queries"], ["Web research Find and read a source"])
        self.assertEqual(calls[1]["arguments"]["urls"], [SOURCE_URL])
        self.assertEqual({call["arguments"]["session_id"] for call in calls}, {"conversation-fixture"})
        methods = {message["method"] for _, message in self.fixture.requests}
        self.assertTrue({"initialize", "tools/list", "tools/call"}.issubset(methods))
        for request, _ in self.fixture.requests:
            self.assertEqual(str(request.url), MCP_URL)
            self.assertEqual(request.headers["User-Agent"], USER_AGENT)
            self.assertNotIn("Authorization", request.headers)
            self.assertNotIn("Cookie", request.headers)
        self.assertTrue(all(client.is_closed for client in self.fixture.clients))

    async def test_task_and_saved_serper_keys_keep_serper(self):
        # Saved client credentials reach ResearcherAgent as serper_api_key.
        for key in ["saved-client-key", "task-key"]:
            with self.subTest(key=key):
                agent = self.agent(serper_api_key=key)
                with patch.object(agent.serper_tool, "search", return_value=[]) as search:
                    await self.search(agent)
                    search.assert_called_once_with("web research sources", 3)
                self.assertEqual(agent.search_provider, "serper")
        self.assertFalse(self.fixture.requests)

    async def test_worker_entrypoint_preserves_conversation_and_consumes_sources(self):
        from src.worker import run_parallel_research

        publisher = SimpleNamespace(publish_update=AsyncMock())
        api = SimpleNamespace(save_research_result=MagicMock())
        plan = SimpleNamespace(sections=[SimpleNamespace(title="Topic", description="Description")])
        result = await run_parallel_research(
            ScriptedModel(), plan, "user", "request", "chat-conversation", publisher, api,
            include_illustrations=False,
        )
        self.assertIn(SOURCE_URL, result[0]["content"])
        self.assertEqual(result[0]["sources"][0]["url"], SOURCE_URL)
        api.save_research_result.assert_called_once()
        for _, message in self.fixture.requests:
            if message["method"] == "tools/call":
                self.assertEqual(message["params"]["arguments"]["session_id"], "chat-conversation")

    async def test_worker_task_serper_key_overrides_environment(self):
        from src.worker import run_parallel_research

        publisher = SimpleNamespace(publish_update=AsyncMock())
        api = SimpleNamespace(save_research_result=MagicMock())
        plan = SimpleNamespace(sections=[SimpleNamespace(title="Topic", description="Description")])
        seen_keys = []

        def search(tool, query, k):
            seen_keys.append(tool.api_key)
            return [{"title": "Source", "url": SOURCE_URL, "content": "Evidence"}]

        with patch.object(Config, "SERPER_API_KEY", "environment-key"), \
                patch("src.tools.serper_tool.SerperTool.search", search), \
                patch("src.tools.crawler_tool.CrawlerTool.crawl", return_value="Page evidence"):
            await run_parallel_research(
                ScriptedModel(), plan, "user", "request", "chat", publisher, api,
                include_illustrations=False, serper_api_key="saved-client-key",
            )
        self.assertEqual(seen_keys, ["saved-client-key"])
        self.assertFalse(self.fixture.requests)

    async def test_environment_key_keeps_serper(self):
        with patch.object(Config, "SERPER_API_KEY", "environment-key"):
            agent = self.agent()
            self.assertEqual(agent.search_provider, "serper")
            self.assertEqual(agent.serper_tool.api_key, "environment-key")

    async def test_explicit_parallel_overrides_key(self):
        with patch.object(Config, "SERPER_API_KEY", "environment-key"):
            agent = self.agent(search_provider="parallel")
            await self.search(agent)
            self.assertEqual(agent.search_provider, "parallel")

    async def test_explicit_serper_does_not_fallback(self):
        agent = self.agent(search_provider="serper")
        with self.assertRaisesRegex(ValueError, "SERPER_API_KEY"):
            await self.search(agent)
        self.assertFalse(self.fixture.requests)

    async def test_configured_serper_failure_does_not_fallback(self):
        agent = self.agent(serper_api_key="configured")
        with patch.object(agent.serper_tool, "search", return_value=[]):
            self.assertEqual((await self.search(agent))["search_results"], [])
        self.assertFalse(self.fixture.requests)

    async def test_disabled_prevents_search_and_crawl(self):
        with patch.object(Config, "SEARCH_PROVIDER", "disabled"):
            agent = self.agent(serper_api_key="configured")
        with patch.object(agent.serper_tool, "search") as search, patch.object(agent.crawler_tool, "crawl") as crawl:
            result = await agent.search_node({"pending_actions": [
                {"tool": "search", "query_or_url": "query"},
                {"tool": "crawl", "query_or_url": SOURCE_URL},
            ]})
            self.assertEqual(result, {"search_results": []})
            search.assert_not_called()
            crawl.assert_not_called()
        self.assertFalse(self.fixture.requests)

    async def test_no_actions_make_no_network_calls(self):
        await self.agent().search_node({"pending_actions": []})
        self.assertFalse(self.fixture.requests)

    async def test_invalid_provider_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "SEARCH_PROVIDER"):
            self.agent(search_provider="typo")

    async def test_text_response_and_result_limit(self):
        self.fixture.text_only = True
        self.fixture.data = {"results": [
            {"url": SOURCE_URL, "title": None, "excerpts": [str(i)]} for i in range(5)
        ]}
        result = await self.search(self.agent())
        self.assertEqual(len(result["search_results"]), 3)
        self.assertEqual(result["search_results"][0]["title"], SOURCE_URL)

    async def test_tool_error_does_not_become_empty_sources(self):
        self.fixture.error = "tool"
        with self.assertRaisesRegex(RuntimeError, "quota exhausted"):
            await self.search(self.agent())

    async def test_bad_results_are_rejected(self):
        for data in [{}, {"results": [None]}, {"results": [{"url": "file:///etc/passwd", "excerpts": []}]},
                     {"results": [{"url": SOURCE_URL, "excerpts": "not a list"}]}]:
            with self.subTest(data=data):
                self.fixture.data = data
                with self.assertRaises(ValueError):
                    await self.search(self.agent())

    async def test_fetch_failure_is_reported(self):
        self.fixture.data = {"results": [], "errors": [{"url": SOURCE_URL, "error_type": "not_found"}]}
        with self.assertRaisesRegex(RuntimeError, "could not fetch"):
            await self.agent().search_node({"pending_actions": [{"tool": "crawl", "query_or_url": SOURCE_URL}]})

    async def test_invalid_crawl_urls_do_not_reach_mcp(self):
        for url in ["file:///etc/passwd", "javascript:alert(1)", "https://", "https://user:pass@example.org"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                await self.agent().search_node({"pending_actions": [{"tool": "crawl", "query_or_url": url}]})
        self.assertFalse(self.fixture.requests)

    async def test_http_and_transport_errors_propagate(self):
        for error in ["http", "transport"]:
            with self.subTest(error=error):
                self.fixture.error = error
                with self.assertRaises(Exception):
                    await self.search(self.agent())
        self.assertTrue(all(client.is_closed for client in self.fixture.clients))

    async def test_whole_call_deadline_cleans_up(self):
        self.fixture.wait = True
        agent = self.agent()
        agent.parallel_tool.timeout = 0.1
        with self.assertRaises(TimeoutError):
            await self.search(agent)
        self.assertTrue(self.fixture.cancelled.is_set())
        self.assertTrue(all(client.is_closed for client in self.fixture.clients))

    async def test_cancellation_stops_request_and_cleans_up(self):
        self.fixture.wait = True
        task = asyncio.create_task(self.search(self.agent()))
        await asyncio.wait_for(self.fixture.started.wait(), 3)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(self.fixture.cancelled.is_set())
        self.assertTrue(all(client.is_closed for client in self.fixture.clients))


if __name__ == "__main__":
    unittest.main()
