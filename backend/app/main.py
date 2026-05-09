import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings

_logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix=settings.api_prefix)


@app.on_event("startup")
def _startup_plex_url_check() -> None:
    if not settings.plex_server_url.strip():
        _logger.warning(
            "PLEX_SERVER_URL is unset; /api/v1/media/* and /auth/plex/server-test will return "
            "503 until you set it (repo .env or backend/.env)."
        )
