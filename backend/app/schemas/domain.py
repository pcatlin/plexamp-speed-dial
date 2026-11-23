from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


MediaType = Literal["playlist", "album", "artist", "track", "random_album"]
ArtistOrderMode = Literal["shuffle", "album_order", "popular_order", "popular_tracks_order", "external_ratings_order"]


class MediaItem(BaseModel):
    id: str
    title: str
    subtitle: str | None = None
    type: str


class MediaSuggestionsResponse(BaseModel):
    most_played: list[MediaItem] = Field(default_factory=list)
    random: list[MediaItem] = Field(default_factory=list)
    recently_played: list[MediaItem] = Field(default_factory=list)
    recently_added: list[MediaItem] = Field(default_factory=list)


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
    volume: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Current volume percent when discovered.",
    )
    source: str | None = Field(
        default=None,
        description="Human-readable current input or playback source.",
    )
    playing: bool | None = Field(
        default=None,
        description="True when this speaker's group coordinator is PLAYING or TRANSITIONING.",
    )


class SonosGroupPresetCreate(BaseModel):
    name: str
    speaker_ids: list[str] = Field(default_factory=list)


class SonosGroupPresetRead(SonosGroupPresetCreate):
    id: int


AudioOutputKind = Literal["none", "sonos", "pioneer"]


class AudioOutput(BaseModel):
    kind: AudioOutputKind = "none"
    config: dict[str, object] = Field(default_factory=dict)


