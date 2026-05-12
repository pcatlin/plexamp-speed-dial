"""Keep Plex HTTP client identity stable (especially in Docker).

python-plexapi defaults ``X-Plex-Client-Identifier`` to ``hex(getnode())`` (host MAC).
Docker assigns a new virtual NIC/MAC when the container is recreated, so Plex Media Server
logs a *new device* on every ``docker compose up`` even when ``PLEX_CLIENT_IDENTIFIER`` is set
for OAuth — because :class:`~plexapi.server.PlexServer` copies :data:`plexapi.BASE_HEADERS`,
which still held the MAC-based value until we refresh it here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.config import Settings


def apply_stable_plexapi_headers(settings: Settings) -> None:
    import plexapi
    from plexapi.config import reset_base_headers

    cid = (settings.plex_client_identifier or "").strip()
    if cid:
        plexapi.X_PLEX_IDENTIFIER = cid
    device = (settings.plex_device_name or "").strip()
    if device:
        plexapi.X_PLEX_DEVICE_NAME = device
    product = (settings.plex_product or "").strip()
    if product:
        plexapi.X_PLEX_PRODUCT = product
    plexapi.BASE_HEADERS = reset_base_headers()
