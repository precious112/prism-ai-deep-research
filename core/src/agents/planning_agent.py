import asyncio
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

class Section(BaseModel):
    title: str = Field(description="The title of the section")
    description: str = Field(description="A brief description of what this section should cover")

class ResearchPlan(BaseModel):
    sections: List[Section] = Field(description="List of sections for the research report")

class PlanningAgent:
    def __init__(self, model: BaseChatModel):
        self.model = model
        self.structured_llm = model.with_structured_output(ResearchPlan)
        
    async def compact_history(self, history: List[Dict[str, str]]) -> List[Any]:
        """
        Compacts chat history by summarizing older messages in parallel chunks.
        Keeps the last few messages raw for immediate context.
        """
        if not history:
            return []
            
        # Threshold: If history is short, return as is (converted to Messages)
        if len(history) <= 10:
             return [
                 HumanMessage(content=m["content"]) if m["role"] == "user" 
                 else AIMessage(content=m["content"]) 
                 for m in history
             ]
             
        # Split: Older vs Recent (Last 4 messages = 2 pairs)
        recent_count = 4
        older_history = history[:-recent_count]
        recent_history = history[-recent_count:]
        
        # Chunk older history by 2 (User+AI pairs)
        chunks = [older_history[i:i + 2] for i in range(0, len(older_history), 2)]
        
        async def summarize_chunk(chunk):
            text = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in chunk])
            prompt = f"Summarize the following interaction concisely, focusing on research progress and key findings:\n\n{text}"
            # Use base model for summarization (text output)
            response = await self.model.ainvoke(prompt)
            return response.content
            
        # Parallel summarization
        summaries = await asyncio.gather(*[summarize_chunk(chunk) for chunk in chunks])
        
        combined_summary = "\n\n".join(summaries)
        final_summary_message = HumanMessage(content=f"Summary of previous conversation:\n{combined_summary}")
        
        # Convert recent history to Messages
        recent_messages = [
             HumanMessage(content=m["content"]) if m["role"] == "user" 
             else AIMessage(content=m["content"]) 
             for m in recent_history
        ]
        
        return [final_summary_message] + recent_messages

    async def generate_plan(self, query: str, history: Optional[List[Dict[str, str]]] = None) -> ResearchPlan:
        system_prompt = """You are an expert research planner.
        Given a user query and conversation context, create a detailed Table of Contents (ToC) for a comprehensive research report.
        The ToC should be logical, cover all aspects of the query, and include an Introduction and Conclusion.
        """
        
        messages = [SystemMessage(content=system_prompt)]
        
        if history:
            compacted_context = await self.compact_history(history)
            messages.extend(compacted_context)
            
        messages.append(HumanMessage(content=query))
        
        # We construct the prompt from the list of fully formed messages
        prompt = ChatPromptTemplate.from_messages(messages)
        
        chain = prompt | self.structured_llm
        return await chain.ainvoke({})
