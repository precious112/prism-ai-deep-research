"""Anonymous web search and page excerpts through Parallel's Search MCP."""

import asyncio
import json
from datetime import timedelta
from typing import Dict, List
from urllib.parse import urlsplit
from uuid import uuid4

from httpx import AsyncClient
from mcp import ClientSession, types
from mcp.client.streamable_http import streamable_http_client


MCP_URL = "https://search.parallel.ai/mcp"
USER_AGENT = "prism-ai-deep-research/0.1.0"


def resolve_search_provider(api_key: str | None, provider: str) -> str:
    """Keep configured Serper installations; use Parallel when unconfigured."""
    if provider not in {"auto", "serper", "parallel", "disabled"}:
        raise ValueError("SEARCH_PROVIDER must be auto, serper, parallel or disabled")
    return ("serper" if api_key else "parallel") if provider == "auto" else provider


def _http_url(url: str) -> bool:
    try:
        parts = urlsplit(url)
        return parts.scheme in {"http", "https"} and bool(parts.hostname) and not parts.username
    except ValueError:
        return False


class ParallelTool:
    def __init__(self, session_id: str | None = None, timeout: float = 30):
        self.session_id = session_id or str(uuid4())
        self.timeout = timeout

    async def _call(self, name: str, arguments: dict) -> List[Dict[str, str]]:
        # The deadline covers initialization, discovery, execution and cleanup.
        # Cancellation propagates through both SDK and HTTP client contexts.
        async with asyncio.timeout(self.timeout):
            async with AsyncClient(
                headers={"User-Agent": USER_AGENT}, timeout=self.timeout
            ) as client:
                async with streamable_http_client(MCP_URL, http_client=client) as (read, write, _):
                    async with ClientSession(
                        read, write,
                        read_timeout_seconds=timedelta(seconds=self.timeout),
                        client_info=types.Implementation(name="prism-ai-deep-research", version="0.1.0"),
                    ) as session:
                        await session.initialize()
                        tools = await session.list_tools()
                        if name not in {tool.name for tool in tools.tools}:
                            raise RuntimeError(f"Parallel MCP does not expose {name}")
                        result = await session.call_tool(
                            name, {**arguments, "session_id": self.session_id}
                        )

        text = "\n".join(block.text for block in result.content if block.type == "text")
        if result.isError:
            raise RuntimeError(f"Parallel {name} failed: {text}")
        data = result.structuredContent
        if data is None:
            data = json.loads(text)
        if not isinstance(data, dict) or not isinstance(data.get("results"), list):
            raise ValueError("Parallel MCP returned an invalid results object")
        if data.get("errors") and not data["results"]:
            raise RuntimeError(f"Parallel {name} could not fetch the requested page")

        results = []
        for item in data["results"]:
            if not isinstance(item, dict):
                raise ValueError("Parallel MCP returned an invalid result")
            url = item.get("url")
            excerpts = item.get("excerpts")
            title = item.get("title")
            if (not isinstance(url, str) or not _http_url(url)
                    or not isinstance(excerpts, list)
                    or any(not isinstance(excerpt, str) for excerpt in excerpts)
                    or title is not None and not isinstance(title, str)):
                raise ValueError("Parallel MCP returned invalid source fields")
            results.append({"title": title or url, "url": url, "content": "\n\n".join(excerpts)})
        return results

    async def search(self, query: str, k: int = 5) -> List[Dict[str, str]]:
        results = await self._call("web_search", {"objective": query, "search_queries": [query]})
        return results[:k]

    async def crawl(self, url: str) -> str:
        if not _http_url(url):
            raise ValueError("Parallel page fetching requires an HTTP or HTTPS URL")
        results = await self._call("web_fetch", {"urls": [url]})
        if not results:
            raise RuntimeError("Parallel web_fetch returned no page content")
        return "\n\n".join(item["content"] for item in results)[:10000]
