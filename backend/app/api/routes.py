from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_plex_creds
from app.db.database import Base, engine, get_db
from app.models import PlexCredential, PlexampPlayer, SonosGroupPreset, SpeedDialFavorite
from app.schemas.common import HealthResponse, IdResponse
from app.schemas.domain import (
    PlayerCreate,
    PlayerRead,
    PlayRequest,
    PlayResponse,
    PlexAuthCompleteRequest,
    PlexAuthStatusResponse,
    PlexAuthStartResponse,
    PlexPinPollResponse,
    PlexServerTestResponse,
    SonosGroupPresetCreate,
    SonosGroupPresetRead,
    SonosSpeaker,
    SpeedDialCreate,
    SpeedDialRead,
)
from app.services.playback_service import PlaybackService
from app.services.plex_service import PlexService, PlexTvHttpError
from app.services.sonos_service import SonosService

router = APIRouter()
plex_service = PlexService()
sonos_service = SonosService()
playback_service = PlaybackService()


@router.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


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
def plex_server_test(creds: PlexCredential = Depends(require_plex_creds)) -> PlexServerTestResponse:
    assert creds.auth_token
    return plex_service.probe_server_connection(creds.auth_token)


@router.get("/media/playlists")
def media_playlists(creds: PlexCredential = Depends(require_plex_creds)):
    assert creds.auth_token
    try:
        return plex_service.get_media("playlist", creds.auth_token)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/media/artists")
def media_artists(creds: PlexCredential = Depends(require_plex_creds)):
    assert creds.auth_token
    try:
        return plex_service.get_media("artist", creds.auth_token)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/media/albums")
def media_albums(creds: PlexCredential = Depends(require_plex_creds)):
    assert creds.auth_token
    try:
        return plex_service.get_media("album", creds.auth_token)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/media/tracks")
def media_tracks(creds: PlexCredential = Depends(require_plex_creds)):
    assert creds.auth_token
    try:
        return plex_service.get_media("track", creds.auth_token)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/media/collections")
def media_collections(creds: PlexCredential = Depends(require_plex_creds)):
    assert creds.auth_token
    try:
        return plex_service.get_collections(creds.auth_token)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/media/random-album")
def media_random_album(collection_id: str, creds: PlexCredential = Depends(require_plex_creds)):
    assert creds.auth_token
    try:
        return plex_service.get_random_album(collection_id, creds.auth_token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/sonos/speakers", response_model=list[SonosSpeaker])
def sonos_speakers() -> list[SonosSpeaker]:
    return sonos_service.list_speakers()


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
def play(payload: PlayRequest, db: Session = Depends(get_db)) -> PlayResponse:
    response = playback_service.play(payload, db)
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
        )
        for row in rows
    ]


@router.post("/speed-dial", response_model=IdResponse)
def create_speed_dial(payload: SpeedDialCreate, db: Session = Depends(get_db)) -> IdResponse:
    row = SpeedDialFavorite(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return IdResponse(id=row.id)


@router.delete("/speed-dial/{favorite_id}")
def delete_speed_dial(favorite_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.get(SpeedDialFavorite, favorite_id)
    if not row:
        raise HTTPException(status_code=404, detail="Favorite not found")
    db.delete(row)
    db.commit()
    return {"message": "Favorite deleted"}
