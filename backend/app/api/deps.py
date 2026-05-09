from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models import PlexCredential


def require_plex_creds(db: Session = Depends(get_db)) -> PlexCredential:
    """Require stored Plex auth token (single-owner flow)."""
    creds = db.query(PlexCredential).first()
    if not creds or not creds.auth_token:
        raise HTTPException(
            status_code=401,
            detail="Plex is not linked. Complete Plex sign-in from the Plex Auth card.",
        )
    url = settings.plex_server_url.strip().rstrip("/")
    if not url:
        raise HTTPException(
            status_code=503,
            detail=(
                "PLEX_SERVER_URL is not set or empty. Set it before starting the API "
                "(e.g. export PLEX_SERVER_URL=http://127.0.0.1:32400 for local Plex). "
                "Use a repo-root .env or backend/.env so it loads even when cwd is backend/. "
                "In Docker, set PLEX_SERVER_URL in your compose environment. "
                "The URL must be reachable from wherever uvicorn runs (not localhost for a remote Plex host)."
            ),
        )
    return creds
