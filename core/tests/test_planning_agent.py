import unittest
import sys
import os
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock

# Add src to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.agents.planning_agent import PlanningAgent, ResearchPlan, Section

class TestPlanningAgent(unittest.IsolatedAsyncioTestCase):
    async def test_generate_plan_no_history(self):
        # Mock the model
        mock_model = MagicMock()
        mock_structured_llm = MagicMock()
        
        mock_model.with_structured_output.return_value = mock_structured_llm
        
        agent = PlanningAgent(mock_model)
        
        mock_chain = MagicMock()
        # Setup the chain to return our desired plan via ainvoke (async)
        mock_chain.ainvoke = AsyncMock(return_value=ResearchPlan(sections=[
            Section(title="Introduction", description="Intro"),
            Section(title="Conclusion", description="Outro")
        ]))
        
        with patch('src.agents.planning_agent.ChatPromptTemplate') as MockPrompt:
            mock_prompt_instance = MagicMock()
            MockPrompt.from_messages.return_value = mock_prompt_instance
            mock_prompt_instance.__or__.return_value = mock_chain
            
            plan = await agent.generate_plan("Test Query")
            
            self.assertEqual(len(plan.sections), 2)
            # Verify invoke was called
            mock_chain.ainvoke.assert_called_once()

    async def test_compact_history(self):
        # Mock model for summarization
        mock_model = MagicMock()
        mock_structured_llm = MagicMock()
        mock_model.with_structured_output.return_value = mock_structured_llm
        
        # Mock ainvoke for summarization
        mock_model.ainvoke = AsyncMock(return_value=MagicMock(content="Summarized text"))
        
        agent = PlanningAgent(mock_model)
        
        # Create dummy history > 10 messages
        history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"msg {i}"} for i in range(20)]
        
        compacted = await agent.compact_history(history)
        
        # Expected: 
        # History length 20.
        # Last 4 kept raw. (Indices 16, 17, 18, 19)
        # First 16 summarized.
        # 16 messages / 2 = 8 chunks.
        # Parallel summarization calls = 8.
        # Result = 1 Summary Message + 4 Raw Messages = 5 messages total.
        
        self.assertEqual(len(compacted), 5)
        self.assertTrue("Summary of previous conversation" in compacted[0].content)
        self.assertEqual(compacted[1].content, "msg 16")
        
        # Check call count
        # 8 chunks summarized
        self.assertEqual(mock_model.ainvoke.call_count, 8)

if __name__ == '__main__':
    unittest.main()
