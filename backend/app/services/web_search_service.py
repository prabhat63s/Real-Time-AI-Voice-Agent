import httpx
from app.config import settings

class WebSearchService:
    BASE_URL = settings.SERPAPI_BASE_URL

    def __init__(self):
        self.api_key = settings.SERPAPI_API_KEY
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(5.0, connect=1.5),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        )

    async def search_web(self, query: str) -> str:
        params = {
            "engine": "google",
            "q": query,
            "api_key": self.api_key,
            "gl": "in"
        }

        try:
            response = await self.client.get(self.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as e:
            print(f"SerpApi Error: {e.response.status_code} - {e.response.text}")
            return "Failed to search web."
        except Exception as e:
            print(f"Search Error: {e}")
            return "Search failed."

        organic_results = data.get("organic_results", [])
        if not organic_results:
            return "No results found."

        summary = []
        for item in organic_results[:3]:
            title = item.get("title", "")
            snippet = item.get("snippet", "")
            summary.append(f"{title}: {snippet}")

        return "\n".join(summary)
