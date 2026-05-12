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


class PlayerControlRequest(BaseModel):
    player_id: int


class SonosStopRequest(BaseModel):
    speaker_ids: list[str] = Field(default_factory=list)


class SpeedDialCreate(BaseModel):
    label: str
    media_type: MediaType
    media_id: str
    player_id: int
    speaker_ids: list[str] = Field(default_factory=list)
    preset_id: int | None = None


class SpeedDialRead(SpeedDialCreate):
    id: int
    has_cover_art: bool = False


class RuntimeSetupUpdate(BaseModel):
    """Editable fields from the Setup modal (stored in DB)."""

    plex_server_url: str = Field(default="", description="PMS base URL, e.g. http://192.168.1.10:32400. Empty uses PLEX_SERVER_URL from the environment.")
    plex_ssl_verify: bool = True
    sonos_seed_ips: str = Field(
        default="",
        description="Comma-separated LAN IPs of any Sonos speaker (helps Docker / no multicast).",
    )
    sonos_discover_timeout: int = Field(default=10, ge=2, le=60)
    sonos_allow_network_scan: bool = True
    sonos_interface_addr: str = Field(
        default="",
        description="Optional interface address for SSDP (advanced).",
    )
    sonos_demo_fallback: bool = False
    sonos_line_in_source_name: str = Field(default="", description="Substring of the Sonos player name that has Plexamp on line-in (e.g. Fridge).")
    sonos_line_in_source_uid: str = Field(
        default="",
        description="Optional exact Sonos player UID (RINCON_…); overrides name when set.",
    )


class RuntimeSetupRead(RuntimeSetupUpdate):
    plex_server_url_effective: str = Field(
        default="",
        description="URL the API will actually use (DB value, or env fallback if DB is blank).",
    )
