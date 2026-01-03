import json
import redis
import time
import sys
import os
import asyncio
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

    def publish_update(self, payload):
        channel = "updates"
        try:
            self.redis.publish(channel, json.dumps(payload))
            print(f"Published update to {channel}: {payload['type']} - {payload.get('payload', {}).get('status')}")
        except Exception as e:
            print(f"Failed to publish update: {e}")

async def run_parallel_research(model, plan, user_id, request_id, publisher, api_client, include_illustrations=True):
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
                        "event_type": event_type,
                        "section_index": section_index,
                        "topic": section_title,
                        **data
                    }
                }
            }
            # Run blocking publish in executor to avoid blocking the loop
            loop.run_in_executor(None, publisher.publish_update, payload)
        return callback

    async def process_section(i, section):
        # Notify start
        publisher.publish_update({
             "target_user_id": user_id,
             "type": "agent_update",
             "payload": {
                 "agent": "Researcher",
                 "status": "action",
                 "message": f"Starting research for: {section.title}",
                 "data": {
                     "requestId": request_id,
                     "event_type": "research_started",
                     "section_index": i,
                     "topic": section.title
                 }
             }
        })
        
        callback = create_callback(i, section.title)
        agent = ResearcherAgent(model, serper_api_key=Config.SERPER_API_KEY, event_callback=callback, include_illustrations=include_illustrations)
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

async def run_conclusion(model, query, sections_content, publisher, user_id, request_id):
    conclusion_agent = ConclusionAgent(model)
    final_report = ""
    
    # We use a simple counter to help frontend if needed, though they just append
    chunk_index = 0
    
    async for chunk in conclusion_agent.generate_report_stream(query, sections_content):
        final_report += chunk
        publisher.publish_update({
            "target_user_id": user_id,
            "type": "agent_update",
            "payload": {
                "agent": "Conclusion",
                "status": "output",
                "message": "Generating report...",
                "data": {
                    "requestId": request_id,
                    "event_type": "report_chunk",
                    "chunk": chunk,
                    "chunk_index": chunk_index
                }
            }
        })
        chunk_index += 1
        
    return final_report

def main():
    print("Worker starting...")
    try:
        r = redis.from_url(Config.REDIS_URL)
        r.ping()
        print(f"Connected to Redis at {Config.REDIS_URL}")
    except Exception as e:
        print(f"Failed to connect to Redis: {e}")
        sys.exit(1)

    publisher = RedisPublisher(r)
    api_client = ApiClient()

    print("Waiting for tasks on 'research_tasks'...")
    while True:
        try:
            # blpop returns a tuple (key, value)
            task = r.blpop("research_tasks", timeout=0)
            if task:
                queue_name, data = task
                payload = json.loads(data)
                print(f"Received task: {payload}")
                
                request_id = payload.get("requestId")
                user_id = payload.get("userId", "unknown")
                query = payload.get("query")
                config = payload.get("config", {})
                chat_id = payload.get("chatId")
                
                # Extract options
                include_illustrations = config.get("includeIllustrations", True)
                
                # 1. Initialize Model
                try:
                    model = ModelFactory.get_model(config)
                except Exception as e:
                    print(f"Error creating model: {e}")
                    publisher.publish_update({
                        "target_user_id": user_id,
                        "type": "agent_error",
                        "payload": {
                            "message": f"Error initializing model: {str(e)}",
                            "requestId": request_id
                        }
                    })
                    continue

                # 2. Planning Phase
                publisher.publish_update({
                    "target_user_id": user_id,
                    "type": "agent_update",
                    "payload": {
                        "agent": "Planner",
                        "status": "thinking",
                        "message": "Analyzing query and generating plan...",
                        "data": {"requestId": request_id}
                    }
                })

                try:
                    planner = PlanningAgent(model)
                    history = payload.get("history", [])
                    print(f"DEBUG: Loaded chat history from Redis payload: {len(history)} messages. First message: {history[0] if history else 'None'}")
                    plan = asyncio.run(planner.generate_plan(query, history))
                    
                    # Convert Pydantic model to dict
                    toc = [s.title for s in plan.sections]
                    
                    publisher.publish_update({
                        "target_user_id": user_id, 
                        "type": "agent_update",
                        "payload": {
                            "agent": "Planner",
                            "status": "action",
                            "message": "Research plan created.",
                            "data": {
                                "requestId": request_id,
                                "event_type": "plan_created",
                                "toc": toc,
                                "full_plan": plan.model_dump()
                            }
                        }
                    })
                    
                    print(f"Plan created for {request_id}: {toc}")

                    # 3. Research Phase (Parallel)
                    # We run the async loop here
                    sections_content = asyncio.run(run_parallel_research(model, plan, user_id, request_id, publisher, api_client, include_illustrations))
                    
                    # 4. Conclusion Phase
                    publisher.publish_update({
                        "target_user_id": user_id,
                        "type": "agent_update",
                        "payload": {
                            "agent": "Conclusion",
                            "status": "thinking",
                            "message": "Aggregating findings and writing final report...",
                            "data": {"requestId": request_id}
                        }
                    })

                    # Run async streaming conclusion
                    final_report = asyncio.run(run_conclusion(model, query, sections_content, publisher, user_id, request_id))

                    # 5. Save Final Result
                    if chat_id:
                        api_client.save_final_response(chat_id, final_report)
                        print(f"Final report saved for chat {chat_id}")

                        # Generate Title
                        try:
                            title_prompt = f"Generate a very short, concise title (max 6 words) for this research report. Do not use quotes:\n\n{final_report[:2000]}"
                            title_response = model.invoke(title_prompt)
                            title = title_response.content.strip().replace('"', '')
                            
                            publisher.publish_update({
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

                    publisher.publish_update({
                        "target_user_id": user_id,
                        "type": "agent_update",
                        "payload": {
                            "agent": "Worker",
                            "status": "output",
                            "message": "Research completed.",
                            "data": {
                                "requestId": request_id, 
                                "event_type": "completed",
                                "report_preview": final_report[:200] + "..."
                            }
                        }
                    })

                except Exception as e:
                    print(f"Error in planning/execution: {e}")
                    # Print full traceback for debugging
                    import traceback
                    traceback.print_exc()
                    
                    publisher.publish_update({
                        "target_user_id": user_id,
                        "type": "agent_error",
                        "payload": {
                            "message": f"Execution failed: {str(e)}",
                            "requestId": request_id
                        }
                    })

        except Exception as e:
            print(f"Error in worker loop: {e}")
            time.sleep(1)

if __name__ == "__main__":
    main()
