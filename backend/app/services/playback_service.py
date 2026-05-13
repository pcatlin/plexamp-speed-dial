from __future__ import annotations

import re
from urllib.parse import urlparse

import logging
import requests.exceptions as requests_exc
from plexapi.exceptions import NotFound

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import PlexampPlayer, SonosGroupPreset
from app.schemas.domain import PlayRequest, PlayResponse
from app.services.plex_service import PlexService
from app.services.plexamp_client import (
    append_type_if_missing,
    build_server_playback_uri,
    create_play_queue,
    parse_pms_host_port_protocol,
    plexamp_playback_command,
)
from app.services.runtime_setup import resolve_plex_conn, resolve_sonos_runtime
from app.services.sonos_service import SonosService

_log = logging.getLogger(__name__)

# Plex artist station keys look like: /library/metadata/{id}/station/{uuid}?type=10
_STATION_UUID_RE = re.compile(
    r"/station/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})(?:\?|$|/)",
)


def _extract_station_uuid_from_key(station_key: str) -> str | None:
    m = _STATION_UUID_RE.search((station_key or "").strip())
    return m.group(1) if m else None


class PlaybackService:
    def __init__(
        self,
        plex_service: PlexService | None = None,
        sonos_service: SonosService | None = None,
    ) -> None:
        self._plex = plex_service or PlexService()
        self._sonos = sonos_service or SonosService()

    @staticmethod
    def _plexamp_base_for_player(player: PlexampPlayer) -> tuple[str | None, str | None]:
        """Return ``(base_url, error_message)`` for the Plexamp companion HTTP API."""
        raw_host = (player.host or "").strip()
        if not raw_host:
            return None, "Plexamp player host is empty."
        if raw_host.startswith(("http://", "https://")):
            parsed = urlparse(raw_host)
            if not parsed.hostname:
                return None, "Plexamp player host URL is invalid"
            scheme = parsed.scheme if parsed.scheme in ("http", "https") else "http"
            port = player.port or parsed.port or 32500
            return f"{scheme}://{parsed.hostname}:{port}", None
        scheme = "https" if player.port == 443 else "http"
        return f"{scheme}://{raw_host}:{player.port or 32500}", None

    def play(self, payload: PlayRequest, db: Session, *, auth_token: str) -> PlayResponse:
        player = db.get(PlexampPlayer, payload.player_id)
        if not player:
            return PlayResponse(status="error", details="Selected Plexamp player not found")

        target_speakers = payload.speaker_ids
        if payload.preset_id:
            preset = db.get(SonosGroupPreset, payload.preset_id)
            if not preset:
                return PlayResponse(status="error", details="Sonos preset not found")
            target_speakers = preset.speaker_ids

        speaker_note = ", ".join(target_speakers) if target_speakers else "none selected"

        plex_conn = resolve_plex_conn(db)
        server_url = plex_conn.base_url.strip().rstrip("/")
        if not server_url:
            return PlayResponse(
                status="error",
                details="Plex Media Server URL is empty; configure it under Setup.",
            )

        plexamp_base, perr = self._plexamp_base_for_player(player)
        if not plexamp_base:
            return PlayResponse(status="error", details=perr or "Invalid Plexamp URL")

        try:
            rating_key = int(str(payload.media_id).strip())
        except ValueError:
            return PlayResponse(status="error", details=f"Invalid media id: {payload.media_id!r}")

        try:
            pms = self._plex.connect_server(auth_token, plex_conn)
        except ValueError as exc:
            return PlayResponse(status="error", details=str(exc))

        effective_type = payload.media_type
        if effective_type == "random_album":
            effective_type = "album"

        try:
            item = pms.fetchItem(rating_key)
        except NotFound:
            return PlayResponse(status="error", details=f"Plex library item not found: {rating_key}")
        except Exception as exc:  # noqa: BLE001
            return PlayResponse(status="error", details=f"Plex lookup failed: {exc}")

        if effective_type == "track":
            track_key = ((getattr(item, "key", None) or "").strip().split("?", 1)[0]).rstrip("/")
            if not track_key:
                return PlayResponse(status="error", details="Track has no library path for playback.")
            try:
                artist = item.artist()
            except Exception as exc:  # noqa: BLE001
                return PlayResponse(status="error", details=f"Could not resolve track artist: {exc}")
            station_builder = getattr(artist, "station", None)
            if not callable(station_builder):
                return PlayResponse(
                    status="error",
                    details="Artist metadata has no radio station; cannot start track radio.",
                )
            try:
                station = station_builder()
            except Exception as exc:  # noqa: BLE001
                return PlayResponse(status="error", details=f"Could not load artist radio for track radio: {exc}")
            if station is None:
                return PlayResponse(
                    status="error",
                    details="Artist has no Plex radio station (required for track radio).",
                )
            station_key = (getattr(station, "key", None) or "").strip()
            artist_uuid = _extract_station_uuid_from_key(station_key)
            if not artist_uuid:
                return PlayResponse(
                    status="error",
                    details="Could not parse station id from artist radio for track radio.",
                )
            library_key = f"{track_key}/station/{artist_uuid}"
        elif effective_type == "artist":
            if payload.artist_radio:
                station_builder = getattr(item, "station", None)
                if not callable(station_builder):
                    return PlayResponse(status="error", details="This media item cannot start an artist radio station.")
                station = station_builder()
                if station is None:
                    return PlayResponse(
                        status="error",
                        details="Artist has no Plex radio station (or station metadata could not be loaded).",
                    )
                library_key = station.key
            else:
                libtype = (getattr(item, "type", None) or "artist").lower()
                raw_key = item.key or ""
                if not raw_key.strip():
                    return PlayResponse(status="error", details="Artist item has no library path for playback.")
                library_key = append_type_if_missing(raw_key, libtype)
        else:
            libtype = (getattr(item, "type", None) or "").lower()
            raw_key = item.key or ""
            # Playlists: keep `/playlist/{id}` as-is; do not append search type=15 (breaks Plexamp).
            if libtype == "playlist":
                library_key = raw_key
            else:
                library_key = append_type_if_missing(raw_key, libtype)

        shuffle_flag = 1 if (payload.shuffle and effective_type in ("playlist", "artist")) else 0

        uri = build_server_playback_uri(
            machine_identifier=pms.machineIdentifier,
            library_identifier=pms.library.identifier,
            library_key=library_key,
        )

        pms_host, pms_port, pms_protocol = parse_pms_host_port_protocol(plex_conn.base_url.strip().rstrip("/"))

        try:
            response = create_play_queue(
                plexamp_base=plexamp_base,
                server_uri=uri,
                token=auth_token,
                pms_address=pms_host,
                pms_port=pms_port,
                pms_protocol=pms_protocol,
                timeout=settings.plexamp_request_timeout_seconds,
                shuffle=shuffle_flag,
            )
        except requests_exc.RequestException as exc:
            return PlayResponse(
                status="error",
                details=f"Plexamp at {plexamp_base} did not accept playback: {exc}",
            )

        if response.status_code != 200:
            snippet = (response.text or "")[:280]
            return PlayResponse(
                status="error",
                details=(
                    f"Plexamp createPlayQueue failed (HTTP {response.status_code}). "
                    f"{snippet or 'Empty response body'}"
                ),
            )

        sonos_note = ""
        if target_speakers:
            try:
                runtime = resolve_sonos_runtime(db)
                sonos_note = self._sonos.group_selected_and_play_line_in(runtime, target_speakers)
            except Exception as exc:  # noqa: BLE001
                _log.exception("Sonos line-in orchestration failed")
                sonos_note = f"Sonos error: {exc}"

        title = getattr(item, "title", "") or getattr(item, "tag", "") or payload.media_id
        if target_speakers:
            tail = sonos_note if sonos_note else f"Sonos: no line-in action ({speaker_note})."
        else:
            tail = "No Sonos outputs selected."
        play_kind = effective_type
        if effective_type == "track":
            play_kind = "track radio"
        elif effective_type == "artist":
            play_kind = "artist radio" if payload.artist_radio else "artist library"
        if shuffle_flag:
            play_kind = f"{play_kind} (shuffled)"
        details = f"Plexamp playing {play_kind}: {title!r} via {player.name}. {tail}"
        return PlayResponse(status="ok", details=details)

    def _plexamp_playback_simple(
        self,
        player_id: int,
        db: Session,
        *,
        auth_token: str,
        action: str,
        ok_details: str,
    ) -> PlayResponse:
        player = db.get(PlexampPlayer, player_id)
        if not player:
            return PlayResponse(status="error", details="Selected Plexamp player not found")
        plexamp_base, perr = self._plexamp_base_for_player(player)
        if not plexamp_base:
            return PlayResponse(status="error", details=perr or "Invalid Plexamp URL")
        try:
            response = plexamp_playback_command(
                plexamp_base=plexamp_base,
                token=auth_token,
                action=action,
                timeout=settings.plexamp_request_timeout_seconds,
            )
        except requests_exc.RequestException as exc:
            return PlayResponse(status="error", details=f"Plexamp {action} failed: {exc}")
        if response.status_code != 200:
            snippet = (response.text or "")[:280]
            return PlayResponse(
                status="error",
                details=f"Plexamp {action} returned HTTP {response.status_code}. {snippet or 'Empty response body'}",
            )
        return PlayResponse(status="ok", details=f"{ok_details} ({player.name}).")

    def plexamp_skip_next(self, player_id: int, db: Session, *, auth_token: str) -> PlayResponse:
        return self._plexamp_playback_simple(
            player_id,
            db,
            auth_token=auth_token,
            action="skipNext",
            ok_details="Skipped to next track",
        )

    def plexamp_skip_previous(self, player_id: int, db: Session, *, auth_token: str) -> PlayResponse:
        return self._plexamp_playback_simple(
            player_id,
            db,
            auth_token=auth_token,
            action="skipPrevious",
            ok_details="Skipped to previous track",
        )

    def plexamp_pause(self, player_id: int, db: Session, *, auth_token: str) -> PlayResponse:
        return self._plexamp_playback_simple(
            player_id,
            db,
            auth_token=auth_token,
            action="pause",
            ok_details="Paused playback",
        )

    def plexamp_resume(self, player_id: int, db: Session, *, auth_token: str) -> PlayResponse:
        """Resume / play current queue on headless Plexamp (companion ``play`` — no new play queue)."""
        return self._plexamp_playback_simple(
            player_id,
            db,
            auth_token=auth_token,
            action="play",
            ok_details="Resumed playback",
        )

    def sonos_stop_selected(self, speaker_ids: list[str], db: Session) -> PlayResponse:
        if not speaker_ids:
            return PlayResponse(status="error", details="Select at least one Sonos speaker, then press stop.")
        try:
            runtime = resolve_sonos_runtime(db)
            msg = self._sonos.stop_selected_speakers(runtime, speaker_ids)
        except Exception as exc:  # noqa: BLE001
            _log.exception("Sonos stop failed")
            return PlayResponse(status="error", details=f"Sonos stop failed: {exc}")
        return PlayResponse(status="ok", details=msg)

    def sonos_play_line_in_selected(self, speaker_ids: list[str], db: Session) -> PlayResponse:
        """Group selected Sonos outputs and play the configured Plexamp line-in source (no new Plex queue)."""
        if not speaker_ids:
            return PlayResponse(status="error", details="Select at least one Sonos speaker, then press play.")
        try:
            runtime = resolve_sonos_runtime(db)
            msg = self._sonos.group_selected_and_play_line_in(runtime, speaker_ids)
        except Exception as exc:  # noqa: BLE001
            _log.exception("Sonos line-in play failed")
            return PlayResponse(status="error", details=f"Sonos line-in failed: {exc}")
        return PlayResponse(status="ok", details=msg)

    def sonos_volume_adjust_selected(self, speaker_ids: list[str], delta: int, db: Session) -> PlayResponse:
        if not speaker_ids:
            return PlayResponse(status="error", details="Select at least one Sonos speaker, then change volume.")
        try:
            runtime = resolve_sonos_runtime(db)
            msg = self._sonos.adjust_volume_selected(runtime, speaker_ids, delta)
        except Exception as exc:  # noqa: BLE001
            _log.exception("Sonos volume adjust failed")
            return PlayResponse(status="error", details=f"Sonos volume failed: {exc}")
        return PlayResponse(status="ok", details=msg)
