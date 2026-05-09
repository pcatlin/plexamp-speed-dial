from typing import Literal

from pydantic import BaseModel, Field


MediaType = Literal["playlist", "album", "artist", "track", "random_album"]


class MediaItem(BaseModel):
    id: str
    title: str
    subtitle: str | None = None
    type: str


class CollectionItem(BaseModel):
    id: str
    title: str


class PlexAuthStartResponse(BaseModel):
    pin_id: str
    code: str
    auth_url: str


class PlexAuthCompleteRequest(BaseModel):
    pin_id: str
    code: str
    mock_token: str | None = None
    username: str | None = None


class PlexAuthStatusResponse(BaseModel):
    connected: bool
    username: str | None = None


class PlexPinPollResponse(BaseModel):
    status: Literal["pending", "connected"]
    username: str | None = None


class PlexServerTestResponse(BaseModel):
    ok: bool
    configured_url: str = ""
    friendly_name: str | None = None
    music_library_sections: list[str] = Field(default_factory=list)
    ssl_verify_enabled: bool = True
    error_detail: str | None = None


class SonosSpeaker(BaseModel):
    id: str
    name: str
    ip: str


class SonosGroupPresetCreate(BaseModel):
    name: str
    speaker_ids: list[str] = Field(default_factory=list)


class SonosGroupPresetRead(SonosGroupPresetCreate):
    id: int


class PlayerCreate(BaseModel):
    name: str
    host: str
    port: int = 32500
    is_active: bool = True


class PlayerRead(PlayerCreate):
    id: int


class PlayRequest(BaseModel):
    media_type: MediaType
    media_id: str
    player_id: int
    speaker_ids: list[str] = Field(default_factory=list)
    preset_id: int | None = None


class PlayResponse(BaseModel):
    status: str
    details: str


class SpeedDialCreate(BaseModel):
    label: str
    media_type: MediaType
    media_id: str
    player_id: int
    speaker_ids: list[str] = Field(default_factory=list)
    preset_id: int | None = None


class SpeedDialRead(SpeedDialCreate):
    id: int
