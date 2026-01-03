from typing import Dict, Any, Literal, Optional
import asyncio
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from src.tools.serper_tool import SerperTool

class IllustrationDecision(BaseModel):
    # decision: Literal["search", "generate"]  <- Removed: We now strictly generate code.
    visualization_type: Literal["d3", "p5", "three", "html", "mermaid"] = Field(description="The library to use for the visualization")
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
            ("system", """You are an expert Visual Director and Technical Educator.
            Your goal is to select the most effective visualization library to explain a complex topic, enhancing the user's conceptual understanding.
            
            **Library Capabilities & Selection Criteria:**
            
            1. **`mermaid` (Structural & Logical Relationships)**:
               - **Best for**: Architectural diagrams, flowcharts, sequence diagrams, class diagrams, state machines, mind maps.
               - **Use when**: The topic involves systems, processes, hierarchies, workflows, or static relationships between nodes.
               - *Example*: "System architecture of a microservices app", "User registration flow".
            
            2. **`p5` (Conceptual Animations & Simulations)**:
               - **Best for**: Algorithmic visualizations, physics simulations, mathematical concepts, and 'visual explanation' style animations.
               - **Use when**: The topic is dynamic, requires showing change over time (e.g., sorting algorithms, pathfinding), or benefits from artistic/generative illustration to explain a concept.
               - *Example*: "How Bubble Sort works", "Projectile motion simulation", "Visualizing Pi".
            
            3. **`three` (3D Spatial Concepts)**:
               - **Best for**: 3D geometry, spatial relationships, molecular structures, solar systems, or immersive scenes.
               - **Use when**: The concept is inherently 3-dimensional or requires depth to be understood.
               - *Example*: "Structure of a DNA molecule", "Solar system orbit", "3D vector fields".
            
            4. **`d3` (Data-Driven Charts)**:
               - **Best for**: Quantitative data, statistical graphs, network graphs with large datasets.
               - **Use when**: The goal is to present hard data, trends, or comparisons.
               - *Example*: "Global temperature trends", "Stock market performance".
            
            5. **`html` (Simple Layouts)**:
               - **Best for**: Simple tables, CSS-based diagrams, or interactive widgets that don't fit the above.
            
            **Instructions**:
            - Analyze the Topic and Description to determine the nature of the concept (Structure? Process? Data? Space?).
            - Choose the library that best *explains* the concept.
            - Provide a `code_prompt` that is specific, descriptive, and explicitly requests animation/interactivity if suitable (especially for P5/Three).
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

    async def _generate_visualization(self, decision: IllustrationDecision) -> Dict[str, Any]:
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert web developer specializing in data visualization and educational animations.
            Generate a COMPLETE, self-contained HTML document (including <!DOCTYPE html>, <html>, <head>, <body>) that renders the requested visualization.
            
            CRITICAL CONSTRAINTS:
            1. **Self-Contained**: Output MUST be a single string containing valid HTML5.
            2. **Libraries**: Use reliable CDNs for any libraries.
               - D3: `https://d3js.org/d3.v7.min.js`
               - P5: `https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.4.0/p5.js`
               - Three: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`
               - Mermaid: `https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js`
            3. **Resizing**: The visualization should be responsive (fit width 100%, height 100vh or reasonable fixed height). Ensure body has no margin/padding.
            
            **Specific Library Instructions**:
            - **Mermaid**: 
              - Include the Mermaid CDN script.
              - Initialize it with `mermaid.initialize({{ startOnLoad: true }});`.
              - Place the diagram code inside a `<div class="mermaid">` tag.
              - **IMPORTANT RULES**: 
                - Start STRICTLY with the diagram type (e.g., `graph TD`, `sequenceDiagram`, `classDiagram`).
                - **ALWAYS wrap node labels in double quotes** (e.g., `id["Label Text"]`). This is critical to prevent syntax errors with special characters.
                - Do NOT include version numbers, markdown fences, or text like "mermaid version".
                - Example: `<div class="mermaid">\ngraph TD;\nA["Start"] --> B["End"];\n</div>`
            - **P5/Three**:
              - Create **animated** or **interactive** sketches if the prompt implies a process or simulation (e.g., sorting, physics).
              - Use loops or `requestAnimationFrame` to show change over time.
              - Ensure the canvas resizes with the window.
            
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
            4. **Responsiveness**: Does it use window dimensions (window.innerWidth) or 100% width/height?
            5. **Mermaid Specifics**:
               - Ensure content inside `<div class="mermaid">` is VALID Mermaid syntax.
               - Check that ALL node labels are wrapped in **double quotes** (e.g., `id["Label"]`). Unquoted labels with spaces or symbols cause errors.
               - No version strings or markdown.
            
            INSTRUCTIONS:
            - If the code is perfect, output it EXACTLY as is.
            - If there are ANY issues (especially missing completeness, syntax errors, or unquoted labels), FIX them and output the FULL CORRECTED code.
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
