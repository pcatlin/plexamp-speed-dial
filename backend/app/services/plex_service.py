from __future__ import annotations

import math
import random
from urllib.parse import urlencode

import requests
import requests.exceptions as requests_exc
import plexapi
from plexapi import utils as plex_utils
from plexapi.exceptions import BadRequest, NotFound, Unauthorized
from plexapi.playlist import Playlist
from plexapi.library import MusicSection
from plexapi.myplex import MyPlexAccount
from plexapi.server import PlexServer

from app.core.config import settings
from app.schemas.domain import (
    CollectionItem,
    MediaItem,
    MediaSuggestionsResponse,
    PlexAuthStartResponse,
    PlexServerTestResponse,
    ServerTidalTracksResponse,
    TidalTrackRead,
    TidalTracksDeleteResponse,
)
from app.services.runtime_setup import PlexConn


class PlexTvHttpError(RuntimeError):
    """Plex.tv pin / OAuth HTTP layer.error."""


class PlexService:
    def __init__(self) -> None:
        self._media_limit = settings.plex_media_limit

    def _make_server_session(self, ssl_verify: bool, *, request_timeout: float = 30) -> requests.Session:
        if not ssl_verify:
            try:
                import urllib3

                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            except Exception:  # noqa: BLE001
                pass
        session = requests.Session()
        session.verify = ssl_verify
        base_request = session.request

        def request_with_timeout(method: str, url: str, **kwargs: object) -> requests.Response:
            kwargs.setdefault("timeout", request_timeout)
            return base_request(method, url, **kwargs)

        session.request = request_with_timeout  # type: ignore[method-assign]
        return session

    def _plex_tv_headers(self) -> dict[str, str]:
        headers = plexapi.BASE_HEADERS.copy()
        headers.setdefault("X-Plex-Product", "Plexamp Speed Dial")
        return headers

    def _oauth_url(self, code: str, headers: dict[str, str]) -> str:
        params = {
            "clientID": headers["X-Plex-Client-Identifier"],
            "context[device][product]": headers.get("X-Plex-Product", "Plexamp Speed Dial"),
            "context[device][version]": headers.get("X-Plex-Version", ""),
            "context[device][platform]": headers.get("X-Plex-Platform", ""),
            "context[device][platformVersion]": headers.get("X-Plex-Platform-Version", ""),
            "context[device][device]": headers.get("X-Plex-Device", ""),
            "context[device][deviceName]": headers.get("X-Plex-Device-Name", ""),
            "code": code,
        }
        return f"https://app.plex.tv/auth/#!?{urlencode(params)}"

    def start_auth(self) -> PlexAuthStartResponse:
        """Creates a Plex.tv OAuth PIN and returns the authorize URL."""
        headers = self._plex_tv_headers()
        response = requests.post(
            "https://plex.tv/api/v2/pins",
            params={"strong": "true"},
            headers=headers,
            timeout=30,
        )
        if not response.ok:
            raise PlexTvHttpError(f"plex.tv PIN create failed ({response.status_code}): {response.text[:500]}")
        root = plex_utils.parseXMLString(response.text)
        pin_id = root.attrib.get("id")
        code = root.attrib.get("code")
        if not pin_id or not code:
            raise PlexTvHttpError("plex.tv PIN response missing id or code")
        return PlexAuthStartResponse(pin_id=str(pin_id), code=code, auth_url=self._oauth_url(code, headers))

    def poll_oauth_pin(self, pin_id: str) -> str | None:
        """Poll plex.tv for completion; returns auth token or None while pending."""
        headers = self._plex_tv_headers()
        response = requests.get(f"https://plex.tv/api/v2/pins/{pin_id}", headers=headers, timeout=30)
        if not response.ok:
            raise PlexTvHttpError(f"plex.tv PIN poll failed ({response.status_code}): {response.text[:500]}")
        root = plex_utils.parseXMLString(response.text)
        return root.attrib.get("authToken")

    def lookup_username(self, token: str) -> str | None:
        """Resolve friendly username/email from Plex account token."""
        try:
            account = MyPlexAccount(token=token)
            return account.username or account.title or getattr(account, "email", None)
        except Exception:  # noqa: BLE001
            return None

    def connect_server(self, token: str, conn: PlexConn, *, request_timeout: float = 30) -> PlexServer:
        base = conn.base_url.strip().rstrip("/")
        if not base:
            raise ValueError(
                "Plex Media Server URL is empty. Set it under Setup.",
            )
        session = self._make_server_session(conn.ssl_verify, request_timeout=request_timeout)
        try:
            return PlexServer(base, token, session=session)
        except Unauthorized as exc:
            raise ValueError(
                "Plex Media Server rejected the token (HTTP 401). "
                "Re-link Plex here, confirm this Plex account has access to the server, "
                "and check Plex → Settings → Network → List of IPs allowed without auth includes this host.",
            ) from exc
        except requests_exc.SSLError as exc:
            raise ValueError(
                f"TLS/SSL error to {base!r}: {exc}. "
                "Use http:// if Plex is plain HTTP on your LAN; or disable TLS verification in Setup for insecure HTTPS.",
            ) from exc
        except requests_exc.Timeout as exc:
            raise ValueError(
                f"Timeout connecting to {base!r}: {exc}. "
                "Verify the URL, port (usually 32400), and firewall rules.",
            ) from exc
        except requests_exc.ConnectionError as exc:
            raise ValueError(
                f"Cannot open a TCP connection to {base!r}: {exc}. "
                "If the API runs in Docker, the hostname must resolve inside the container (try the server's LAN IP). "
                "On Linux Docker, host.docker.internal is not always defined unless you enable it.",
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise ValueError(
                f"Unexpected Plex error for {base!r}: {type(exc).__name__}: {exc}",
            ) from exc

    def probe_server_connection(self, token: str, conn: PlexConn) -> PlexServerTestResponse:
        """Return structured diagnostics without raising (for troubleshooting)."""
        url = conn.base_url.strip().rstrip("/")
        ssl_on = conn.ssl_verify
        if not url:
            return PlexServerTestResponse(
                ok=False,
                configured_url="",
                ssl_verify_enabled=ssl_on,
                error_detail=(
                    "Plex Media Server URL is empty. Set it under Setup."
                ),
            )

        session = self._make_server_session(conn.ssl_verify)
        try:
            server = PlexServer(url, token, session=session)
        except Unauthorized:
            return PlexServerTestResponse(
                ok=False,
                configured_url=url,
                ssl_verify_enabled=ssl_on,
                error_detail=(
                    "PMS returned 401 — token denied. Re-link Plex, or add this machine/network under "
                    "Settings → Network → List of IPs allowed without auth."
                ),
            )
        except requests_exc.SSLError as exc:
            return PlexServerTestResponse(
                ok=False,
                configured_url=url,
                ssl_verify_enabled=ssl_on,
                error_detail=(
                    f"SSL error: {exc}. Prefer http:// for LAN Plex, or turn off TLS verification in Setup for insecure HTTPS."
                ),
            )
        except requests_exc.Timeout as exc:
            return PlexServerTestResponse(
                ok=False,
                configured_url=url,
                ssl_verify_enabled=ssl_on,
                error_detail=f"Connection timed out: {exc}",
            )
        except requests_exc.ConnectionError as exc:
            return PlexServerTestResponse(
                ok=False,
                configured_url=url,
                ssl_verify_enabled=ssl_on,
                error_detail=(
                    f"Connection failed: {exc}. From Docker try the server's LAN IP:32400, "
                    "or host.docker.internal:32400 on Docker Desktop.",
                ),
            )
        except Exception as exc:  # noqa: BLE001
            return PlexServerTestResponse(
                ok=False,
                configured_url=url,
                ssl_verify_enabled=ssl_on,
                error_detail=f"{type(exc).__name__}: {exc}",
            )

        music_titles = [s.title for s in server.library.sections() if isinstance(s, MusicSection)]
        if not music_titles:
            return PlexServerTestResponse(
                ok=False,
                configured_url=url,
                friendly_name=getattr(server, "friendlyName", None),
                music_library_sections=[],
                ssl_verify_enabled=ssl_on,
                error_detail=(
                    "API reached Plex, but Plex returned no Music-type libraries "
                    "(add Music in Plex Server, not only TIDAL/podcasts)."
                ),
            )

        return PlexServerTestResponse(
            ok=True,
            configured_url=url,
            friendly_name=getattr(server, "friendlyName", None),
            music_library_sections=music_titles,
            ssl_verify_enabled=ssl_on,
            error_detail=None,
        )

    @staticmethod
    def _subtitle(item: object) -> str | None:
        gp = getattr(item, "grandparentTitle", None)
        p = getattr(item, "parentTitle", None)
        if gp and p:
            return f"{gp} — {p}"
        if gp:
            return str(gp)
        if p:
            return str(p)
        leaf = getattr(item, "leafCount", None)
        if leaf:
            return f"{leaf} tracks"
        return None

    def _item_to_media(self, item: object, kind: str) -> MediaItem:
        rk = getattr(item, "ratingKey", None)
        title = getattr(item, "title", None) or "Untitled"
        return MediaItem(
            id=str(rk),
            title=title,
            subtitle=self._subtitle(item),
            type=kind,
        )

    def _music_sections(self, server: PlexServer) -> list[MusicSection]:
        sections: list[MusicSection] = []
        for section in server.library.sections():
            if isinstance(section, MusicSection):
                sections.append(section)
        return sections

    def get_media(self, media_kind: str, token: str, conn: PlexConn) -> list[MediaItem]:
        server = self.connect_server(token, conn)
        kind = media_kind.lower()
        if kind == "playlist":
            playlists = server.playlists(playlistType="audio") or []
            return [self._item_to_media(pl, "playlist") for pl in playlists[: self._media_limit]]

        sections = self._music_sections(server)
        if not sections:
            raise ValueError("No Plex music libraries found. Add a Music library in Plex.")

        libtype_map = {"album": "album", "artist": "artist", "track": "track"}
        if kind not in libtype_map:
            raise ValueError(f"Unsupported media kind: {media_kind!r}")
        libtype = libtype_map[kind]

        items: list[MediaItem] = []
        for section in sections:
            chunk = self._media_limit - len(items)
            if chunk <= 0:
                break
            try:
                found = section.search(libtype=libtype, sort="titleSort", maxresults=chunk)
            except Exception:  # noqa: BLE001
                continue
            for row in found:
                items.append(self._item_to_media(row, libtype))
                if len(items) >= self._media_limit:
                    return items
        return items

    def get_collections(self, token: str, conn: PlexConn) -> list[CollectionItem]:
        server = self.connect_server(token, conn)
        sections = self._music_sections(server)
        if not sections:
            raise ValueError("No Plex music libraries found.")

        cols: list[CollectionItem] = []
        seen: set[int] = set()
        remaining = self._media_limit
        for section in sections:
            try:
                for coll in section.collections(sort="titleSort", maxresults=remaining):
                    if coll.subtype not in ("album", None):
                        continue
                    key = getattr(coll, "ratingKey", None)
                    if key is None or key in seen:
                        continue
                    seen.add(key)
                    cols.append(CollectionItem(id=str(key), title=coll.title))
                    remaining -= 1
                    if remaining <= 0:
                        return cols
            except Exception:  # noqa: BLE001
                continue
        return cols

    def get_random_album(self, collection_id: str, token: str, conn: PlexConn) -> MediaItem:
        server = self.connect_server(token, conn)
        try:
            coll = server.fetchItem(int(collection_id))
        except (ValueError, NotFound) as exc:
            raise ValueError(f"Unknown collection id: {collection_id!r}") from exc

        try:
            candidates = list(coll.items())
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"Unable to load collection contents: {exc}") from exc

        albums = []
        for child in candidates:
            ctype = (getattr(child, "type", "") or "").lower()
            ctype2 = getattr(child, "TYPE", "")
            ctype2_lower = ctype2.lower() if isinstance(ctype2, str) else ""
            if ctype == "album" or ctype2_lower == "album":
                albums.append(child)
        picks = albums or candidates
        if not picks:
            raise ValueError("Selected collection has no playable albums.")
        return self._item_to_media(random.choice(picks), "album")

    def _tracks_preview_from_iter(self, children: object, cap: int) -> list[MediaItem]:
        """Collect up to `cap` tracks without loading the full Plex children list into memory."""
        out: list[MediaItem] = []
        for child in children:
            if len(out) >= cap:
                break
            ctype = (getattr(child, "type", "") or "").lower()
            if ctype != "track":
                continue
            out.append(self._item_to_media(child, "track"))
        return out

    def get_tracks_for_parent(
        self,
        parent_id: str,
        family: str,
        token: str,
        conn: PlexConn,
        *,
        limit: int = 50,
        request_timeout: float = 10,
    ) -> list[MediaItem]:
        """Return up to `limit` tracks (capped at 50) for a playlist, album, or artist."""
        fam = family.lower()
        if fam not in ("playlist", "album", "artist"):
            raise ValueError(f"Unsupported family: {family!r} (use playlist, album, or artist).")
        cap = max(1, min(int(limit), 50))
        try:
            rk = int(str(parent_id).strip())
        except ValueError as exc:
            raise ValueError(f"Invalid parent id: {parent_id!r}") from exc

        server = self.connect_server(token, conn, request_timeout=float(request_timeout))
        try:
            item = server.fetchItem(rk)
        except NotFound as exc:
            raise ValueError(f"Plex library item not found: {rk}") from exc

        raw_type = (getattr(item, "type", "") or "").lower()
        if raw_type != fam:
            raise ValueError(f"Item is {raw_type!r}, expected {fam!r}.")

        if fam == "playlist":
            pt = (getattr(item, "playlistType", None) or "").lower()
            if pt and pt != "audio":
                raise ValueError("Only audio playlists can list tracks here.")
            try:
                children = item.items()
            except Exception as exc:  # noqa: BLE001
                raise ValueError(f"Unable to load playlist items: {exc}") from exc
        else:
            tracks_fn = getattr(item, "tracks", None)
            if not callable(tracks_fn):
                raise ValueError(f"{fam.title()} has no track listing.")
            try:
                children = tracks_fn()
            except Exception as exc:  # noqa: BLE001
                raise ValueError(f"Unable to load {fam} tracks: {exc}") from exc

        return self._tracks_preview_from_iter(children, cap)

    @staticmethod
    def _try_section_search(section: MusicSection, libtype: str, maxresults: int = 25, **kwargs: object) -> list:
        try:
            return list(section.search(libtype=libtype, maxresults=maxresults, **kwargs))
        except Exception:  # noqa: BLE001
            return []

    def _search_albums_merged(self, sections: list[MusicSection], q: str, *, max_out: int = 20) -> list[MediaItem]:
        """
        Album search with better ordering for combined artist + album queries.

        Priority (lower internal score = earlier in results):
        1. Plex hub search (fuzzy / contextual whole query, e.g. "michael bad" → *Bad*).
        2. Split queries: first tokens as artist ``parentTitle``, rest as album ``title`` (all split points).
        3. Album title contains full query.
        4. Album artist ``parentTitle`` contains full query (artist-only discovery).
        """
        qn = " ".join((q or "").split())
        tokens = [t for t in qn.split() if t]
        best: dict[str, tuple[object, float]] = {}

        def consider(rows: list | None, base: float) -> None:
            for i, row in enumerate(rows or []):
                if (getattr(row, "type", "") or "").lower() != "album":
                    continue
                rk = getattr(row, "ratingKey", None)
                sid = str(rk) if rk is not None else ""
                if not sid:
                    continue
                score = base + i * 0.02
                if sid not in best or score < best[sid][1]:
                    best[sid] = (row, score)

        for section in sections:
            try:
                hub_rows = section.hubSearch(qn, mediatype="album", limit=40)
            except Exception:  # noqa: BLE001
                hub_rows = []
            consider(list(hub_rows or []), 0.0)

            if len(tokens) >= 2:
                for split_at in range(1, len(tokens)):
                    artist_guess = " ".join(tokens[:split_at])
                    album_guess = " ".join(tokens[split_at:])
                    if len(artist_guess) < 2 or len(album_guess) < 1:
                        continue
                    rows = self._try_section_search(section, "album", 25, title=album_guess, parentTitle=artist_guess)
                    # Prefer splits that assign more words to the artist (e.g. "michael jackson" + "bad").
                    tier = 1.0 + (len(tokens) - split_at) * 0.001
                    consider(rows, tier)

            consider(self._try_section_search(section, "album", 30, title=qn), 5.0)
            consider(self._try_section_search(section, "album", 30, parentTitle=qn), 10.0)

        ranked = sorted(best.values(), key=lambda pair: pair[1])
        return [self._item_to_media(row, "album") for row, _ in ranked[:max_out]]

    def _search_tracks_merged(self, sections: list[MusicSection], q: str, *, max_out: int = 20) -> list[MediaItem]:
        """
        Track search with better ordering for combined artist + title queries.

        Priority (lower internal score = earlier in results):
        1. Plex hub search (fuzzy whole query, e.g. "michael bad" → *Bad* track).
        2. Split queries: leading tokens as ``grandparentTitle`` (artist), rest as track ``title``.
        3. Track ``title`` contains full query.
        4. ``grandparentTitle`` contains full query (artist-only discovery).
        """
        qn = " ".join((q or "").split())
        tokens = [t for t in qn.split() if t]
        best: dict[str, tuple[object, float]] = {}

        def consider(rows: list | None, base: float) -> None:
            for i, row in enumerate(rows or []):
                if (getattr(row, "type", "") or "").lower() != "track":
                    continue
                rk = getattr(row, "ratingKey", None)
                sid = str(rk) if rk is not None else ""
                if not sid:
                    continue
                score = base + i * 0.02
                if sid not in best or score < best[sid][1]:
                    best[sid] = (row, score)

        for section in sections:
            try:
                hub_rows = section.hubSearch(qn, mediatype="track", limit=40)
            except Exception:  # noqa: BLE001
                hub_rows = []
            consider(list(hub_rows or []), 0.0)

            if len(tokens) >= 2:
                for split_at in range(1, len(tokens)):
                    artist_guess = " ".join(tokens[:split_at])
                    track_guess = " ".join(tokens[split_at:])
                    if len(artist_guess) < 2 or len(track_guess) < 1:
                        continue
                    rows = self._try_section_search(
                        section, "track", 25, title=track_guess, grandparentTitle=artist_guess
                    )
                    tier = 1.0 + (len(tokens) - split_at) * 0.001
                    consider(rows, tier)

            consider(self._try_section_search(section, "track", 30, title=qn), 5.0)
            consider(self._try_section_search(section, "track", 30, grandparentTitle=qn), 10.0)

        ranked = sorted(best.values(), key=lambda pair: pair[1])
        return [self._item_to_media(row, "track") for row, _ in ranked[:max_out]]

    def search_music(self, family: str, query: str, token: str, conn: PlexConn) -> list[MediaItem]:
        q = (query or "").strip()
        if len(q) < 2:
            return []
        family = family.lower()
        libtype_map = {"album": "album", "artist": "artist", "track": "track"}
        if family not in libtype_map:
            raise ValueError(f"Unsupported search family: {family!r}")
        libtype = libtype_map[family]
        server = self.connect_server(token, conn)
        sections = self._music_sections(server)
        if not sections:
            raise ValueError("No Plex music libraries found. Add a Music library in Plex.")

        if family == "album":
            return self._search_albums_merged(sections, q, max_out=20)

        if family == "track":
            return self._search_tracks_merged(sections, q, max_out=20)

        seen: set[str] = set()
        out: list[MediaItem] = []
        for section in sections:
            rows = self._try_section_search(section, libtype, 30, title=q)
            for row in rows:
                sid = str(getattr(row, "ratingKey", "") or "")
                if not sid or sid in seen:
                    continue
                seen.add(sid)
                out.append(self._item_to_media(row, libtype))
                if len(out) >= 20:
                    return out
        return out

    def get_music_suggestions(self, family: str, token: str, conn: PlexConn) -> MediaSuggestionsResponse:
        family = family.lower()
        libtype_map = {"album": "album", "artist": "artist", "track": "track"}
        if family not in libtype_map:
            raise ValueError(f"Unsupported suggestions family: {family!r}")
        libtype = libtype_map[family]
        server = self.connect_server(token, conn)
        sections = self._music_sections(server)
        if not sections:
            raise ValueError("No Plex music libraries found. Add a Music library in Plex.")

        def merge_unique(row_supplier: object, cap: int = 10) -> list[MediaItem]:
            seen_u: set[str] = set()
            acc: list[MediaItem] = []
            for section in sections:
                rows = row_supplier(section)
                for row in rows or []:
                    sid = str(getattr(row, "ratingKey", "") or "")
                    if not sid or sid in seen_u:
                        continue
                    seen_u.add(sid)
                    acc.append(self._item_to_media(row, libtype))
                    if len(acc) >= cap:
                        return acc
            return acc

        def most_for_section(section: MusicSection) -> list:
            for sort in ("viewCount:desc", "lastViewedAt:desc", "lastRatedAt:desc", "addedAt:desc"):
                rows = self._try_section_search(section, libtype, 20, sort=sort)
                if rows:
                    return rows
            return self._try_section_search(section, libtype, 20, sort="titleSort")

        def unplayed_for_section(section: MusicSection) -> list:
            rows = self._try_section_search(section, libtype, 20, unwatched=True)
            if rows:
                return rows
            for kwargs in (
                {"lastViewedAt__lte": "1970-01-02"},
                {"viewCount__lte": 0},
            ):
                rows = self._try_section_search(section, libtype, 20, **kwargs)
                if rows:
                    return rows
            return []

        def random_for_section(section: MusicSection) -> list:
            rows = self._try_section_search(section, libtype, 40, sort="random")
            if rows:
                return rows
            pool = self._try_section_search(section, libtype, min(120, self._media_limit), sort="titleSort")
            pl = list(pool)
            random.shuffle(pl)
            return pl

        return MediaSuggestionsResponse(
            most_played=merge_unique(most_for_section, 10),
            unplayed=merge_unique(unplayed_for_section, 10),
            random=merge_unique(random_for_section, 10),
        )

    def thumb_path_for_item(self, rating_key: int, token: str, conn: PlexConn) -> str | None:
        """Return a thumb URL fragment or absolute URL suitable for fetch_thumb_bytes."""
        server = self.connect_server(token, conn)
        try:
            item = server.fetchItem(rating_key)
        except (ValueError, NotFound):
            return None
        for attr in ("thumb", "composite", "parentThumb", "grandparentThumb"):
            raw = getattr(item, attr, None)
            if isinstance(raw, str):
                s = raw.strip()
                if s:
                    return s
        return None

    def _plex_thumb_request_url(self, stored: str, token: str, conn: PlexConn) -> str:
        stored = (stored or "").strip()
        if not stored:
            raise ValueError("empty thumb path")
        if stored.startswith("http://") or stored.startswith("https://"):
            if "X-Plex-Token" in stored:
                return stored
            sep = "&" if "?" in stored else "?"
            return f"{stored}{sep}{urlencode({'X-Plex-Token': token})}"
        base = conn.base_url.strip().rstrip("/")
        path = stored if stored.startswith("/") else f"/{stored}"
        return f"{base}{path}?{urlencode({'X-Plex-Token': token})}"

    def fetch_thumb_bytes(self, stored_thumb: str, token: str, conn: PlexConn) -> tuple[bytes, str]:
        """GET cover image bytes from PMS (relative path or full URL)."""
        url = self._plex_thumb_request_url(stored_thumb, token, conn)
        session = self._make_server_session(conn.ssl_verify)
        response = session.get(url, timeout=30)
        response.raise_for_status()
        raw_ct = response.headers.get("Content-Type") or "image/jpeg"
        media_type = raw_ct.split(";")[0].strip()
        return response.content, media_type

    @staticmethod
    def _rating_key_id(item: object) -> str:
        """Stable string id for API responses; Plex TIDAL items often have NaN ratingKey → ``nan``."""
        rk = getattr(item, "ratingKey", None)
        if rk is None:
            return ""
        if isinstance(rk, float) and math.isnan(rk):
            return "nan"
        text = str(rk).strip()
        if text.lower() == "nan":
            return "nan"
        return text

    @staticmethod
    def _is_tidal_track(item: object) -> bool:
        """TIDAL items in Plex often lack a library ratingKey (serialized as id ``nan``)."""
        if PlexService._rating_key_id(item) == "nan":
            return True
        guid = (getattr(item, "guid", None) or "").lower()
        if "tidal" in guid:
            return True
        guids = getattr(item, "guids", None)
        if guids:
            for entry in guids:
                gid = (getattr(entry, "id", None) or "").lower()
                if "tidal" in gid:
                    return True
        for media in getattr(item, "media", []) or []:
            for part in getattr(media, "parts", []) or []:
                for attr in ("key", "file", "decision"):
                    val = (getattr(part, attr, None) or "").lower()
                    if "tidal" in val:
                        return True
        source = (getattr(item, "sourceTitle", None) or getattr(item, "source", None) or "").lower()
        return "tidal" in source

    @staticmethod
    def _track_dedup_key(item: object) -> str:
        rid = PlexService._rating_key_id(item)
        if rid and rid != "nan":
            return rid
        guid = (getattr(item, "guid", None) or "").strip()
        if guid:
            return f"guid:{guid}"
        pl_item = getattr(item, "playlistItemID", None)
        if pl_item is not None:
            return f"playlistItem:{pl_item}"
        title = (getattr(item, "title", None) or "").strip()
        return f"title:{title}"

    @staticmethod
    def _playlist_item_sort_key(item: object) -> int:
        pl_item_id = getattr(item, "playlistItemID", None)
        try:
            return int(pl_item_id)
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _remove_playlist_items(playlist: Playlist, items: list[object]) -> None:
        """Delete playlist rows by playlistItemID (highest id first so Plex does not renumber mid-run)."""
        ordered = sorted(items, key=PlexService._playlist_item_sort_key, reverse=True)
        for item in ordered:
            pl_item_id = getattr(item, "playlistItemID", None)
            if pl_item_id is None:
                title = getattr(item, "title", None) or "track"
                raise ValueError(f'No playlistItemID for "{title}"; cannot remove from playlist.')
            key = f"{playlist.key}/items/{pl_item_id}"
            playlist._server.query(key, method=playlist._server._session.delete)

    def _collect_tidal_playlist_tracks(self, playlist: Playlist) -> list[object]:
        try:
            children = list(playlist.items())
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"Unable to load playlist items: {exc}") from exc
        tidal: list[object] = []
        for child in children:
            if (getattr(child, "type", "") or "").lower() != "track":
                continue
            if not self._is_tidal_track(child):
                continue
            tidal.append(child)
        return tidal

    def _track_to_tidal_read(
        self,
        track: object,
        *,
        playlist_id: str | None = None,
        library_section: str | None = None,
    ) -> TidalTrackRead:
        pl_item = getattr(track, "playlistItemID", None)
        return TidalTrackRead(
            id=self._rating_key_id(track) or "nan",
            title=getattr(track, "title", None) or "Untitled",
            subtitle=self._subtitle(track),
            playlist_id=playlist_id,
            playlist_item_id=str(pl_item) if pl_item is not None else None,
            guid=getattr(track, "guid", None),
            library_section=library_section,
        )

    def _parse_rating_key(self, raw_id: str, *, label: str = "id") -> int:
        try:
            return int(str(raw_id).strip())
        except ValueError as exc:
            raise ValueError(f"Invalid {label}: {raw_id!r}") from exc

    def _fetch_audio_playlist(self, server: PlexServer, playlist_id: str) -> Playlist:
        rk = self._parse_rating_key(playlist_id, label="playlist_id")
        try:
            item = server.fetchItem(rk)
        except NotFound as exc:
            raise ValueError(f"Plex playlist not found: {rk}") from exc
        if not isinstance(item, Playlist):
            raise ValueError(f"Item {rk} is not a playlist.")
        pt = (getattr(item, "playlistType", None) or "").lower()
        if pt and pt != "audio":
            raise ValueError("Only audio playlists are supported.")
        return item

    def list_tidal_tracks_in_playlist(self, playlist_id: str, token: str, conn: PlexConn) -> list[TidalTrackRead]:
        server = self.connect_server(token, conn)
        playlist = self._fetch_audio_playlist(server, playlist_id)
        playlist.reload()
        pid = str(getattr(playlist, "ratingKey", playlist_id))
        return [
            self._track_to_tidal_read(child, playlist_id=pid)
            for child in self._collect_tidal_playlist_tracks(playlist)
        ]

    def delete_tidal_tracks_in_playlist(
        self,
        playlist_id: str,
        token: str,
        conn: PlexConn,
    ) -> TidalTracksDeleteResponse:
        """Remove every TIDAL track from the audio playlist (playlist id only; no request body)."""
        server = self.connect_server(token, conn)
        playlist = self._fetch_audio_playlist(server, playlist_id)
        if playlist.smart:
            raise ValueError("Cannot remove tracks from a smart playlist.")
        playlist.reload()
        tidal = self._collect_tidal_playlist_tracks(playlist)

        if not tidal:
            return TidalTracksDeleteResponse(removed_count=0, removed_ids=[])

        removed_ids = [self._rating_key_id(t) or "nan" for t in tidal]
        removed_playlist_item_ids = [
            str(getattr(t, "playlistItemID"))
            for t in tidal
            if getattr(t, "playlistItemID", None) is not None
        ]
        try:
            self._remove_playlist_items(playlist, tidal)
        except BadRequest as exc:
            raise ValueError(str(exc)) from exc
        return TidalTracksDeleteResponse(
            removed_count=len(removed_ids),
            removed_ids=removed_ids,
            removed_playlist_item_ids=removed_playlist_item_ids,
        )

    def list_server_tidal_tracks(
        self,
        token: str,
        conn: PlexConn,
        *,
        limit: int = 500,
        offset: int = 0,
    ) -> ServerTidalTracksResponse:
        """Scan Music libraries for TIDAL tracks (best-effort; capped by limit/offset)."""
        cap = max(1, min(int(limit), self._media_limit))
        off = max(0, int(offset))
        server = self.connect_server(token, conn)
        sections = self._music_sections(server)
        if not sections:
            raise ValueError("No Plex music libraries found.")

        seen: set[str] = set()
        items: list[TidalTrackRead] = []
        scanned: list[str] = []
        skipped = 0
        truncated = False
        batch = 100

        for section in sections:
            scanned.append(section.title)
            start = 0
            while True:
                try:
                    rows = section.search(
                        libtype="track",
                        maxresults=batch,
                        container_start=start,
                        container_size=batch,
                    )
                except Exception:  # noqa: BLE001
                    break
                if not rows:
                    break
                for row in rows:
                    if (getattr(row, "type", "") or "").lower() != "track":
                        continue
                    if not self._is_tidal_track(row):
                        continue
                    rk = self._track_dedup_key(row)
                    if not rk or rk in seen:
                        continue
                    seen.add(rk)
                    if skipped < off:
                        skipped += 1
                        continue
                    items.append(self._track_to_tidal_read(row, library_section=section.title))
                    if len(items) >= cap:
                        truncated = True
                        break
                if truncated or len(rows) < batch:
                    break
                start += batch
            if truncated:
                break

        note = (
            "Scans Music library sections only; TIDAL items that exist only inside playlists "
            "may be missing. Use the playlist TIDAL endpoints for playlist-specific cleanup."
        )
        return ServerTidalTracksResponse(
            items=items,
            truncated=truncated,
            offset=off,
            limit=cap,
            scanned_sections=scanned,
            note=note,
        )
