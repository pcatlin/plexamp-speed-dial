from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models import PlexCredential
from app.services.runtime_setup import resolve_plex_conn


def require_plex_creds(db: Session = Depends(get_db)) -> PlexCredential:
    """Require stored Plex auth token (single-owner flow)."""
    creds = db.query(PlexCredential).first()
    if not creds or not creds.auth_token:
        raise HTTPException(
            status_code=401,
            detail="Plex is not linked. Complete Plex sign-in from the Plex Auth card.",
        )
    conn = resolve_plex_conn(db)
    if not conn.base_url.strip():
        raise HTTPException(
            status_code=503,
            detail=(
                "Plex Media Server URL is not configured. Open Setup and enter your PMS base URL "
                "(e.g. http://127.0.0.1:32400 when the API can reach Plex on that host)."
            ),
        )
    return creds
