from __future__ import annotations

import random
from urllib.parse import urlencode

import requests
import requests.exceptions as requests_exc
from plexapi import BASE_HEADERS
from plexapi import utils as plex_utils
from plexapi.exceptions import NotFound, Unauthorized
from plexapi.library import MusicSection
from plexapi.myplex import MyPlexAccount
from plexapi.server import PlexServer

from app.core.config import settings
from app.schemas.domain import CollectionItem, MediaItem, PlexAuthStartResponse, PlexServerTestResponse
from app.services.runtime_setup import PlexConn


class PlexTvHttpError(RuntimeError):
    """Plex.tv pin / OAuth HTTP layer.error."""


class PlexService:
    def __init__(self) -> None:
        self._media_limit = settings.plex_media_limit

    def _make_server_session(self, ssl_verify: bool) -> requests.Session:
        if not ssl_verify:
            try:
                import urllib3

                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            except Exception:  # noqa: BLE001
                pass
        session = requests.Session()
        session.verify = ssl_verify
        return session

    def _plex_tv_headers(self) -> dict[str, str]:
        headers = BASE_HEADERS.copy()
        headers["X-Plex-Client-Identifier"] = settings.plex_client_identifier
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

    def connect_server(self, token: str, conn: PlexConn) -> PlexServer:
        base = conn.base_url.strip().rstrip("/")
        if not base:
            raise ValueError(
                "Plex Media Server URL is empty. Set it under Setup (or PLEX_SERVER_URL in the environment).",
            )
        session = self._make_server_session(conn.ssl_verify)
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
                    "Plex Media Server URL is empty. Set it under Setup, or configure PLEX_SERVER_URL for the API process."
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
