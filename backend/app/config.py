from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # API Keys
    GOOGLE_API_KEY: str
    OPENWEATHER_API_KEY: str
    SERPAPI_API_KEY: str
    SARVAM_API_KEY: str

    # App settings
    PROJECT_NAME: str = "Real-time Voice AI Assistant"
    ENVIRONMENT: str = "development"  # or "production"

    # Weather service
    OPENWEATHER_BASE_URL: str = "https://api.openweathermap.org/data/2.5"

    # News service (SerpAPI)
    SERPAPI_BASE_URL: str = "https://serpapi.com/search"

    # Sarvam AI
    SARVAM_BASE_URL: str = "https://api.sarvam.ai"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
