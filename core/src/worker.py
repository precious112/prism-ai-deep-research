import json
import redis
import time
import sys
from src.config import Config

class RedisPublisher:
    def __init__(self, redis_client):
        self.redis = redis_client

    def publish_update(self, payload):
        # TODO: Implement update publishing to 'updates' channel
        # channel = "updates"
        # self.redis.publish(channel, json.dumps(payload))
        print(f"Mock Publish Update: {payload}")

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

    print("Waiting for tasks on 'research_tasks'...")
    while True:
        try:
            # blpop returns a tuple (key, value)
            # timeout=0 means block indefinitely
            task = r.blpop("research_tasks", timeout=0)
            if task:
                queue_name, data = task
                payload = json.loads(data)
                print(f"Received task: {payload}")
                
                # Verify payload structure
                request_id = payload.get("requestId")
                query = payload.get("query")
                config = payload.get("config", {})
                
                print(f"Processing Request ID: {request_id}")
                print(f"Query: {query}")
                print(f"Config: {config}")
                
                # Simulate work acknowledgment
                publisher.publish_update({
                    "type": "agent_update",
                    "payload": {
                        "agent": "Worker",
                        "status": "thinking",
                        "message": "Task received and started.",
                        "data": {"requestId": request_id}
                    }
                })
                
        except Exception as e:
            print(f"Error in worker loop: {e}")
            time.sleep(1)

if __name__ == "__main__":
    main()
