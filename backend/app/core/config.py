from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env from repo root first, then backend/ — cwd when starting uvicorn is often backend/,
# so a single env_file=".env" misses ../.env and PLEX_SERVER_URL stays empty (503 on media routes).
_REPO_ROOT = Path(__file__).resolve().parents[3]
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_DOTENV_FILES = tuple(str(p) for p in (_REPO_ROOT / ".env", _BACKEND_ROOT / ".env") if p.is_file())


class Settings(BaseSettings):
    app_name: str = "Plexamp Sonos Speed Dial API"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./app.db"
    cors_origins: str = "*"

    plex_server_url: str = Field(default="", validation_alias=AliasChoices("plex_server_url", "PLEX_SERVER_URL"))
    plex_client_identifier: str = Field(
        default="plexamp-speed-dial-web",
        validation_alias=AliasChoices(
            "plex_client_identifier",
            "PLEX_CLIENT_IDENTIFIER",
            "PLEX_CLIENT_ID",
        ),
    )
    plex_device_name: str = Field(
        default="Plexamp Speed Dial API",
        validation_alias=AliasChoices("plex_device_name", "PLEX_DEVICE_NAME"),
    )
    plex_product: str = Field(
        default="Plexamp Speed Dial",
        validation_alias=AliasChoices("plex_product", "PLEX_PRODUCT"),
    )
    plex_media_limit: int = Field(
        default=300,
        ge=50,
        le=2000,
        validation_alias=AliasChoices("plex_media_limit", "PLEX_MEDIA_LIMIT"),
    )
    plex_ssl_verify: bool = Field(
        default=True,
        validation_alias=AliasChoices("plex_ssl_verify", "PLEX_SSL_VERIFY"),
    )
    plexamp_request_timeout_seconds: float = Field(
        default=15.0,
        ge=2.0,
        le=120.0,
        validation_alias=AliasChoices(
            "plexamp_request_timeout_seconds",
            "PLEXAMP_REQUEST_TIMEOUT_SECONDS",
        ),
    )

    # Sonos / SoCo: multicast discovery often fails in Docker; use SONOS_SEED_IPS (LAN IP of any player).
    sonos_discover_timeout: int = Field(
        default=10,
        ge=2,
        le=60,
        validation_alias=AliasChoices("sonos_discover_timeout", "SONOS_DISCOVER_TIMEOUT"),
    )
    sonos_seed_ips: str = Field(
        default="",
        validation_alias=AliasChoices("sonos_seed_ips", "SONOS_SEED_IPS"),
    )
    sonos_allow_network_scan: bool = Field(
        default=True,
        validation_alias=AliasChoices("sonos_allow_network_scan", "SONOS_ALLOW_NETWORK_SCAN"),
    )
    sonos_interface_addr: str = Field(
        default="",
        validation_alias=AliasChoices("sonos_interface_addr", "SONOS_INTERFACE_ADDR"),
    )
    sonos_demo_fallback: bool = Field(
        default=False,
        validation_alias=AliasChoices("sonos_demo_fallback", "SONOS_DEMO_FALLBACK"),
    )

    model_config = SettingsConfigDict(
        env_file=_DOTENV_FILES if _DOTENV_FILES else None,
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()
