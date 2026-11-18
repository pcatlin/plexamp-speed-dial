"""HTTP helpers for headless Plexamp/Caldera companion createPlayQueue + timeline."""

from __future__ import annotations

import logging
import re
import threading
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlencode, urlparse

import requests
import requests.exceptions as requests_exc

from app.core.config import settings

_log = logging.getLogger(__name__)

_TIMELINE_TYPE_PRIORITY = ("music", "audio", "video", "photo")

# Serialize + space out requests per companion host (fragile Wi-Fi players).
_host_locks: dict[str, threading.RLock] = {}
_host_last_request_mono: dict[str, float] = {}
_host_locks_guard = threading.Lock()

# Companion protocol expects an incrementing commandID per controller request.
_command_id_lock = threading.Lock()
_command_id = 0


def next_command_id() -> str:
    """Return the next unique companion commandID (1, 2, 3, …)."""
    global _command_id
    with _command_id_lock:
        _command_id += 1
        return str(_command_id)


@dataclass(frozen=True)
class TimelineSnapshot:
    """Parsed companion timeline for music playback."""

    state: str | None = None
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    rating_key: str | None = None


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
    library_key is e.g. `/playlists/123/items`, `/library/metadata/456`, or station paths with `?type=10`.
    """
    path = (library_key or "").strip()
    if path and not path.startswith("/"):
        path = "/" + path
    return f"server://{machine_identifier}/{library_identifier}{path}"


def playlist_playback_library_key(rating_key: str | int, raw_key: str = "") -> str:
    """
    Normalize a playlist path to `/playlists/{id}/items` for companion createPlayQueue.

    Working Desktop/Caldera casts use this shape (not bare `/playlists/{id}` or `/playlist/{id}`).
    """
    key = (raw_key or "").strip().split("?", 1)[0].rstrip("/")
    match = re.match(r"^/playlists?/(\d+)(?:/items)?$", key)
    if match:
        return f"/playlists/{match.group(1)}/items"
    rk = str(rating_key).strip()
    if rk.isdigit():
        return f"/playlists/{rk}/items"
    if key:
        return f"{key}/items" if not key.endswith("/items") else key
    raise ValueError("Playlist has no library path for playback.")


def build_track_list_server_uri(
    machine_identifier: str,
    library_identifier: str,
    rating_keys: list[int],
) -> str:
    """Build a server URI for an explicit multi-track queue (avoids a PMS PlayQueue round-trip)."""
    if not rating_keys:
        raise ValueError("rating_keys must not be empty")
    keys_csv = ",".join(str(rating_key) for rating_key in rating_keys)
    return f"server://{machine_identifier}/{library_identifier}/library/metadata/{keys_csv}"


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


def _utc_ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _companion_host_key(url_or_base: str) -> str:
    parsed = urlparse(url_or_base if "://" in url_or_base else f"http://{url_or_base}")
    host = parsed.hostname or "unknown"
    port = parsed.port or 32500
    return f"{host}:{port}"


def _lock_for_companion_host(host_key: str) -> threading.RLock:
    with _host_locks_guard:
        lock = _host_locks.get(host_key)
        if lock is None:
            lock = threading.RLock()
            _host_locks[host_key] = lock
        return lock


def companion_get(url: str, *, timeout: float, headers: dict[str, str] | None = None) -> requests.Response:
    """
    GET a companion (Plexamp/Caldera) URL with per-host throttling and timestamped logging.

    Timeline polls are silent; playback/command traffic is logged for audit.
    """
    host_key = _companion_host_key(url)
    safe = _redact_token_query(url)
    is_poll = "/player/timeline/poll" in url
    gap = float(getattr(settings, "plexamp_min_request_interval_seconds", 0.75) or 0.0)
    hdrs = headers if headers is not None else _plexamp_request_headers()

    with _lock_for_companion_host(host_key):
        if gap > 0:
            last = _host_last_request_mono.get(host_key, 0.0)
            wait = gap - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)

        started = time.monotonic()
        ts = _utc_ts()
        try:
            resp = requests.get(url, timeout=timeout, headers=hdrs)
        except Exception as exc:
            _host_last_request_mono[host_key] = time.monotonic()
            if not is_poll:
                duration_ms = (time.monotonic() - started) * 1000.0
                _log.warning("%s GET %s error=%s duration_ms=%.0f", ts, safe, exc, duration_ms)
            raise
        _host_last_request_mono[host_key] = time.monotonic()
        if not is_poll:
            duration_ms = (time.monotonic() - started) * 1000.0
            _log.info("%s GET %s status=%s duration_ms=%.0f", ts, safe, resp.status_code, duration_ms)
        return resp


def create_play_queue(
    *,
    plexamp_base: str,
    server_uri: str,
    token: str,
    pms_address: str,
    pms_port: int,
    pms_protocol: str,
    timeout: float,
    machine_identifier: str,
    shuffle: int = 0,
    playlist_id: str | int | None = None,
) -> requests.Response:
    """
    Companion createPlayQueue matching working Desktop/Plexamp casts.

    Always sends source, machineIdentifier, includeExternalMedia, and shuffle=0|1.
    For playlists, also sends playlistID (Desktop does the same).
    """
    base = sanitize_plexamp_base(plexamp_base)
    mid = (machine_identifier or "").strip()
    query_params: dict[str, str] = {
        "source": mid,
        "machineIdentifier": mid,
        "uri": server_uri,
        "token": token,
        "includeExternalMedia": "1",
        "type": "audio",
        "protocol": pms_protocol,
        "address": pms_address,
        "port": str(pms_port),
        "shuffle": "1" if shuffle else "0",
        "commandID": next_command_id(),
    }
    if playlist_id is not None and str(playlist_id).strip():
        query_params["playlistID"] = str(playlist_id).strip()
    query = urlencode(query_params)
    url = f"{base}/player/playback/createPlayQueue?{query}"
    resp = companion_get(url, timeout=timeout)
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
    query = urlencode({"type": "audio", "commandID": next_command_id(), "token": token})
    url = f"{base}/player/playback/{action}?{query}"
    return companion_get(url, timeout=timeout)


def _timeline_element_type(el: ET.Element) -> str:
    for attr in ("type", "itemType", "mtype"):
        value = (el.get(attr) or "").strip().lower()
        if value:
            return value
    return ""


def _rating_key_from_timeline(el: ET.Element) -> str | None:
    raw = (el.get("ratingKey") or "").strip()
    if raw:
        return raw
    key = (el.get("key") or "").strip()
    if not key:
        return None
    m = re.search(r"/library/metadata/(\d+)", key)
    return m.group(1) if m else None


def _attr(el: ET.Element, *names: str) -> str | None:
    for name in names:
        value = (el.get(name) or "").strip()
        if value:
            return value
    return None


def _timeline_snapshot_from_element(el: ET.Element) -> TimelineSnapshot | None:
    state = (el.get("state") or "").strip() or None
    if not state:
        return None
    return TimelineSnapshot(
        state=state,
        title=_attr(el, "title", "trackTitle"),
        # Prefer track artist (originalTitle) over album artist (grandparentTitle).
        artist=_attr(el, "originalTitle", "artistTitle", "grandparentTitle"),
        album=_attr(el, "parentTitle", "albumTitle"),
        rating_key=_rating_key_from_timeline(el),
    )


def _timeline_snapshot_from_xml(text: str) -> TimelineSnapshot | None:
    """Parse Plex companion timeline XML, preferring the music timeline over photo/video entries."""
    if not text or not text.strip():
        return None
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        root = None

    timelines: list[tuple[str, TimelineSnapshot]] = []
    if root is not None:
        for el in root.iter():
            tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
            if tag != "Timeline":
                continue
            snap = _timeline_snapshot_from_element(el)
            if snap is not None:
                timelines.append((_timeline_element_type(el), snap))

    if not timelines:
        m = re.search(
            r'<Timeline[^>]*\btype="([^"]+)"[^>]*\bstate="([^"]+)"',
            text,
            re.IGNORECASE,
        )
        if m:
            timelines.append((m.group(1).strip().lower(), TimelineSnapshot(state=m.group(2).strip())))
        else:
            m = re.search(r'<Timeline[^>]*\bstate="([^"]+)"', text, re.IGNORECASE)
            if m:
                timelines.append(("", TimelineSnapshot(state=m.group(1).strip())))

    if not timelines:
        return None

    for preferred in _TIMELINE_TYPE_PRIORITY:
        for timeline_type, snap in timelines:
            if timeline_type == preferred:
                return snap

    return timelines[0][1]


def _timeline_state_from_xml(text: str) -> str | None:
    snap = _timeline_snapshot_from_xml(text)
    return snap.state if snap else None


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


def plexamp_timeline_snapshot(
    *,
    plexamp_base: str,
    token: str,
    timeout: float,
) -> TimelineSnapshot | None:
    """
    Poll companion ``/player/timeline/poll`` for music timeline state and track fields.

    Tries music-typed first, then a generic poll only if needed (serialized, never parallel).
    """
    base = sanitize_plexamp_base(plexamp_base)
    # Prefer music-typed poll; fall back to generic only if needed.
    param_variants = (
        {"type": "music", "wait": "0", "token": token},
        {"wait": "0", "token": token},
    )

    for base_params in param_variants:
        params = {**base_params, "commandID": next_command_id()}
        url = f"{base}/player/timeline/poll?{urlencode(params)}"
        try:
            resp = companion_get(url, timeout=timeout)
        except requests_exc.RequestException:
            continue
        if resp.status_code != 200:
            continue
        snap = _timeline_snapshot_from_xml(resp.text or "")
        if snap and snap.state:
            return TimelineSnapshot(
                state=snap.state.lower(),
                title=snap.title,
                artist=snap.artist,
                album=snap.album,
                rating_key=snap.rating_key,
            )
    return None


def plexamp_timeline_state(
    *,
    plexamp_base: str,
    token: str,
    timeout: float,
) -> str | None:
    """
    Poll headless companion ``/player/timeline/poll`` for music timeline state.

    Returns lowercased state when known (e.g. ``playing``, ``paused``, ``stopped``), else ``None``.
    """
    snap = plexamp_timeline_snapshot(plexamp_base=plexamp_base, token=token, timeout=timeout)
    return snap.state if snap else None


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
