from typing import List, Dict, Optional
from tavily import TavilyClient
from src.config import Config


class TavilyTool:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or Config.TAVILY_API_KEY
        if not self.api_key:
            pass

    def search(self, query: str, k: int = 5) -> List[Dict[str, str]]:
        """
        Executes a web search using the Tavily API.
        Returns a list of dictionaries with title, url, and content.
        """
        if not self.api_key:
            raise ValueError("TAVILY_API_KEY is not set")

        try:
            client = TavilyClient(api_key=self.api_key)
            response = client.search(
                query=query,
                max_results=k,
                search_depth="basic",
            )

            structured_results = []
            for result in response.get("results", []):
                structured_results.append({
                    "title": result.get("title", ""),
                    "url": result.get("url", ""),
                    "content": result.get("content", ""),
                })

            return structured_results

        except Exception as e:
            print(f"Error searching Tavily: {e}")
            return []