class AmpCreate(BaseModel):
    name: str
    host: str
    port: int = 60128
    input_code: str = "02"

    @field_validator("name")
    @classmethod
    def validate_amp_name(cls, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise ValueError("name must not be empty")
        return text

    @field_validator("host")
    @classmethod
    def validate_amp_host(cls, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise ValueError("host must not be empty")
        return text

    @field_validator("port")
    @classmethod
    def validate_amp_port(cls, value: int) -> int:
        if value < 1 or value > 65535:
            raise ValueError("port must be between 1 and 65535")
        return value

    @field_validator("input_code")
    @classmethod
    def validate_amp_input_code(cls, value: str) -> str:
        code = (value or "").strip().upper()
        if len(code) != 2 or not all(c in "0123456789ABCDEF" for c in code):
            raise ValueError("input_code must be a 2-character ISCP input code")
        return code


class AmpRead(AmpCreate):
    id: int


class AmpPatch(BaseModel):
    name: str | None = None
    host: str | None = None
    port: int | None = None
    input_code: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        if not text:
            raise ValueError("name must not be empty")
        return text

    @field_validator("host")
    @classmethod
    def validate_host(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        if not text:
            raise ValueError("host must not be empty")
        return text

    @field_validator("port")
    @classmethod
    def validate_port(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value < 1 or value > 65535:
            raise ValueError("port must be between 1 and 65535")
        return value

    @field_validator("input_code")
    @classmethod
    def validate_input_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        code = value.strip().upper()
        if len(code) != 2 or not all(c in "0123456789ABCDEF" for c in code):
            raise ValueError("input_code must be a 2-character ISCP input code")
        return code


class PlayerCreate(BaseModel):
    name: str
    host: str
    port: int = 32500
    is_active: bool = True
    audio_output: AudioOutput = Field(default_factory=AudioOutput)


class PlayerRead(PlayerCreate):
    id: int


class PlayerPatch(BaseModel):
    """Partial update for a companion player (Setup UI)."""

    name: str | None = None
    host: str | None = None
    port: int | None = None
    audio_output: AudioOutput | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        if not text:
            raise ValueError("name must not be empty")
        return text

    @field_validator("host")
    @classmethod
    def validate_host(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        if not text:
            raise ValueError("host must not be empty")
        return text

    @field_validator("port")
    @classmethod
    def validate_port(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value < 1 or value > 65535:
            raise ValueError("port must be between 1 and 65535")
        return value


class AudioOutputVolumeRequest(BaseModel):
    player_id: int
    delta: int = Field(..., ge=-30, le=30)


class AudioOutputPowerRequest(BaseModel):
    player_id: int
    on: bool


class AudioOutputTestRequest(BaseModel):
    player_id: int


class AudioOutputStatusResponse(BaseModel):
    ok: bool = True
    power_on: bool | None = None
    input_code: str | None = None
    volume_level: int | None = None
    volume_db: float | None = None
    volume_muted: bool = False
    error: str | None = None


class ReceiverStateResponse(BaseModel):
    """Pioneer AVR snapshot for UI status (also streamed on the playback WebSocket)."""

    ok: bool = True
    power_on: bool | None = None
    input_code: str | None = None
    volume_db: float | None = None
    volume_muted: bool = False
    error: str | None = None


class InitialVolumes(BaseModel):
    sonos: dict[str, int] = Field(
        default_factory=dict,
        description="Sonos speaker id → volume percent (0–100).",
    )
    pioneer: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Pioneer receiver volume percent (0–100) when player output is Pioneer.",
    )

    @field_validator("sonos")
    @classmethod
    def _clamp_sonos_volumes(cls, value: dict[str, int]) -> dict[str, int]:
        return {key: max(0, min(100, int(vol))) for key, vol in value.items()}


class PlayRequest(BaseModel):
    media_type: MediaType
    media_id: str
    player_id: int
    speaker_ids: list[str] = Field(default_factory=list)
    preset_id: int | None = None
    artist_radio: bool = Field(
        default=True,
        description="When media_type is artist: True = Plex artist radio station; False = queue this artist only.",
    )
    shuffle: bool = Field(
        default=False,
        description="When media_type is playlist: request shuffled queue. For artist, prefer artist_order_mode.",
    )
    artist_order_mode: ArtistOrderMode | None = Field(
        default=None,
        description="When media_type is artist: shuffle, album order, user ratings, or Plex popular tracks.",
    )
    radio_degrees_of_separation: int | None = Field(
        default=None,
        description="For artist radio and track radio: max degrees of separation (1–3, or -1 for unlimited).",
    )
    initial_volumes: InitialVolumes | None = Field(
        default=None,
        description="Optional Sonos per-speaker and Pioneer initial volume levels (0–100%).",
    )

    @field_validator("radio_degrees_of_separation")
    @classmethod
    def _validate_radio_degrees_of_separation(cls, value: int | None) -> int | None:
        if value is None or value in (-1, 1, 2, 3):
            return value
        raise ValueError("radio_degrees_of_separation must be 1, 2, 3, or -1 (unlimited)")


class PlayResponse(BaseModel):
    status: str
    details: str


class PlayerControlRequest(BaseModel):
    player_id: int


class SonosStopRequest(BaseModel):
    speaker_ids: list[str] = Field(default_factory=list)


class SonosLineInPlayRequest(BaseModel):
    speaker_ids: list[str] = Field(default_factory=list)
    player_id: int = Field(..., description="Plexamp player whose saved line-in Sonos id is used.")


class NowPlayingTrack(BaseModel):
    """Currently playing track for the selected companion player."""

    title: str
    artist: str | None = None
    album: str | None = None
    rating_key: str | None = Field(
        default=None,
        description="Plex rating key when known (used for cover art).",
    )


class PlaybackStateResponse(BaseModel):
    """Playback snapshot for UI toggles (Sonos transport / Plexamp timeline)."""

    ok: bool = True
    playing: bool | None = None
    state: str | None = Field(default=None, description="Raw state string when available (e.g. Sonos transport or Plex timeline).")
    now_playing: NowPlayingTrack | None = Field(
        default=None,
        description="Track metadata for the selected player when available.",
    )
    error: str | None = None


class SonosVolumeAdjustRequest(BaseModel):
    speaker_ids: list[str] = Field(default_factory=list)
    delta: int = Field(
        ...,
        ge=-100,
        le=100,
        description="Volume change in percent points (e.g. -5 or +5).",
    )


class SonosVolumeSetRequest(BaseModel):
    volumes: dict[str, int] = Field(
        default_factory=dict,
        description="Sonos speaker id → absolute volume percent (0–100).",
    )

    @field_validator("volumes")
    @classmethod
    def _clamp_volumes(cls, value: dict[str, int]) -> dict[str, int]:
        return {key: max(0, min(100, int(vol))) for key, vol in value.items()}


class SonosGroupAddRequest(BaseModel):
    group_speaker_ids: list[str] = Field(
        default_factory=list,
        description="Current group members (used to find the coordinator to join).",
    )
    speaker_ids: list[str] = Field(
        default_factory=list,
        description="Speakers to add to the group.",
    )


class SonosGroupRemoveRequest(BaseModel):
    speaker_ids: list[str] = Field(
        default_factory=list,
        description="Speakers to unjoin / remove from their current group.",
    )


class SpeedDialCreate(BaseModel):
    label: str
    media_type: MediaType
    media_id: str
    player_id: int
    speaker_ids: list[str] = Field(default_factory=list)
    preset_id: int | None = None
    artist_radio: bool | None = Field(
        default=None,
        description="For artist favorites: True/False; null for non-artist or legacy rows (treated as radio on play).",
    )
    shuffle: bool | None = Field(
        default=None,
        description="For playlist/artist favorites: shuffle on play; null treated as false.",
    )
    initial_volumes: InitialVolumes | None = Field(
        default=None,
        description="Sonos per-speaker and Pioneer initial volume levels (0–100%) saved with this favorite.",
    )


class SpeedDialRead(SpeedDialCreate):
    id: int
    has_cover_art: bool = False
    description: str = Field(
        default="",
        description="Human-readable play target: player, speakers/AVR, and saved volumes.",
    )


class SpeedDialPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=255)
    player_id: int | None = None
    speaker_ids: list[str] | None = None
    initial_volumes: InitialVolumes | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "SpeedDialPatch":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class SpeedDialOrderUpdate(BaseModel):
    favorite_ids: list[int] = Field(
        ...,
        min_length=1,
        description="Speed-dial favorite ids in display order (must include every favorite exactly once).",
    )


class RuntimeSetupUpdate(BaseModel):
    """Editable fields from the Setup modal (stored in DB)."""

    plex_server_url: str = Field(
        default="",
        description="PMS base URL, e.g. http://192.168.1.10:32400. Set in Setup (stored in DB).",
    )
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
    webhook_base_url: str = Field(
        default="",
        description="LAN base URL for speed-dial webhook links, e.g. http://192.168.1.50.",
    )
    webhooks_enabled: bool = Field(
        default=False,
        description="When true, GET /speed-dial/{id}/webhook can trigger playback.",
    )
    webhook_links_hidden: bool = Field(
        default=False,
        description="When true, hide copy-link icons on speed-dial favorites (only when webhooks are enabled).",
    )


class RuntimeSetupRead(RuntimeSetupUpdate):
    plex_server_url_effective: str = Field(
        default="",
        description="Same as plex_server_url from Setup (DB); exposed for the UI.",
    )


class TidalTrackRead(BaseModel):
    id: str
    title: str
    subtitle: str | None = None
    playlist_id: str | None = None
    playlist_item_id: str | None = None
    guid: str | None = None
    library_section: str | None = None


class TidalTracksDeleteResponse(BaseModel):
    removed_count: int
    removed_ids: list[str] = Field(default_factory=list)
    removed_playlist_item_ids: list[str] = Field(default_factory=list)


class ServerTidalTracksResponse(BaseModel):
    items: list[TidalTrackRead] = Field(default_factory=list)
    truncated: bool = False
    offset: int = 0
    limit: int = 0
    scanned_sections: list[str] = Field(default_factory=list)
    note: str | None = None
