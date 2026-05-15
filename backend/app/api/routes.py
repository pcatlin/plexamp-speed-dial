import asyncio
import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import require_plex_creds
from app.db.database import Base, SessionLocal, engine, get_db
from app.db.runtime_setup_migrate import (
    ensure_plexamp_player_sonos_line_in_column,
    ensure_runtime_setup_columns,
    ensure_runtime_setup_plex_client_identifier_column,
    ensure_speed_dial_artist_radio_column,
    ensure_speed_dial_cover_column,
    ensure_speed_dial_shuffle_column,
)
from app.models import PlexCredential, PlexampPlayer, SonosGroupPreset, SpeedDialFavorite
from app.plexapi_identity import apply_stable_plexapi_headers, log_plex_account_linked
from app.schemas.common import HealthResponse, IdResponse
from app.schemas.domain import (
    MediaItem,
    MediaSuggestionsResponse,
    PlayerControlRequest,
    PlayerCreate,
    PlayerPatch,
    PlayerRead,
    PlayRequest,
    PlayResponse,
    PlaybackStateResponse,
    PlexAuthCompleteRequest,
    PlexAuthStatusResponse,
    PlexAuthStartResponse,
    PlexPinPollResponse,
    PlexServerTestResponse,
    RuntimeSetupRead,
    RuntimeSetupUpdate,
    SonosGroupPresetCreate,
    SonosGroupPresetRead,
    SonosLineInPlayRequest,
    SonosSpeaker,
    SonosStopRequest,
    SonosVolumeAdjustRequest,
    ServerTidalTracksResponse,
    SpeedDialCreate,
    SpeedDialRead,
    TidalTrackRead,
    TidalTracksDeleteResponse,
)
from app.services.playback_service import PlaybackService
from app.services.plex_service import PlexService, PlexTvHttpError
from app.services.runtime_setup import effective_plex_url, get_or_create_runtime_setup, resolve_plex_conn, resolve_sonos_runtime
from app.services.sonos_service import SonosService

router = APIRouter()
plex_service = PlexService()
sonos_service = SonosService()
playback_service = PlaybackService()


def _fetch_playback_snapshot(speaker_ids: list[str], player_id: int | None) -> dict[str, Any]:
    """Blocking: read Sonos + Plexamp playback state (own DB session for threadpool use)."""
    db = SessionLocal()
    try:
        sonos = playback_service.sonos_playback_state(speaker_ids, db)
        if player_id is None:
            plex = PlaybackStateResponse(ok=True, playing=None, state=None)
        else:
            creds = db.query(PlexCredential).first()
            conn = resolve_plex_conn(db)
            if creds and creds.auth_token and conn.base_url.strip():
                plex = playback_service.plexamp_playback_state(player_id, db, auth_token=creds.auth_token)
            else:
                plex = PlaybackStateResponse(ok=True, playing=None, state=None)
        return {"sonos": sonos.model_dump(), "plexamp": plex.model_dump()}
    finally:
        db.close()


def _serialize_runtime_setup_read(db: Session) -> RuntimeSetupRead:
    row = get_or_create_runtime_setup(db)
    return RuntimeSetupRead(
        plex_server_url=row.plex_server_url or "",
        plex_ssl_verify=row.plex_ssl_verify,
        sonos_seed_ips=row.sonos_seed_ips or "",
        sonos_discover_timeout=row.sonos_discover_timeout,
        sonos_allow_network_scan=row.sonos_allow_network_scan,
        sonos_interface_addr=row.sonos_interface_addr or "",
        plex_server_url_effective=effective_plex_url(row.plex_server_url),
    )


@router.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_runtime_setup_columns(engine)
    ensure_runtime_setup_plex_client_identifier_column(engine)
    ensure_speed_dial_cover_column(engine)
    ensure_speed_dial_artist_radio_column(engine)
    ensure_speed_dial_shuffle_column(engine)
    ensure_plexamp_player_sonos_line_in_column(engine)
    seed = SessionLocal()
    try:
        row = get_or_create_runtime_setup(seed)
        apply_stable_plexapi_headers(row.plex_client_identifier)
    finally:
        seed.close()


