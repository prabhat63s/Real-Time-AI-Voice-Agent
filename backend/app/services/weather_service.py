import httpx

from app.config import settings


class WeatherService:
    BASE_URL = settings.OPENWEATHER_BASE_URL

    def __init__(self):
        self.api_key = settings.OPENWEATHER_API_KEY
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(3.0, connect=1.5),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        )

    async def get_weather(self, city: str) -> str:
        params = {
            "q": city,
            "appid": self.api_key,
            "units": "metric",
        }

        response = await self.client.get(f"{self.BASE_URL}/weather", params=params)

        if response.status_code != 200:
            return f"Could not find weather for {city}."

        data = response.json()
        main = data.get("main", {})
        weather = data.get("weather", [{}])[0]

        temp = main.get("temp")
        desc = weather.get("description")

        return f"The current temperature in {city} is {temp} C with {desc}."
