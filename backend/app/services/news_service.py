import httpx
from app.config import settings

class NewsService:
    BASE_URL = settings.SERPAPI_BASE_URL

    def __init__(self):
        self.api_key = settings.SERPAPI_API_KEY
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(4.0, connect=1.5),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        )

    async def get_news(self, query: str = "latest news") -> str:
        params = {
            "engine": "google_news",
            "q": query,
            "api_key": self.api_key,
            "gl": "in", # India localization
        }
        
        response = await self.client.get(self.BASE_URL, params=params)
        response.raise_for_status()
        data = response.json()

        news_results = data.get("news_results", [])
        if not news_results:
            return "No news found."

        # Summarize top 3
        summary = []
        for item in news_results[:3]:
            title = item.get("title", "")
            source = item.get("source", {}).get("name", "")
            summary.append(f"- {title} (Source: {source})")

        return "\n".join(summary)
