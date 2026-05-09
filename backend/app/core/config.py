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

    model_config = SettingsConfigDict(
        env_file=_DOTENV_FILES if _DOTENV_FILES else None,
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
    )


settings = Settings()
