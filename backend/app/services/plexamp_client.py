"""HTTP helpers for headless Plexamp player's createPlayQueue endpoint."""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from urllib.parse import urlencode, urlparse

import requests
import requests.exceptions as requests_exc

_log = logging.getLogger(__name__)

_TIMELINE_TYPE_PRIORITY = ("music", "audio", "video", "photo")


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


def append_max_degrees_of_separation(library_key: str, degrees: int) -> str:
    """Append Plex radio `maxDegreesOfSeparation` (1–3, or -1 for unlimited) to a station library path."""
    key = (library_key or "").strip()
    if not key:
        return key
    sep = "&" if "?" in key else "?"
    return f"{key}{sep}maxDegreesOfSeparation={degrees}"


def _redact_token_query(query: str) -> str:
    return re.sub(r"token=[^&]*", "token=<redacted>", query)


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
    resp = requests.get(url, timeout=timeout)
    if resp.status_code != 200:
        _log.warning(
            "Plexamp createPlayQueue HTTP %s server_uri=%s",
            resp.status_code,
            server_uri,
        )
    return resp


def plexamp_playback_command(
    *,
    plexamp_base: str,
    token: str,
    action: str,
    timeout: float,
) -> requests.Response:
    """Send a companion playback command to headless Plexamp (play, pause, skipNext, skipPrevious, stop, …)."""
    base = sanitize_plexamp_base(plexamp_base)
    query = urlencode({"type": "audio", "commandID": 1, "token": token})
    url = f"{base}/player/playback/{action}?{query}"
    safe = _redact_token_query(url)
    _log.info("Plexamp playback %s GET %s", action, safe)
    return requests.get(url, timeout=timeout)


def _timeline_element_type(el: ET.Element) -> str:
    for attr in ("type", "itemType", "mtype"):
        value = (el.get(attr) or "").strip().lower()
        if value:
            return value
    return ""


def _timeline_state_from_xml(text: str) -> str | None:
    """Parse Plex companion timeline XML, preferring the music timeline over photo/video entries."""
    if not text or not text.strip():
        return None
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        root = None

    timelines: list[tuple[str, str]] = []
    if root is not None:
        for el in root.iter():
            tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
            if tag != "Timeline":
                continue
            state = (el.get("state") or "").strip()
            if state:
                timelines.append((_timeline_element_type(el), state))

    if not timelines:
        m = re.search(
            r'<Timeline[^>]*\btype="([^"]+)"[^>]*\bstate="([^"]+)"',
            text,
            re.IGNORECASE,
        )
        if m:
            timelines.append((m.group(1).strip().lower(), m.group(2).strip()))
        else:
            m = re.search(r'<Timeline[^>]*\bstate="([^"]+)"', text, re.IGNORECASE)
            if m:
                timelines.append(("", m.group(1).strip()))

    if not timelines:
        return None

    for preferred in _TIMELINE_TYPE_PRIORITY:
        for timeline_type, state in timelines:
            if timeline_type == preferred:
                return state

    return timelines[0][1]


def _plexamp_request_headers() -> dict[str, str]:
    try:
        from app.plexapi_identity import PLEX_DEVICE_NAME, PLEX_PRODUCT, current_plex_client_identifier

        client_id = current_plex_client_identifier()
    except Exception:  # noqa: BLE001
        return {"Accept": "application/xml"}
    if not client_id:
        return {"Accept": "application/xml"}
    return {
        "Accept": "application/xml",
        "X-Plex-Client-Identifier": client_id,
        "X-Plex-Product": PLEX_PRODUCT,
        "X-Plex-Device-Name": PLEX_DEVICE_NAME,
    }


def plexamp_timeline_state(
    *,
    plexamp_base: str,
    token: str,
    timeout: float,
) -> str | None:
    """
    Poll headless Plexamp companion ``/player/timeline/poll`` for music timeline state.

    Returns lowercased state when known (e.g. ``playing``, ``paused``, ``stopped``), else ``None``.
    """
    base = sanitize_plexamp_base(plexamp_base)
    param_variants = (
        {"type": "music", "wait": "0", "commandID": "1", "token": token},
        {"wait": "0", "commandID": "1", "token": token},
    )
    for params in param_variants:
        url = f"{base}/player/timeline/poll?{urlencode(params)}"
        safe = _redact_token_query(url)
        try:
            resp = requests.get(url, timeout=timeout, headers=_plexamp_request_headers())
        except requests_exc.RequestException as exc:
            _log.debug("Plexamp timeline poll transport error %s: %s", safe, exc)
            continue
        if resp.status_code != 200:
            _log.debug("Plexamp timeline poll HTTP %s %s", resp.status_code, safe)
            continue
        state = _timeline_state_from_xml(resp.text or "")
        if state:
            return state.lower()
    return None


def plexamp_timeline_implies_playing(raw: str | None) -> bool | None:
    """Map timeline ``state`` string to playing / not playing / unknown."""
    if not raw:
        return None
    s = raw.strip().lower()
    if s in ("playing", "buffering"):
        return True
    if s in ("paused", "stopped", "idle", ""):
        return False
    return None
