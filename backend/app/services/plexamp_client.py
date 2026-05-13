"""HTTP helpers for headless Plexamp player's createPlayQueue endpoint."""

from __future__ import annotations

import logging
import re
from urllib.parse import urlencode, urlparse

import requests

_log = logging.getLogger(__name__)


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
    Build `server://{machine}/{identifier}{path}` for Plexamp createPlayQueue.

    Must match plexapi PlayQueue.create: literal slashes in the path, not slash-encoded (%2F).
    library_key is e.g. `/playlist/123`, `/library/metadata/456`, or station paths with `?type=10`.
    """
    path = (library_key or "").strip()
    if path and not path.startswith("/"):
        path = "/" + path
    return f"server://{machine_identifier}/{library_identifier}{path}"


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
    shuffle: int = 0,
) -> requests.Response:
    base = sanitize_plexamp_base(plexamp_base)
    query_params: dict[str, str] = {
        "uri": server_uri,
        "token": token,
        "type": "audio",
        "protocol": pms_protocol,
        "address": pms_address,
        "port": str(pms_port),
        "commandID": "1",
    }
    if shuffle:
        query_params["shuffle"] = "1"
    query = urlencode(query_params)
    url = f"{base}/player/playback/createPlayQueue?{query}"
    safe = re.sub(r"token=[^&]*", "token=<redacted>", url)
    _log.info("Plexamp createPlayQueue server_uri=%s", server_uri)
    _log.info("Plexamp createPlayQueue GET %s", safe)
    # Uvicorn often hides app.* INFO on stdout; duplicate so Docker logs always show playback debugging.
    print(f"[plexamp] server_uri={server_uri}", flush=True)
    print(f"[plexamp] createPlayQueue GET {safe}", flush=True)
    resp = requests.get(url, timeout=timeout)
    print(f"[plexamp] createPlayQueue HTTP {resp.status_code} body_len={len(resp.text or '')}", flush=True)
    return resp


def plexamp_playback_command(
    *,
    plexamp_base: str,
    token: str,
    action: str,
    timeout: float,
) -> requests.Response:
    """Send a companion playback command to headless Plexamp (skipNext, skipPrevious, pause, stop, …)."""
    base = sanitize_plexamp_base(plexamp_base)
    query = urlencode({"type": "audio", "commandID": 1, "token": token})
    url = f"{base}/player/playback/{action}?{query}"
    safe = re.sub(r"token=[^&]*", "token=<redacted>", url)
    _log.info("Plexamp playback %s GET %s", action, safe)
    return requests.get(url, timeout=timeout)
