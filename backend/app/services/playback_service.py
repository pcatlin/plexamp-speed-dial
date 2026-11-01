from __future__ import annotations

import re
import time
from urllib.parse import urlparse

import logging
import requests.exceptions as requests_exc
from plexapi.exceptions import NotFound

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import PlexampPlayer, SonosGroupPreset
from app.schemas.domain import NowPlayingTrack, PlaybackStateResponse, PlayRequest, PlayResponse
from app.services.artist_playback import (
    ORDER_MODE_LABELS,
    build_ordered_artist_server_uri,
    resolve_artist_order_mode,
)
from app.services.plexamp_client import (
    append_max_degrees_of_separation,
    append_type_if_missing,
    build_server_playback_uri,
    create_play_queue,
    parse_pms_host_port_protocol,
    plexamp_playback_command,
    plexamp_timeline_implies_playing,
    plexamp_timeline_snapshot,
)
from app.services.plex_service import PlexService
from app.services.audio_output.router import AudioOutputRouter
from app.services.runtime_setup import resolve_plex_conn, resolve_sonos_runtime
from app.services.sonos_service import SonosService

_log = logging.getLogger(__name__)

RADIO_DEFAULT_DEGREES_OF_SEPARATION = 1

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
        audio_output_router: AudioOutputRouter | None = None,
    ) -> None:
        self._plex = plex_service or PlexService()
        self._sonos = sonos_service or SonosService()
        self._audio_output = audio_output_router or AudioOutputRouter(sonos_service=self._sonos)

    @staticmethod
    def _plexamp_base_for_player(player: PlexampPlayer) -> tuple[str | None, str | None]:
        """Return ``(base_url, error_message)`` for the companion createPlayQueue HTTP API."""
        raw_host = (player.host or "").strip()
        if not raw_host:
            return None, "Player host is empty."
        if raw_host.startswith(("http://", "https://")):
            parsed = urlparse(raw_host)
            if not parsed.hostname:
                return None, "Player host URL is invalid"
            scheme = parsed.scheme if parsed.scheme in ("http", "https") else "http"
            port = player.port or parsed.port or 32500
            return f"{scheme}://{parsed.hostname}:{port}", None
        scheme = "https" if player.port == 443 else "http"
        return f"{scheme}://{raw_host}:{player.port or 32500}", None

    def _send_companion_play(self, plexamp_base: str, *, auth_token: str, timeout: float) -> bool:
        try:
            response = plexamp_playback_command(
                plexamp_base=plexamp_base,
                token=auth_token,
                action="play",
                timeout=timeout,
            )
        except requests_exc.RequestException as exc:
            _log.warning("Companion play command failed for %s: %s", plexamp_base, exc)
            return False
        if response.status_code != 200:
            _log.warning(
                "Companion play command HTTP %s for %s",
                response.status_code,
                plexamp_base,
            )
            return False
        return True

    def _companion_timeline_playing(self, plexamp_base: str, *, auth_token: str, timeout: float) -> bool:
        try:
            snap = plexamp_timeline_snapshot(
                plexamp_base=plexamp_base,
                token=auth_token,
                timeout=timeout,
            )
        except Exception:  # noqa: BLE001
            return False
        return plexamp_timeline_implies_playing(snap.state if snap else None) is True

    def _ensure_companion_playing(
        self,
        plexamp_base: str,
        *,
        auth_token: str,
        timeout: float,
    ) -> str | None:
        """
        After createPlayQueue, explicitly start playback and briefly verify timeline.

        Cold Caldera/Plexamp instances may load a queue without auto-starting. Returns an
        optional note when playing could not be confirmed (createPlayQueue still succeeded).
        """
        # Best-effort wake/identity handshake before the first play.
        try:
            plexamp_timeline_snapshot(plexamp_base=plexamp_base, token=auth_token, timeout=timeout)
        except Exception:  # noqa: BLE001
            pass

        self._send_companion_play(plexamp_base, auth_token=auth_token, timeout=timeout)

        poll_timeout = min(timeout, 3.0)
        for attempt in range(3):
            if self._companion_timeline_playing(plexamp_base, auth_token=auth_token, timeout=poll_timeout):
                return None
            if attempt == 1:
                self._send_companion_play(plexamp_base, auth_token=auth_token, timeout=timeout)
            time.sleep(0.35)

        self._send_companion_play(plexamp_base, auth_token=auth_token, timeout=timeout)
        if self._companion_timeline_playing(plexamp_base, auth_token=auth_token, timeout=poll_timeout):
            return None
        _log.warning("Companion at %s did not confirm playing after createPlayQueue", plexamp_base)
        return "Player did not confirm playing yet."

    def play(self, payload: PlayRequest, db: Session, *, auth_token: str) -> PlayResponse:
        player = db.get(PlexampPlayer, payload.player_id)
        if not player:
            return PlayResponse(status="error", details="Selected player not found")

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
            return PlayResponse(status="error", details=perr or "Invalid player URL")

        try:
            rating_key = int(str(payload.media_id).strip())
        except ValueError:
            return PlayResponse(status="error", details=f"Invalid media id: {payload.media_id!r}")

        try:
            pms = self._plex.connect_server(auth_token, plex_conn, request_timeout=10)
        except ValueError as exc:
            return PlayResponse(status="error", details=str(exc))

        effective_type = payload.media_type
        if effective_type == "random_album":
            effective_type = "album"

        artist_order_mode = None

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
            artist_order_mode = resolve_artist_order_mode(
                artist_order_mode=payload.artist_order_mode,
                shuffle=payload.shuffle,
            )
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
            elif artist_order_mode in ("album_order", "popular_order", "popular_tracks_order"):
                try:
                    uri = build_ordered_artist_server_uri(pms, item, artist_order_mode)
                except ValueError as exc:
                    return PlayResponse(status="error", details=str(exc))
                library_key = uri
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

        if effective_type == "artist":
            shuffle_flag = 1 if artist_order_mode == "shuffle" else 0
        else:
            shuffle_flag = 1 if (payload.shuffle and effective_type == "playlist") else 0

        is_radio = effective_type == "track" or (effective_type == "artist" and payload.artist_radio)
        radio_degrees = payload.radio_degrees_of_separation
        if is_radio:
            if radio_degrees is None:
                radio_degrees = RADIO_DEFAULT_DEGREES_OF_SEPARATION
            library_key = append_max_degrees_of_separation(library_key, radio_degrees)

        if effective_type == "artist" and artist_order_mode in (
            "album_order",
            "popular_order",
            "popular_tracks_order",
        ):
            uri = library_key
        else:
            uri = build_server_playback_uri(
                machine_identifier=pms.machineIdentifier,
                library_identifier=pms.library.identifier,
                library_key=library_key,
            )

        if effective_type == "track":
            play_kind = "track radio"
        elif effective_type == "artist":
            play_kind = "artist radio" if payload.artist_radio else "artist library"
            if artist_order_mode and artist_order_mode != "shuffle":
                play_kind = f"{play_kind} ({ORDER_MODE_LABELS[artist_order_mode]})"
        else:
            play_kind = effective_type
        _log.info("Playback %s media_id=%s library_key=%s", play_kind, payload.media_id, library_key)

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
                details=f"Player at {plexamp_base} did not accept playback: {exc}",
            )

        if response.status_code != 200:
            snippet = (response.text or "")[:280]
            return PlayResponse(
                status="error",
                details=(
                    f"Player createPlayQueue failed (HTTP {response.status_code}). "
                    f"{snippet or 'Empty response body'}"
                ),
            )

        start_note = self._ensure_companion_playing(
            plexamp_base,
            auth_token=auth_token,
            timeout=settings.plexamp_request_timeout_seconds,
        )

        output_note = self._audio_output.prepare_for_play(
            player,
            db,
            target_speaker_ids=target_speakers,
            initial_volumes=payload.initial_volumes,
        )

        title = getattr(item, "title", "") or getattr(item, "tag", "") or payload.media_id
        details_kind = f"{play_kind} (shuffled)" if shuffle_flag else play_kind
        parts = [f"Playing {details_kind}: {title!r} via {player.name}."]
        if start_note:
            parts.append(start_note)
        if output_note:
            parts.append(output_note)
        return PlayResponse(status="ok", details=" ".join(parts))

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
            return PlayResponse(status="error", details="Selected player not found")
        plexamp_base, perr = self._plexamp_base_for_player(player)
        if not plexamp_base:
            return PlayResponse(status="error", details=perr or "Invalid player URL")
        try:
            response = plexamp_playback_command(
                plexamp_base=plexamp_base,
                token=auth_token,
                action=action,
                timeout=settings.plexamp_request_timeout_seconds,
            )
        except requests_exc.RequestException as exc:
            return PlayResponse(status="error", details=f"Player {action} failed: {exc}")
        if response.status_code != 200:
            snippet = (response.text or "")[:280]
            return PlayResponse(
                status="error",
                details=f"Player {action} returned HTTP {response.status_code}. {snippet or 'Empty response body'}",
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

    def sonos_play_line_in_selected(self, speaker_ids: list[str], player_id: int, db: Session) -> PlayResponse:
        """Group selected Sonos outputs and play line-in for the given Plexamp player's mapping (no new Plex queue)."""
        if not speaker_ids:
            return PlayResponse(status="error", details="Select at least one Sonos speaker, then press play.")
        player = db.get(PlexampPlayer, player_id)
        if not player:
            return PlayResponse(status="error", details="Selected player not found")
        route = self._audio_output.output_for_player(player)
        if route.kind != "sonos":
            return PlayResponse(
                status="error",
                details="Selected player is not configured for Sonos line-in (check Setup).",
            )
        try:
            msg = self._audio_output.prepare_for_play(player, db, target_speaker_ids=speaker_ids)
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

    def sonos_volume_set(self, volumes: dict[str, int], db: Session) -> PlayResponse:
        if not volumes:
            return PlayResponse(status="error", details="Provide at least one speaker volume to set.")
        try:
            runtime = resolve_sonos_runtime(db)
            msg = self._sonos.set_absolute_volumes(runtime, volumes)
        except Exception as exc:  # noqa: BLE001
            _log.exception("Sonos volume set failed")
            return PlayResponse(status="error", details=f"Sonos volume failed: {exc}")
        if msg.startswith("Sonos: no "):
            return PlayResponse(status="error", details=msg)
        return PlayResponse(status="ok", details=msg)

    def sonos_playback_state(self, speaker_ids: list[str], db: Session) -> PlaybackStateResponse:
        if not speaker_ids:
            return PlaybackStateResponse(ok=True, playing=False, state=None)
        try:
            runtime = resolve_sonos_runtime(db)
            playing, err = self._sonos.selection_transport_playing(runtime, speaker_ids)
        except Exception as exc:  # noqa: BLE001
            _log.exception("Sonos playback state failed")
            return PlaybackStateResponse(ok=False, playing=None, state=None, error=str(exc))
        if err:
            return PlaybackStateResponse(ok=False, playing=None, state=None, error=err)
        return PlaybackStateResponse(ok=True, playing=playing, state=None)

    def plexamp_playback_state(self, player_id: int, db: Session, *, auth_token: str) -> PlaybackStateResponse:
        player = db.get(PlexampPlayer, player_id)
        if not player:
            return PlaybackStateResponse(ok=False, playing=None, state=None, error="Selected player not found")
        plexamp_base, perr = self._plexamp_base_for_player(player)
        if not plexamp_base:
            return PlaybackStateResponse(ok=False, playing=None, state=None, error=perr or "Invalid player URL")
        try:
            snap = plexamp_timeline_snapshot(
                plexamp_base=plexamp_base,
                token=auth_token,
                timeout=settings.plexamp_request_timeout_seconds,
            )
        except requests_exc.RequestException as exc:
            return PlaybackStateResponse(ok=False, playing=None, state=None, error=str(exc))

        raw = snap.state if snap else None
        mapped = plexamp_timeline_implies_playing(raw)
        now_playing: NowPlayingTrack | None = None
        # Keep metadata while paused; clear when stopped/idle/unknown.
        show_track = raw not in (None, "stopped", "idle", "")

        if show_track:
            title = (snap.title if snap else None) or None
            artist = (snap.artist if snap else None) or None
            album = (snap.album if snap else None) or None
            rating_key = (snap.rating_key if snap else None) or None

            if not title or not artist:
                try:
                    session_track = self._plex.now_playing_for_player(
                        auth_token,
                        resolve_plex_conn(db),
                        player_name=player.name or "",
                        player_host=player.host or "",
                    )
                except Exception:  # noqa: BLE001
                    session_track = None
                if session_track:
                    title = title or session_track.get("title")
                    artist = artist or session_track.get("artist")
                    album = album or session_track.get("album")
                    rating_key = rating_key or session_track.get("rating_key")

            if title:
                now_playing = NowPlayingTrack(
                    title=title,
                    artist=artist,
                    album=album,
                    rating_key=rating_key,
                )

        return PlaybackStateResponse(ok=True, playing=mapped, state=raw, now_playing=now_playing)
