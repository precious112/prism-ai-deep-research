import unittest
import sys
import os
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from langchain_core.messages import AIMessage

# Ensure core/src is in path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.agents.researcher_agent import ResearcherAgent, GapAnalysis, Action, IllustrationCheck

class TestResearcherAgent(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_model = MagicMock()
        # Mock structured output chain
        self.mock_chain = MagicMock()
        self.mock_chain.ainvoke = AsyncMock() # Use AsyncMock for ainvoke
        self.mock_model.with_structured_output.return_value = self.mock_chain
        
        self.agent = ResearcherAgent(self.mock_model, serper_api_key="fake")
        # Replace tools with mock
        self.agent.serper_tool = MagicMock()
        self.agent.crawler_tool = MagicMock()
        self.agent.illustration_tool = MagicMock()
        self.agent.illustration_tool.illustrate = AsyncMock()

    async def test_check_gaps_initial(self):
        state = {
            "topic": "Test Topic",
            "description": "Test Desc",
            "draft": "",
            "revision_number": 0,
            "max_revisions": 3
        }
        result = await self.agent.check_gaps(state)
        self.assertEqual(result["revision_number"], 1)
        self.assertTrue(len(result["pending_actions"]) > 0)
        self.assertEqual(result["pending_actions"][0]["tool"], "search")

    @patch('src.agents.researcher_agent.ChatPromptTemplate')
    async def test_check_gaps_complete(self, mock_prompt_cls):
        # Setup mock chain behavior
        mock_chain = MagicMock()
        mock_analysis = GapAnalysis(is_complete=True, missing_info="", actions=[])
        mock_chain.ainvoke = AsyncMock(return_value=mock_analysis)

        # Setup mock prompt behavior
        mock_prompt = MagicMock()
        mock_prompt.__or__.return_value = mock_chain
        mock_prompt_cls.from_messages.return_value = mock_prompt

        state = {
            "topic": "Test Topic",
            "description": "Test Desc",
            "draft": "Existing draft",
            "revision_number": 1
        }
        
        result = await self.agent.check_gaps(state)
        self.assertEqual(len(result["pending_actions"]), 0)

    @patch('src.agents.researcher_agent.ChatPromptTemplate')
    async def test_check_gaps_incomplete(self, mock_prompt_cls):
        # Setup mock chain behavior
        mock_chain = MagicMock()
        action = Action(tool="search", query_or_url="query1")
        mock_analysis = GapAnalysis(is_complete=False, missing_info="Need more info", actions=[action])
        mock_chain.ainvoke = AsyncMock(return_value=mock_analysis)

        # Setup mock prompt behavior
        mock_prompt = MagicMock()
        mock_prompt.__or__.return_value = mock_chain
        mock_prompt_cls.from_messages.return_value = mock_prompt

        state = {
            "topic": "Test Topic",
            "description": "Test Desc",
            "draft": "Incomplete draft",
            "revision_number": 1
        }
        
        result = await self.agent.check_gaps(state)
        self.assertEqual(result["revision_number"], 2)
        self.assertEqual(result["pending_actions"][0]["tool"], "search")
        self.assertEqual(result["pending_actions"][0]["query_or_url"], "query1")

    async def test_search_node(self):
        state = {"pending_actions": [{"tool": "search", "query_or_url": "q1"}]}
        self.agent.serper_tool.search.return_value = [{"title": "R1", "url": "u1", "content": "c1"}]
        
        # search_node uses loop.run_in_executor
        result = await self.agent.search_node(state)
        self.assertEqual(len(result["search_results"]), 1)
        self.agent.serper_tool.search.assert_called_with("q1", 3)

    async def test_crawl_node(self):
        state = {"pending_actions": [{"tool": "crawl", "query_or_url": "http://test.com"}]}
        self.agent.crawler_tool.crawl.return_value = "Crawled Content"
        
        result = await self.agent.search_node(state)
        self.assertEqual(len(result["search_results"]), 1)
        self.assertEqual(result["search_results"][0]["content"], "Crawled Content")
        self.agent.crawler_tool.crawl.assert_called_with("http://test.com")

    @patch('src.agents.researcher_agent.ChatPromptTemplate')
    async def test_synthesize_node(self, mock_prompt_cls):
        # Setup the chain mock
        mock_chain = MagicMock()
        mock_chain.ainvoke = AsyncMock(return_value=AIMessage(content="Updated Draft"))
        
        # When prompt | model is called
        mock_prompt = MagicMock()
        # Mock the pipe operator behavior
        mock_prompt.__or__.return_value = mock_chain
        mock_prompt_cls.from_messages.return_value = mock_prompt
        
        state = {
            "topic": "T",
            "description": "D",
            "draft": "Old",
            "search_results": [{"title": "R1", "url": "u1", "content": "c1"}]
        }
        
        result = await self.agent.synthesize_node(state)
        self.assertEqual(result["draft"], "Updated Draft")

    @patch('src.agents.researcher_agent.ChatPromptTemplate')
    async def test_illustrate_node_needed(self, mock_prompt_cls):
        # Setup mock chain behavior
        mock_chain = MagicMock()
        mock_check = IllustrationCheck(needs_illustration=True, reason="Complex topic")
        mock_chain.ainvoke = AsyncMock(return_value=mock_check)
        
        # Setup prompt mock
        mock_prompt = MagicMock()
        mock_prompt.__or__.return_value = mock_chain
        mock_prompt_cls.from_messages.return_value = mock_prompt

        # Setup illustration tool mock
        self.agent.illustration_tool.illustrate.return_value = {"url": "http://img.com"}

        state = {
            "topic": "DP",
            "description": "Dynamic Programming",
            "draft": "Complex text about DP..."
        }
        
        result = await self.agent.illustrate_node(state)
        self.assertIsNotNone(result["illustration"])
        self.assertEqual(result["illustration"]["url"], "http://img.com")
        self.agent.illustration_tool.illustrate.assert_called_once()

    @patch('src.agents.researcher_agent.ChatPromptTemplate')
    async def test_illustrate_node_not_needed(self, mock_prompt_cls):
        # Setup mock chain behavior
        mock_chain = MagicMock()
        mock_check = IllustrationCheck(needs_illustration=False, reason="Simple enough")
        mock_chain.ainvoke = AsyncMock(return_value=mock_check)
        
        # Setup prompt mock
        mock_prompt = MagicMock()
        mock_prompt.__or__.return_value = mock_chain
        mock_prompt_cls.from_messages.return_value = mock_prompt

        state = {
            "topic": "Simple",
            "description": "Simple Desc",
            "draft": "Simple text..."
        }
        
        result = await self.agent.illustrate_node(state)
        self.assertIsNone(result["illustration"])
        self.agent.illustration_tool.illustrate.assert_not_called()

    async def test_illustrate_node_disabled(self):
        # Initialize agent with illustrations disabled
        agent = ResearcherAgent(self.mock_model, serper_api_key="fake", include_illustrations=False)
        # Mock tool manually as setUp uses different agent
        agent.illustration_tool = MagicMock()
        agent.illustration_tool.illustrate = AsyncMock()
        # Mock checker (though shouldn't be called)
        agent.illustration_checker = MagicMock()
        agent.illustration_checker.ainvoke = AsyncMock()

        state = {
            "topic": "Topic",
            "description": "Desc",
            "draft": "Draft"
        }
        
        result = await agent.illustrate_node(state)
        self.assertIsNone(result["illustration"])
        # Ensure checker was NOT called
        agent.illustration_checker.ainvoke.assert_not_called()
        agent.illustration_tool.illustrate.assert_not_called()

if __name__ == '__main__':
    unittest.main()
