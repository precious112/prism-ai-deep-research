from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
try:
    from langchain_xai import ChatXAI
except ImportError:
    ChatXAI = None

from src.config import Config

class ModelFactory:
    @staticmethod
    def get_model(config: dict):
        provider = config.get("provider", "openai").lower()
        model_name = config.get("model")
        api_key = config.get("apiKey")

        if not api_key:
            raise ValueError(f"API key for provider '{provider}' is required but not provided.")

        if provider == "openai":
            return ChatOpenAI(
                model=model_name or "gpt-4-turbo",
                api_key=api_key
            )
        elif provider == "anthropic":
            return ChatAnthropic(
                model=model_name or "claude-3-opus-20240229",
                api_key=api_key
            )
        elif provider == "google":
            return ChatGoogleGenerativeAI(
                model=model_name or "gemini-pro",
                google_api_key=api_key
            )
        elif provider == "xai":
            if ChatXAI is None:
                 raise ImportError("langchain-xai is not installed")
            return ChatXAI(
                model=model_name or "grok-beta",
                xai_api_key=api_key
            )
        else:
            raise ValueError(f"Unsupported provider: {provider}")
