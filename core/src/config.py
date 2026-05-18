import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT = os.getenv("REDIS_PORT", "6379")
    REDIS_URL = os.getenv("REDIS_URL", f"redis://{REDIS_HOST}:{REDIS_PORT}")
    API_URL = os.getenv("API_URL", "http://localhost:3000/api/v1")
    WORKER_API_KEY = os.getenv("WORKER_API_KEY", "prism-worker-secret")
    
    # Default API Keys (can be overridden by task config)
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    XAI_API_KEY = os.getenv("XAI_API_KEY")
    SERPER_API_KEY = os.getenv("SERPER_API_KEY")
    TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