@router.get("/settings/runtime", response_model=RuntimeSetupRead)
def get_runtime_settings(db: Session = Depends(get_db)) -> RuntimeSetupRead:
    return _serialize_runtime_setup_read(db)


@router.put("/settings/runtime", response_model=RuntimeSetupRead)
def update_runtime_settings(payload: RuntimeSetupUpdate, db: Session = Depends(get_db)) -> RuntimeSetupRead:
    row = get_or_create_runtime_setup(db)
    data = payload.model_dump()
    row.plex_server_url = data["plex_server_url"].strip()
    row.plex_ssl_verify = data["plex_ssl_verify"]
    row.sonos_seed_ips = data["sonos_seed_ips"].strip()
    row.sonos_discover_timeout = data["sonos_discover_timeout"]
    row.sonos_allow_network_scan = data["sonos_allow_network_scan"]
    row.sonos_interface_addr = data["sonos_interface_addr"].strip()
    row.sonos_demo_fallback = False
    db.commit()
    db.refresh(row)
    return _serialize_runtime_setup_read(db)


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@router.post("/auth/plex/start", response_model=PlexAuthStartResponse)
def plex_start() -> PlexAuthStartResponse:
    try:
        return plex_service.start_auth()
    except PlexTvHttpError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/auth/plex/pin/{pin_id}", response_model=PlexPinPollResponse)
def plex_poll_pin(pin_id: str, db: Session = Depends(get_db)) -> PlexPinPollResponse:
    """Poll OAuth PIN; when login completes, persist token and return connected."""
    try:
        token = plex_service.poll_oauth_pin(pin_id)
    except PlexTvHttpError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not token:
        return PlexPinPollResponse(status="pending", username=None)
    creds = db.query(PlexCredential).first()
    if not creds:
        creds = PlexCredential()
        db.add(creds)
    had_previous_token = bool(creds.auth_token)
    creds.auth_token = token
    creds.username = plex_service.lookup_username(token) or creds.username
    creds.is_connected = True
    db.commit()
    log_plex_account_linked(had_previous_token=had_previous_token)
    return PlexPinPollResponse(status="connected", username=creds.username)


@router.post("/auth/plex/complete", response_model=PlexAuthStatusResponse)
def plex_complete(payload: PlexAuthCompleteRequest, db: Session = Depends(get_db)) -> PlexAuthStatusResponse:
    """Dev escape hatch (mock token) or single-shot PIN poll if the token is ready."""
    creds = db.query(PlexCredential).first()
    if not creds:
        creds = PlexCredential()
        db.add(creds)
    if payload.mock_token:
        had_previous_token = bool(creds.auth_token)
        creds.auth_token = payload.mock_token
        creds.username = payload.username or creds.username or "dev"
        creds.is_connected = True
        db.commit()
        log_plex_account_linked(had_previous_token=had_previous_token)
        return PlexAuthStatusResponse(connected=True, username=creds.username)
    try:
        token = plex_service.poll_oauth_pin(payload.pin_id)
    except PlexTvHttpError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Plex login not finished yet. Approve the app in the browser, then try again.",
        )
    had_previous_token = bool(creds.auth_token)
    creds.auth_token = token
    creds.username = plex_service.lookup_username(token) or payload.username or creds.username
    creds.is_connected = True
    db.commit()
    log_plex_account_linked(had_previous_token=had_previous_token)
    return PlexAuthStatusResponse(connected=True, username=creds.username)


@router.get("/auth/plex/status", response_model=PlexAuthStatusResponse)
def plex_status(db: Session = Depends(get_db)) -> PlexAuthStatusResponse:
    creds = db.query(PlexCredential).first()
    if not creds:
        return PlexAuthStatusResponse(connected=False, username=None)
    return PlexAuthStatusResponse(connected=creds.is_connected, username=creds.username)


@router.get("/auth/plex/server-test", response_model=PlexServerTestResponse)
def plex_server_test(
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
) -> PlexServerTestResponse:
    assert creds.auth_token
    return plex_service.probe_server_connection(creds.auth_token, resolve_plex_conn(db))


