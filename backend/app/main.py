import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.db.database import SessionLocal
from app.services.runtime_setup import effective_plex_url, get_or_create_runtime_setup

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
    db = SessionLocal()
    try:
        row = get_or_create_runtime_setup(db)
        eff = effective_plex_url(row.plex_server_url)
    finally:
        db.close()
    if not eff.strip():
        _logger.warning(
            "Plex Media Server URL is unset (Setup modal + env). "
            "/api/v1/media/* will return 503 until a URL is configured."
        )
