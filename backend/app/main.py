from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import voice, auth
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version="1.0.0",
    )

    # CORS – adjust origins based on your frontend URL
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "https://voice-agent-phi-sable.vercel.app"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(voice.router, prefix="/api/voice", tags=["Voice"])
    app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])

    @app.get("/health")
    async def health_check():
        return {"status": "ok"}

    return app


app = create_app()
