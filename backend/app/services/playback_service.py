from __future__ import annotations

from urllib.parse import urlparse

import requests.exceptions as requests_exc
from plexapi.exceptions import NotFound

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import PlexampPlayer, SonosGroupPreset
from app.schemas.domain import PlayRequest, PlayResponse
from app.services.plex_service import PlexService
from app.services.plexamp_client import append_type_if_missing, build_server_playback_uri, create_play_queue, parse_pms_host_port_protocol
from app.services.runtime_setup import resolve_plex_conn


class PlaybackService:
    def __init__(self, plex_service: PlexService | None = None) -> None:
        self._plex = plex_service or PlexService()

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
                details="Plex Media Server URL is empty; configure it under Setup (or PLEX_SERVER_URL).",
            )

        raw_host = (player.host or "").strip()
        if raw_host.startswith(("http://", "https://")):
            parsed = urlparse(raw_host)
            if not parsed.hostname:
                return PlayResponse(status="error", details="Plexamp player host URL is invalid")
            scheme = parsed.scheme if parsed.scheme in ("http", "https") else "http"
            port = player.port or parsed.port or 32500
            plexamp_base = f"{scheme}://{parsed.hostname}:{port}"
        else:
            scheme = "https" if player.port == 443 else "http"
            plexamp_base = f"{scheme}://{raw_host}:{player.port or 32500}"

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

        if effective_type == "artist":
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
            libtype = getattr(item, "type", None) or ""
            library_key = append_type_if_missing(item.key or "", libtype)

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

        title = getattr(item, "title", "") or getattr(item, "tag", "") or payload.media_id
        details = (
            f"Plexamp playing {effective_type}: {title!r} via {player.name} "
            f"(speakers tracked for UI only: {speaker_note})"
        )
        return PlayResponse(status="ok", details=details)
