import json
import redis.asyncio as redis
import time
import sys
import os
import asyncio
import traceback
from concurrent.futures import ThreadPoolExecutor

# Ensure src is in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config import Config
from src.model_factory import ModelFactory
from src.agents.planning_agent import PlanningAgent
from src.agents.conclusion_agent import ConclusionAgent
from src.agents.researcher_agent import ResearcherAgent
from src.api_client import ApiClient

class RedisPublisher:
    def __init__(self, redis_client):
        self.redis = redis_client

    async def publish_update(self, payload):
        channel = "updates"
        try:
            await self.redis.publish(channel, json.dumps(payload))
            print(f"Published update to {channel}: {payload['type']} - {payload.get('payload', {}).get('status')}")
        except Exception as e:
            print(f"Failed to publish update: {e}")

async def run_parallel_research(model, plan, user_id, request_id, chat_id, publisher, api_client, include_illustrations=True, serper_api_key=None, tavily_api_key=None):
    # Create callback factory
    def create_callback(section_index, section_title):
        loop = asyncio.get_running_loop()
        def callback(event_type, data):
            # Construct payload
            payload = {
                "target_user_id": user_id,
                "type": "agent_update",
                "payload": {
                    "agent": "Researcher",
                    "status": "action",
                    "message": f"Researching: {section_title}",
                    "data": {
                        "requestId": request_id,
                        "chatId": chat_id,
                        "event_type": event_type,
                        "section_index": section_index,
                        "topic": section_title,
                        **data
                    }
                }
            }
            # Fire and forget async publish since we are in the loop (or use create_task)
            loop.create_task(publisher.publish_update(payload))
        return callback

    async def process_section(i, section):
        # Notify start
        await publisher.publish_update({
             "target_user_id": user_id,
             "type": "agent_update",
             "payload": {
                 "agent": "Researcher",
                 "status": "action",
                 "message": f"Starting research for: {section.title}",
                 "data": {
                     "requestId": request_id,
                     "chatId": chat_id,
                     "event_type": "research_started",
                     "section_index": i,
                     "topic": section.title
                 }
             }
        })
        
        callback = create_callback(i, section.title)
        agent = ResearcherAgent(model, serper_api_key=serper_api_key or Config.SERPER_API_KEY, tavily_api_key=tavily_api_key or Config.TAVILY_API_KEY, event_callback=callback, include_illustrations=include_illustrations)
        result = await agent.run_research(section.title, section.description)
        
        # Save intermediate draft
        try:
            loop = asyncio.get_running_loop()
            save_payload = {
                "title": section.title, 
                "content": result["content"], 
                "status": "draft",
                "illustration": result.get("illustration")
            }
            # Run blocking sync API call in executor
            await loop.run_in_executor(None, api_client.save_research_result, request_id, save_payload)
        except Exception as e:
            print(f"Failed to save intermediate result: {e}")

        return {
            "title": section.title, 
            "content": result["content"], 
            "sources": result["sources"],
            "illustration": result.get("illustration")
        }

    # Run all sections in parallel
    return await asyncio.gather(*[process_section(i, s) for i, s in enumerate(plan.sections)])

async def run_conclusion(model, query, sections_content, publisher, user_id, request_id, chat_id):
    conclusion_agent = ConclusionAgent(model)
    final_report = ""
    
    # We use a simple counter to help frontend if needed, though they just append
    chunk_index = 0
    
    async for chunk in conclusion_agent.generate_report_stream(query, sections_content):
        final_report += chunk
        await publisher.publish_update({
            "target_user_id": user_id,
            "type": "agent_update",
            "payload": {
                "agent": "Conclusion",
                "status": "output",
                "message": "Generating report...",
                "data": {
                    "requestId": request_id,
                    "chatId": chat_id,
                    "event_type": "report_chunk",
                    "chunk": chunk,
                    "chunk_index": chunk_index
                }
            }
        })
        chunk_index += 1
        
    return final_report