@router.get(
    "/plex/utilities/audio-playlists/{playlist_id}/tidal-tracks",
    response_model=list[TidalTrackRead],
)
def plex_utilities_playlist_tidal_tracks(
    playlist_id: str,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
):
    assert creds.auth_token
    try:
        return plex_service.list_tidal_tracks_in_playlist(
            playlist_id, creds.auth_token, resolve_plex_conn(db)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete(
    "/plex/utilities/audio-playlists/{playlist_id}/tidal-tracks",
    response_model=TidalTracksDeleteResponse,
)
def plex_utilities_delete_playlist_tidal_tracks(
    playlist_id: str,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
):
    """Remove all TIDAL tracks from the audio playlist (``playlist_id`` only)."""
    assert creds.auth_token
    try:
        return plex_service.delete_tidal_tracks_in_playlist(
            playlist_id,
            creds.auth_token,
            resolve_plex_conn(db),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/plex/utilities/tidal-tracks", response_model=ServerTidalTracksResponse)
def plex_utilities_server_tidal_tracks(
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
):
    assert creds.auth_token
    try:
        return plex_service.list_server_tidal_tracks(
            creds.auth_token,
            resolve_plex_conn(db),
            limit=limit,
            offset=offset,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/media/playlists")
def media_playlists(db: Session = Depends(get_db), creds: PlexCredential = Depends(require_plex_creds)):
    assert creds.auth_token
    try:
        return plex_service.get_media("playlist", creds.auth_token, resolve_plex_conn(db))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/media/artists")
def media_artists(db: Session = Depends(get_db), creds: PlexCredential = Depends(require_plex_creds)):
    assert creds.auth_token
    try:
        return plex_service.get_media("artist", creds.auth_token, resolve_plex_conn(db))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/media/albums")
def media_albums(db: Session = Depends(get_db), creds: PlexCredential = Depends(require_plex_creds)):
    assert creds.auth_token
    try:
        return plex_service.get_media("album", creds.auth_token, resolve_plex_conn(db))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/media/tracks")
def media_tracks(db: Session = Depends(get_db), creds: PlexCredential = Depends(require_plex_creds)):
    assert creds.auth_token
    try:
        return plex_service.get_media("track", creds.auth_token, resolve_plex_conn(db))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


TRACKS_FOR_PARENT_TIMEOUT_SECONDS = 10.0


@router.get("/media/tracks-for-parent", response_model=list[MediaItem])
async def media_tracks_for_parent(
    family: Literal["playlist", "album", "artist"],
    parent_id: str,
    limit: int = Query(50, ge=1, le=50),
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
):
    assert creds.auth_token
    conn = resolve_plex_conn(db)
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(
                plex_service.get_tracks_for_parent,
                parent_id,
                family,
                creds.auth_token,
                conn,
                limit=limit,
                request_timeout=TRACKS_FOR_PARENT_TIMEOUT_SECONDS,
            ),
            timeout=TRACKS_FOR_PARENT_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Loading tracks took too long (10s). Try again or choose a smaller playlist or album.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/media/collections")
def media_collections(db: Session = Depends(get_db), creds: PlexCredential = Depends(require_plex_creds)):
    assert creds.auth_token
    try:
        return plex_service.get_collections(creds.auth_token, resolve_plex_conn(db))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/media/random-album")
def media_random_album(
    collection_id: str,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
):
    assert creds.auth_token
    try:
        return plex_service.get_random_album(collection_id, creds.auth_token, resolve_plex_conn(db))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/media/search", response_model=list[MediaItem])
def media_search(
    family: str,
    query: str = "",
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
):
    assert creds.auth_token
    fam = family.strip().lower()
    if fam not in ("album", "artist", "track"):
        raise HTTPException(status_code=400, detail="family must be album, artist, or track")
    try:
        return plex_service.search_music(fam, query, creds.auth_token, resolve_plex_conn(db))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/media/suggestions", response_model=MediaSuggestionsResponse)
def media_suggestions(
    family: str,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
):
    assert creds.auth_token
    fam = family.strip().lower()
    if fam not in ("album", "artist", "track"):
        raise HTTPException(status_code=400, detail="family must be album, artist, or track")
    try:
        return plex_service.get_music_suggestions(fam, creds.auth_token, resolve_plex_conn(db))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/media/art/{rating_key}")
def media_art(
    rating_key: int,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
) -> Response:
    assert creds.auth_token
    conn = resolve_plex_conn(db)
    path = plex_service.thumb_path_for_item(rating_key, creds.auth_token, conn)
    if not path:
        raise HTTPException(status_code=404, detail="Art not available")
    try:
        body, media_type = plex_service.fetch_thumb_bytes(path, creds.auth_token, conn)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(content=body, media_type=media_type)


@router.get("/sonos/speakers", response_model=list[SonosSpeaker])
def sonos_speakers(db: Session = Depends(get_db)) -> list[SonosSpeaker]:
    return sonos_service.list_speakers(resolve_sonos_runtime(db))


@router.get("/sonos/group-presets", response_model=list[SonosGroupPresetRead])
def get_presets(db: Session = Depends(get_db)) -> list[SonosGroupPresetRead]:
    rows = db.query(SonosGroupPreset).all()
    return [SonosGroupPresetRead(id=row.id, name=row.name, speaker_ids=row.speaker_ids) for row in rows]


@router.post("/sonos/group-presets", response_model=IdResponse)
def create_preset(payload: SonosGroupPresetCreate, db: Session = Depends(get_db)) -> IdResponse:
    row = SonosGroupPreset(name=payload.name, speaker_ids=payload.speaker_ids)
    db.add(row)
    db.commit()
    db.refresh(row)
    return IdResponse(id=row.id)


@router.delete("/sonos/group-presets/{preset_id}")
def delete_preset(preset_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.get(SonosGroupPreset, preset_id)
    if not row:
        raise HTTPException(status_code=404, detail="Preset not found")
    db.delete(row)
    db.commit()
    return {"message": "Preset deleted"}


@router.get("/players", response_model=list[PlayerRead])
def players(db: Session = Depends(get_db)) -> list[PlayerRead]:
    rows = db.query(PlexampPlayer).all()
    return [
        PlayerRead(
            id=row.id,
            name=row.name,
            host=row.host,
            port=row.port,
            is_active=row.is_active,
            sonos_line_in_speaker_id=(getattr(row, "sonos_line_in_speaker_id", None) or "").strip(),
        )
        for row in rows
    ]


@router.post("/players", response_model=IdResponse)
def create_player(payload: PlayerCreate, db: Session = Depends(get_db)) -> IdResponse:
    row = PlexampPlayer(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return IdResponse(id=row.id)


@router.patch("/players/{player_id}", response_model=PlayerRead)
def patch_player(player_id: int, payload: PlayerPatch, db: Session = Depends(get_db)) -> PlayerRead:
    row = db.get(PlexampPlayer, player_id)
    if not row:
        raise HTTPException(status_code=404, detail="Player not found")
    data = payload.model_dump(exclude_unset=True)
    if "sonos_line_in_speaker_id" in data and data["sonos_line_in_speaker_id"] is not None:
        row.sonos_line_in_speaker_id = str(data["sonos_line_in_speaker_id"]).strip()
    db.commit()
    db.refresh(row)
    return PlayerRead(
        id=row.id,
        name=row.name,
        host=row.host,
        port=row.port,
        is_active=row.is_active,
        sonos_line_in_speaker_id=(getattr(row, "sonos_line_in_speaker_id", None) or "").strip(),
    )


@router.delete("/players/{player_id}")
def delete_player(player_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.get(PlexampPlayer, player_id)
    if not row:
        raise HTTPException(status_code=404, detail="Player not found")
    db.delete(row)
    db.commit()
    return {"message": "Player deleted"}


@router.post("/play", response_model=PlayResponse)
def play(
    payload: PlayRequest,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
) -> PlayResponse:
    assert creds.auth_token
    response = playback_service.play(payload, db, auth_token=creds.auth_token)
    if response.status == "error":
        raise HTTPException(status_code=400, detail=response.details)
    return response


@router.post("/plexamp/skip-next", response_model=PlayResponse)
def plexamp_skip_next(
    payload: PlayerControlRequest,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
) -> PlayResponse:
    assert creds.auth_token
    response = playback_service.plexamp_skip_next(payload.player_id, db, auth_token=creds.auth_token)
    if response.status == "error":
        raise HTTPException(status_code=400, detail=response.details)
    return response


@router.post("/plexamp/skip-previous", response_model=PlayResponse)
def plexamp_skip_previous(
    payload: PlayerControlRequest,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
) -> PlayResponse:
    assert creds.auth_token
    response = playback_service.plexamp_skip_previous(payload.player_id, db, auth_token=creds.auth_token)
    if response.status == "error":
        raise HTTPException(status_code=400, detail=response.details)
    return response


@router.post("/plexamp/pause", response_model=PlayResponse)
def plexamp_pause(
    payload: PlayerControlRequest,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
) -> PlayResponse:
    assert creds.auth_token
    response = playback_service.plexamp_pause(payload.player_id, db, auth_token=creds.auth_token)
    if response.status == "error":
        raise HTTPException(status_code=400, detail=response.details)
    return response


@router.post("/plexamp/resume", response_model=PlayResponse)
def plexamp_resume(
    payload: PlayerControlRequest,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
) -> PlayResponse:
    assert creds.auth_token
    response = playback_service.plexamp_resume(payload.player_id, db, auth_token=creds.auth_token)
    if response.status == "error":
        raise HTTPException(status_code=400, detail=response.details)
    return response


@router.post("/plexamp/playback-state", response_model=PlaybackStateResponse)
def plexamp_playback_state(
    payload: PlayerControlRequest,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
) -> PlaybackStateResponse:
    assert creds.auth_token
    return playback_service.plexamp_playback_state(payload.player_id, db, auth_token=creds.auth_token)


@router.post("/sonos/play-line-in", response_model=PlayResponse)
def sonos_play_line_in(payload: SonosLineInPlayRequest, db: Session = Depends(get_db)) -> PlayResponse:
    response = playback_service.sonos_play_line_in_selected(payload.speaker_ids, payload.player_id, db)
    if response.status == "error":
        raise HTTPException(status_code=400, detail=response.details)
    return response


@router.post("/sonos/stop", response_model=PlayResponse)
def sonos_stop(payload: SonosStopRequest, db: Session = Depends(get_db)) -> PlayResponse:
    response = playback_service.sonos_stop_selected(payload.speaker_ids, db)
    if response.status == "error":
        raise HTTPException(status_code=400, detail=response.details)
    return response


@router.post("/sonos/playback-state", response_model=PlaybackStateResponse)
def sonos_playback_state(payload: SonosStopRequest, db: Session = Depends(get_db)) -> PlaybackStateResponse:
    return playback_service.sonos_playback_state(payload.speaker_ids, db)


@router.websocket("/playback-state/ws")
async def playback_state_websocket(websocket: WebSocket) -> None:
    """
    Stream combined Sonos + Plexamp playback snapshots over one connection (avoids REST polling spam).

    First message must be JSON: ``{"type": "subscribe", "speaker_ids": [...], "player_id": null|int, "interval_ms"?: 500-30000}``.
    Server then sends ``{"sonos": {...}, "plexamp": {...}}`` repeatedly on that interval until disconnect.
    """
    await websocket.accept()
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
    except asyncio.TimeoutError:
        await websocket.close(code=4408)
        return
    except WebSocketDisconnect:
        return
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        await websocket.close(code=4400)
        return
    if payload.get("type") != "subscribe":
        await websocket.close(code=4400)
        return
    raw_ids = payload.get("speaker_ids") or []
    if not isinstance(raw_ids, list):
        await websocket.close(code=4400)
        return
    speaker_ids = [str(x) for x in raw_ids]
    raw_player = payload.get("player_id")
    player_id: int | None
    if raw_player is None or raw_player is False:
        player_id = None
    else:
        try:
            player_id = int(raw_player)
        except (TypeError, ValueError):
            await websocket.close(code=4400)
            return
    interval_ms = payload.get("interval_ms", 2500)
    try:
        interval_ms = int(interval_ms)
    except (TypeError, ValueError):
        interval_ms = 2500
    interval_ms = max(500, min(interval_ms, 30_000))
    interval_s = interval_ms / 1000.0

    try:
        while True:
            snap = await asyncio.to_thread(_fetch_playback_snapshot, speaker_ids, player_id)
            await websocket.send_json(snap)
            await asyncio.sleep(interval_s)
    except WebSocketDisconnect:
        return


@router.post("/sonos/volume", response_model=PlayResponse)
def sonos_volume(payload: SonosVolumeAdjustRequest, db: Session = Depends(get_db)) -> PlayResponse:
    response = playback_service.sonos_volume_adjust_selected(payload.speaker_ids, payload.delta, db)
    if response.status == "error":
        raise HTTPException(status_code=400, detail=response.details)
    return response


@router.get("/speed-dial", response_model=list[SpeedDialRead])
def speed_dial(db: Session = Depends(get_db)) -> list[SpeedDialRead]:
    rows = db.query(SpeedDialFavorite).all()
    return [
        SpeedDialRead(
            id=row.id,
            label=row.label,
            media_type=row.media_type,
            media_id=row.media_id,
            player_id=row.player_id,
            speaker_ids=row.speaker_ids,
            preset_id=row.preset_id,
            artist_radio=getattr(row, "artist_radio", None),
            shuffle=getattr(row, "shuffle", None),
            has_cover_art=bool((getattr(row, "cover_thumb_path", None) or "").strip()),
        )
        for row in rows
    ]


def _speed_dial_cover_thumb_path(payload: SpeedDialCreate, db: Session) -> str | None:
    creds = db.query(PlexCredential).first()
    if not creds or not creds.auth_token:
        return None
    try:
        rating_key = int(str(payload.media_id).strip())
    except ValueError:
        return None
    try:
        conn = resolve_plex_conn(db)
        return plex_service.thumb_path_for_item(rating_key, creds.auth_token, conn)
    except Exception:  # noqa: BLE001
        return None


@router.post("/speed-dial", response_model=IdResponse)
def create_speed_dial(payload: SpeedDialCreate, db: Session = Depends(get_db)) -> IdResponse:
    cover_path = _speed_dial_cover_thumb_path(payload, db)
    row = SpeedDialFavorite(**payload.model_dump(), cover_thumb_path=cover_path)
    db.add(row)
    db.commit()
    db.refresh(row)
    return IdResponse(id=row.id)


@router.post("/speed-dial/{favorite_id}/play", response_model=PlayResponse)
def play_speed_dial_favorite(
    favorite_id: int,
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
) -> PlayResponse:
    row = db.get(SpeedDialFavorite, favorite_id)
    if not row:
        raise HTTPException(status_code=404, detail="Favorite not found")
    try:
        ar = getattr(row, "artist_radio", None)
        sh = getattr(row, "shuffle", None)
        payload = PlayRequest(
            media_type=row.media_type,
            media_id=str(row.media_id),
            player_id=row.player_id,
            speaker_ids=list(row.speaker_ids or []),
            preset_id=row.preset_id,
            artist_radio=ar if ar is not None else True,
            shuffle=bool(sh),
        )
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid favorite data: {exc}") from exc
    assert creds.auth_token
    response = playback_service.play(payload, db, auth_token=creds.auth_token)
    if response.status == "error":
        raise HTTPException(status_code=400, detail=response.details)
    return response


@router.get("/speed-dial/{favorite_id}/cover")
def speed_dial_cover(favorite_id: int, db: Session = Depends(get_db)) -> Response:
    row = db.get(SpeedDialFavorite, favorite_id)
    path = (getattr(row, "cover_thumb_path", None) or "").strip() if row else ""
    if not path:
        raise HTTPException(status_code=404, detail="Cover not available")
    creds = db.query(PlexCredential).first()
    if not creds or not creds.auth_token:
        raise HTTPException(status_code=404, detail="Cover not available")
    try:
        conn = resolve_plex_conn(db)
        body, media_type = plex_service.fetch_thumb_bytes(path, creds.auth_token, conn)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Plex image fetch failed: {exc}") from exc
    return Response(content=body, media_type=media_type)


@router.delete("/speed-dial/{favorite_id}")
def delete_speed_dial(favorite_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.get(SpeedDialFavorite, favorite_id)
    if not row:
        raise HTTPException(status_code=404, detail="Favorite not found")
    db.delete(row)
    db.commit()
    return {"message": "Favorite deleted"}
