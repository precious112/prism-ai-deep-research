from typing import Dict, Any, Literal, Optional
import asyncio
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from src.tools.serper_tool import SerperTool

class IllustrationDecision(BaseModel):
    # decision: Literal["search", "generate"]  <- Removed: We now strictly generate code.
    visualization_type: Literal["d3", "p5", "three", "html"] = Field(description="The library to use for the visualization")
    code_prompt: str = Field(description="The specific prompt for code generation")

class IllustrationTool:
    """
    Tool for generating illustrations.
    
    TODO: Image search functionality is currently deactivated.
    Reason: To use images from the internet, the agent should verify that the images are actually relevant 
    and useful in the context of the draft. This requires multimodal capabilities (feeding the image 
    to a vision model) to verify content. For now, we rely on code-generated visualizations (D3, P5, Three.js) 
    which are deterministic, interactive, and created by the model itself, ensuring relevance.
    """
    
    def __init__(self, model: BaseChatModel, serper_tool: SerperTool):
        self.model = model
        self.serper_tool = serper_tool
        self.decision_maker = model.with_structured_output(IllustrationDecision)

    async def illustrate(self, topic: str, description: str) -> Optional[Dict[str, Any]]:
        # 1. Decide strategy (Now strictly which library to use)
        decision = await self._decide_strategy(topic, description)
        print(f"Illustration strategy for '{topic}': {decision.visualization_type}")
        
        # 2. Generate initial visualization
        result = await self._generate_visualization(decision)
        
        # 3. Verify and Fix (One-time verification)
        if result and result.get("type") == "code":
            original_code = result["content"]
            verified_code = await self._verify_and_fix_code(original_code, decision, topic, description)
            result["content"] = verified_code
            
        return result

    async def _decide_strategy(self, topic: str, description: str) -> IllustrationDecision:
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert visual director. Decide the best way to visualize the given topic using code.
            
            Choose the best library:
            - 'd3' for charts, graphs, data visualizations.
            - 'p5' for artistic, creative, or simulation visuals.
            - 'three' for 3D objects or scenes.
            - 'html' for simple CSS diagrams or flowcharts.
            
            Provide a specific 'code_prompt' that describes exactly what to build.
            """),
            ("user", "Topic: {topic}\nDescription: {description}")
        ])
        chain = prompt | self.decision_maker
        return await chain.ainvoke({"topic": topic, "description": description})

    async def _search_image(self, query: str) -> Optional[Dict[str, Any]]:
        """
        DEACTIVATED: See class docstring.
        """
        return None
        # try:
        #     loop = asyncio.get_running_loop()
        #     results = await loop.run_in_executor(None, self.serper_tool.search_images, query, 1)
        #     
        #     if results:
        #         return {"type": "image", "url": results[0]["url"], "alt": results[0]["title"], "source": results[0]["source_url"]}
        #     return None
        # except Exception as e:
        #     print(f"Image search failed: {e}")
        #     return None

    async def _generate_visualization(self, decision: IllustrationDecision) -> Dict[str, Any]:
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert web developer specializing in data visualization.
            Generate a COMPLETE, self-contained HTML document (including <!DOCTYPE html>, <html>, <head>, <body>) that renders the requested visualization.
            
            CRITICAL CONSTRAINTS:
            1. **Self-Contained**: Output MUST be a single string containing valid HTML5.
            2. **Libraries**: Use reliable CDNs for any libraries (D3, P5, Three.js, etc.).
               - D3: `https://d3js.org/d3.v7.min.js`
               - P5: `https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.js`
               - Three: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`
            3. **Resizing**: The visualization should be responsive (fit width 100%, height 100vh or reasonable fixed height). Ensure body has no margin/padding.
            
            Output ONLY the HTML code. Do not wrap in markdown fences (no ```html). Just the code.
            """),
            ("user", "Create a {lib} visualization for: {prompt}")
        ])
        
        chain = prompt | self.model
        response = await chain.ainvoke({"lib": decision.visualization_type, "prompt": decision.code_prompt})
        
        # Clean up markdown if present (LLMs love markdown fences)
        content = response.content.strip()
        if content.startswith("```html"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
            
        return {"type": "code", "content": content.strip()}

    async def _verify_and_fix_code(self, code: str, decision: IllustrationDecision, topic: str, description: str) -> str:
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a Quality Assurance expert for data visualization code.
            Your goal is to ensure the code is BUG-FREE, COMPLETE, and HELPFUL.
            
            Review the following HTML/JS code for a {lib} visualization.
            
            CONTEXT:
            Topic: {topic}
            Description: {description}
            Code Prompt: {code_prompt}
            
            CHECKLIST:
            1. **Syntax**: Are there unclosed tags, syntax errors, or invalid library usage?
            2. **Completeness**: Are there missing components, labels, legends, or placeholder comments (e.g., "// add data here")? The visualization MUST be fully functional with mock data if necessary.
            3. **Relevance**: Does the visualization effectively convey the information described in the context?
            4. **Responsiveness**: Does it use window dimensions (window.innerWidth) or 100% width/height? (No hardcoded pixel widths > 500px).
            
            INSTRUCTIONS:
            - If the code is perfect, output it EXACTLY as is.
            - If there are ANY issues (especially missing completeness or syntax errors), FIX them and output the FULL CORRECTED code.
            - Output ONLY the HTML code. Do not use markdown fences.
            """),
            ("user", "{code}")
        ])
        
        chain = prompt | self.model
        response = await chain.ainvoke({
            "lib": decision.visualization_type, 
            "topic": topic, 
            "description": description,
            "code_prompt": decision.code_prompt,
            "code": code
        })
        
        content = response.content.strip()
        # Clean up markdown
        if content.startswith("```html"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
            
        return content.strip()
