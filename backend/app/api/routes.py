from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import require_plex_creds
from app.db.database import Base, SessionLocal, engine, get_db
from app.db.runtime_setup_migrate import (
    ensure_runtime_setup_columns,
    ensure_speed_dial_artist_radio_column,
    ensure_speed_dial_cover_column,
    ensure_speed_dial_shuffle_column,
)
from app.models import PlexCredential, PlexampPlayer, SonosGroupPreset, SpeedDialFavorite
from app.schemas.common import HealthResponse, IdResponse
from app.schemas.domain import (
    MediaItem,
    MediaSuggestionsResponse,
    PlayerControlRequest,
    PlayerCreate,
    PlayerRead,
    PlayRequest,
    PlayResponse,
    PlexAuthCompleteRequest,
    PlexAuthStatusResponse,
    PlexAuthStartResponse,
    PlexPinPollResponse,
    PlexServerTestResponse,
    RuntimeSetupRead,
    RuntimeSetupUpdate,
    SonosGroupPresetCreate,
    SonosGroupPresetRead,
    SonosSpeaker,
    SonosStopRequest,
    SpeedDialCreate,
    SpeedDialRead,
)
from app.services.playback_service import PlaybackService
from app.services.plex_service import PlexService, PlexTvHttpError
from app.services.runtime_setup import effective_plex_url, get_or_create_runtime_setup, resolve_plex_conn, resolve_sonos_runtime
from app.services.sonos_service import SonosService

router = APIRouter()
plex_service = PlexService()
sonos_service = SonosService()
playback_service = PlaybackService()


def _serialize_runtime_setup_read(db: Session) -> RuntimeSetupRead:
    row = get_or_create_runtime_setup(db)
    return RuntimeSetupRead(
        plex_server_url=row.plex_server_url or "",
        plex_ssl_verify=row.plex_ssl_verify,
        sonos_seed_ips=row.sonos_seed_ips or "",
        sonos_discover_timeout=row.sonos_discover_timeout,
        sonos_allow_network_scan=row.sonos_allow_network_scan,
        sonos_interface_addr=row.sonos_interface_addr or "",
        sonos_demo_fallback=row.sonos_demo_fallback,
        sonos_line_in_source_name=getattr(row, "sonos_line_in_source_name", None) or "",
        sonos_line_in_source_uid=getattr(row, "sonos_line_in_source_uid", None) or "",
        plex_server_url_effective=effective_plex_url(row.plex_server_url),
    )


@router.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_runtime_setup_columns(engine)
    ensure_speed_dial_cover_column(engine)
    ensure_speed_dial_artist_radio_column(engine)
    ensure_speed_dial_shuffle_column(engine)
    seed = SessionLocal()
    try:
        get_or_create_runtime_setup(seed)
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
    row.sonos_demo_fallback = data["sonos_demo_fallback"]
    row.sonos_line_in_source_name = data["sonos_line_in_source_name"].strip()
    row.sonos_line_in_source_uid = data["sonos_line_in_source_uid"].strip()
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
    creds.auth_token = token
    creds.username = plex_service.lookup_username(token) or creds.username
    creds.is_connected = True
    db.commit()
    return PlexPinPollResponse(status="connected", username=creds.username)


@router.post("/auth/plex/complete", response_model=PlexAuthStatusResponse)
def plex_complete(payload: PlexAuthCompleteRequest, db: Session = Depends(get_db)) -> PlexAuthStatusResponse:
    """Dev escape hatch (mock token) or single-shot PIN poll if the token is ready."""
    creds = db.query(PlexCredential).first()
    if not creds:
        creds = PlexCredential()
        db.add(creds)
    if payload.mock_token:
        creds.auth_token = payload.mock_token
        creds.username = payload.username or creds.username or "dev"
        creds.is_connected = True
        db.commit()
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
    creds.auth_token = token
    creds.username = plex_service.lookup_username(token) or payload.username or creds.username
    creds.is_connected = True
    db.commit()
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


@router.get("/media/tracks-for-parent", response_model=list[MediaItem])
def media_tracks_for_parent(
    family: Literal["playlist", "album", "artist"],
    parent_id: str,
    limit: int = Query(50, ge=1, le=50),
    db: Session = Depends(get_db),
    creds: PlexCredential = Depends(require_plex_creds),
):
    assert creds.auth_token
    try:
        return plex_service.get_tracks_for_parent(
            parent_id,
            family,
            creds.auth_token,
            resolve_plex_conn(db),
            limit=limit,
        )
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
    return [PlayerRead(id=row.id, name=row.name, host=row.host, port=row.port, is_active=row.is_active) for row in rows]


@router.post("/players", response_model=IdResponse)
def create_player(payload: PlayerCreate, db: Session = Depends(get_db)) -> IdResponse:
    row = PlexampPlayer(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return IdResponse(id=row.id)


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


@router.post("/sonos/stop", response_model=PlayResponse)
def sonos_stop(payload: SonosStopRequest, db: Session = Depends(get_db)) -> PlayResponse:
    response = playback_service.sonos_stop_selected(payload.speaker_ids, db)
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
