"""Keep Plex HTTP client identity stable for python-plexapi.

python-plexapi defaults ``X-Plex-Client-Identifier`` to ``hex(getnode())`` (host MAC).
Docker assigns a new virtual NIC/MAC when the container is recreated, so Plex Media Server
logs a *new device* on every ``docker compose up`` unless we refresh :data:`plexapi.BASE_HEADERS`
with a stable client id from the database (generated once per install).
"""

from __future__ import annotations

PLEX_DEVICE_NAME = "Plexamp Speed Dial API"
PLEX_PRODUCT = "Plexamp Speed Dial"


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
    plexapi.BASE_HEADERS = reset_base_headers()