async def process_task(task_data, r, publisher, api_client, sem):
    try:
        payload = json.loads(task_data)
        print(f"Processing task: {payload.get('requestId')}")
        
        request_id = payload.get("requestId")
        user_id = payload.get("userId", "unknown")
        query = payload.get("query")
        config = payload.get("config", {})
        chat_id = payload.get("chatId")
        
        # Extract options
        include_illustrations = config.get("includeIllustrations", True)
        serper_api_key = config.get("serperApiKey")
        tavily_api_key = config.get("tavilyApiKey")

        # 1. Initialize Model
        try:
            model = ModelFactory.get_model(config)
        except Exception as e:
            print(f"Error creating model: {e}")
            await publisher.publish_update({
                "target_user_id": user_id,
                "type": "agent_error",
                "payload": {
                    "agent": "System",
                    "status": "error",
                    "message": f"Error initializing model: {str(e)}",
                    "data": {
                        "requestId": request_id,
                        "chatId": chat_id
                    }
                }
            })
            return

        # 2. Planning Phase
        await publisher.publish_update({
            "target_user_id": user_id,
            "type": "agent_update",
            "payload": {
                "agent": "Planner",
                "status": "thinking",
                "message": "Analyzing query and generating plan...",
                "data": {
                    "requestId": request_id,
                    "chatId": chat_id
                }
            }
        })

        try:
            planner = PlanningAgent(model)
            history = payload.get("history", [])
            print(f"DEBUG: Loaded chat history from Redis payload: {len(history)} messages.")
            
            # await directly instead of asyncio.run
            plan = await planner.generate_plan(query, history)
            
            # Convert Pydantic model to dict
            toc = [s.title for s in plan.sections]
            
            await publisher.publish_update({
                "target_user_id": user_id, 
                "type": "agent_update",
                "payload": {
                    "agent": "Planner",
                    "status": "action",
                    "message": "Research plan created.",
                    "data": {
                        "requestId": request_id,
                        "chatId": chat_id,
                        "event_type": "plan_created",
                        "toc": toc,
                        "full_plan": plan.model_dump()
                    }
                }
            })
            
            print(f"Plan created for {request_id}: {toc}")

            # 3. Research Phase (Parallel)
            sections_content = await run_parallel_research(model, plan, user_id, request_id, chat_id, publisher, api_client, include_illustrations, serper_api_key, tavily_api_key)
            
            # 4. Conclusion Phase
            await publisher.publish_update({
                "target_user_id": user_id,
                "type": "agent_update",
                "payload": {
                    "agent": "Conclusion",
                    "status": "thinking",
                    "message": "Aggregating findings and writing final report...",
                    "data": {
                        "requestId": request_id,
                        "chatId": chat_id
                    }
                }
            })

            # Run async streaming conclusion
            final_report = await run_conclusion(model, query, sections_content, publisher, user_id, request_id, chat_id)

            # 5. Save Final Result
            if chat_id:
                loop = asyncio.get_running_loop()
                # Run blocking sync API call in executor
                await loop.run_in_executor(None, api_client.save_final_response, chat_id, final_report)
                print(f"Final report saved for chat {chat_id}")

                # Generate Title
                try:
                    title_prompt = f"Generate a very short, concise title (max 6 words) for this research report. Do not use quotes:\n\n{final_report[:2000]}"
                    title_response = await model.ainvoke(title_prompt) if hasattr(model, 'ainvoke') else model.invoke(title_prompt)
                    # Handle both async and sync invoke if model supports it, but usually standard invoke is sync. 
                    # If model.invoke is sync, we should wrap it. LangChain's invoke is often sync or async depending on implementation.
                    # Assuming invoke is safe or fast enough, or ideally wrap it.
                    # ModelFactory models are usually ChatOpenAI etc which support ainvoke.
                    
                    if hasattr(title_response, 'content'):
                        title = title_response.content
                    else:
                         title = str(title_response)
                    
                    if isinstance(title, list):
                        title = "".join([c.get("text", "") if isinstance(c, dict) else str(c) for c in title])
                         
                    title = title.strip().replace('"', '')
                    
                    await publisher.publish_update({
                        "target_user_id": user_id,
                        "type": "agent_update",
                        "payload": {
                            "agent": "Worker",
                            "status": "output",
                            "message": "Title generated.",
                            "data": {
                                "requestId": request_id, 
                                "event_type": "title_generated",
                                "title": title,
                                "chatId": chat_id
                            }
                        }
                    })
                    print(f"Generated title: {title}")
                except Exception as e:
                    print(f"Failed to generate title: {e}")
            else:
                print("Warning: No chatId in task payload. Cannot save final message.")

            await publisher.publish_update({
                "target_user_id": user_id,
                "type": "agent_update",
                "payload": {
                    "agent": "Worker",
                    "status": "output",
                    "message": "Research completed.",
                    "data": {
                        "requestId": request_id,
                        "chatId": chat_id,
                        "event_type": "completed",
                        "report_preview": final_report[:200] + "..."
                    }
                }
            })

        except Exception as e:
            print(f"Error in planning/execution: {e}")
            traceback.print_exc()
            
            await publisher.publish_update({
                "target_user_id": user_id,
                "type": "agent_error",
                "payload": {
                    "agent": "System",
                    "status": "error",
                    "message": f"Execution failed: {str(e)}",
                    "data": {
                        "requestId": request_id,
                        "chatId": chat_id
                    }
                }
            })

    except Exception as e:
        print(f"Critical error processing task: {e}")
        traceback.print_exc()
    finally:
        sem.release()

async def main():
    print("Worker starting (Async)...")
    try:
        r = redis.from_url(Config.REDIS_URL)
        await r.ping()
        print(f"Connected to Redis at {Config.REDIS_URL}")
    except Exception as e:
        print(f"Failed to connect to Redis: {e}")
        sys.exit(1)

    publisher = RedisPublisher(r)
    api_client = ApiClient()
    
    # Concurrency control
    max_concurrent = int(os.getenv("MAX_CONCURRENT_TASKS", 50))
    sem = asyncio.Semaphore(max_concurrent)

    print(f"Waiting for tasks on 'research_tasks' (Max concurrent: {max_concurrent})...")
    while True:
        try:
            # Acquire semaphore before fetching task
            await sem.acquire()
            
            # blpop returns (key, value) or None if timeout/connection lost
            # We use timeout=0 for blocking indefinite, but in loop we might want to handle disconnects
            # redis.asyncio blpop
            task = await r.blpop("research_tasks", timeout=0)
            
            if task:
                queue_name, data = task
                # Create background task
                asyncio.create_task(process_task(data, r, publisher, api_client, sem))
            else:
                sem.release()
                
        except Exception as e:
            print(f"Error in worker loop: {e}")
            sem.release() # Ensure we don't leak semaphore permits on error
            await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(main())
