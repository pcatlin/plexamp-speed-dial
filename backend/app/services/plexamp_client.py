"""HTTP helpers for headless Plexamp player's createPlayQueue endpoint."""

from __future__ import annotations

from urllib.parse import quote, urlencode, urlparse

import requests


def sanitize_plexamp_base(player_url: str) -> str:
    """Ensure scheme and default companion port 32500 for Plexamp headless player."""
    u = player_url.strip()
    if not u.startswith(("http://", "https://")):
        u = "http://" + u
    parsed = urlparse(u)
    if parsed.port is None and parsed.hostname:
        netloc = f"{parsed.hostname}:32500"
        parsed = parsed._replace(netloc=netloc)
    base = parsed.geturl().rstrip("/")
    return base


def parse_pms_host_port_protocol(server_url: str) -> tuple[str, int, str]:
    """Derive address / port / protocol Plexamp uses to reach Plex Media Server."""
    raw = (server_url or "").strip().rstrip("/")
    if not raw:
        return "127.0.0.1", 32400, "http"
    parsed = urlparse(raw if "://" in raw else f"http://{raw}")
    scheme = (parsed.scheme or "http").lower()
    protocol = "https" if scheme == "https" else "http"
    host = parsed.hostname or "127.0.0.1"
    if parsed.port is not None:
        port = parsed.port
    else:
        port = 443 if scheme == "https" else 32400
    return host, port, protocol


def build_server_playback_uri(machine_identifier: str, library_identifier: str, library_key: str) -> str:
    """
    Build `server://{machine}/{identifier}{encoded_key}` used by Plexamp createPlayQueue.

    library_key should be the PMS-relative path + optional query (e.g. `/library/metadata/123` or
    artist radio `/library/metadata/…/station/…?type=10`).
    """
    encoded = quote(library_key, safe="")
    return f"server://{machine_identifier}/{library_identifier}{encoded}"


def append_type_if_missing(library_key: str, libtype: str) -> str:
    """Append Plex `type=` filter when missing (mirrors common headless Plexamp URI patterns)."""
    if "type=" in library_key:
        return library_key
    from plexapi import utils as plex_utils

    try:
        code = plex_utils.searchType(libtype)
    except Exception:  # noqa: BLE001
        return library_key
    sep = "&" if "?" in library_key else "?"
    return f"{library_key}{sep}type={code}"


def create_play_queue(
    *,
    plexamp_base: str,
    server_uri: str,
    token: str,
    pms_address: str,
    pms_port: int,
    pms_protocol: str,
    timeout: float,
) -> requests.Response:
    base = sanitize_plexamp_base(plexamp_base)
    query = urlencode(
        {
            "uri": server_uri,
            "token": token,
            "type": "audio",
            "protocol": pms_protocol,
            "address": pms_address,
            "port": str(pms_port),
            "commandID": 1,
        }
    )
    url = f"{base}/player/playback/createPlayQueue?{query}"
    return requests.get(url, timeout=timeout)
