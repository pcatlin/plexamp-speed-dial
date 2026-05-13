"""Keep Plex HTTP client identity stable for python-plexapi.

python-plexapi defaults ``X-Plex-Client-Identifier`` to ``hex(getnode())`` (host MAC).
Docker assigns a new virtual NIC/MAC when the container is recreated, so Plex Media Server
logs a *new device* on every ``docker compose up`` unless we refresh :data:`plexapi.BASE_HEADERS`
with a stable client id from the database (generated once per install).

We **mutate** ``plexapi.BASE_HEADERS`` in place instead of replacing it: many modules do
``from plexapi import BASE_HEADERS`` at import time and would keep a stale dict if we
assigned ``plexapi.BASE_HEADERS = reset_base_headers()`` (wrong client id on every request).
"""

from __future__ import annotations

import logging

_log = logging.getLogger(__name__)

PLEX_DEVICE_NAME = "Plexamp Speed Dial API"
PLEX_PRODUCT = "Plexamp Speed Dial"


def current_plex_client_identifier() -> str:
    """Client id applied to python-plexapi / Plex.tv (after :func:`apply_stable_plexapi_headers`)."""
    import plexapi

    return (getattr(plexapi, "X_PLEX_IDENTIFIER", None) or "").strip()


def log_plex_account_linked(*, had_previous_token: bool) -> None:
    """Log after Plex OAuth token is persisted (first link or replacement)."""
    cid = current_plex_client_identifier() or "(unknown)"
    verb = "reconnected" if had_previous_token else "connected"
    _log.info("Plex account %s; client_identifier=%s", verb, cid)


def apply_stable_plexapi_headers(client_identifier: str) -> None:
    """Set global plexapi headers used by :class:`~plexapi.server.PlexServer` and Plex.tv OAuth."""
    import plexapi
    from plexapi.config import reset_base_headers

    cid = (client_identifier or "").strip()
    if not cid:
        raise ValueError("plex_client_identifier must be non-empty")
    plexapi.X_PLEX_IDENTIFIER = cid
    plexapi.X_PLEX_DEVICE_NAME = PLEX_DEVICE_NAME
    plexapi.X_PLEX_PRODUCT = PLEX_PRODUCT
    fresh = reset_base_headers()
    plexapi.BASE_HEADERS.clear()
    plexapi.BASE_HEADERS.update(fresh)
    _log.info(
        "API startup: Plex client_identifier=%s device_name=%s product=%s",
        cid,
        PLEX_DEVICE_NAME,
        PLEX_PRODUCT,
    )
