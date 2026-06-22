"""Lightweight additive migrations for runtime_setup (no Alembic in this repo)."""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

_log = logging.getLogger(__name__)


def ensure_runtime_setup_columns(engine: Engine) -> None:
    """Add Sonos line-in columns when upgrading an existing DB."""
    insp = inspect(engine)
    if "runtime_setup" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("runtime_setup")}
    alters: list[str] = []
    if "sonos_line_in_source_name" not in existing:
        alters.append(
            "ALTER TABLE runtime_setup ADD COLUMN sonos_line_in_source_name VARCHAR(255) NOT NULL DEFAULT ''",
        )
    if "sonos_line_in_source_uid" not in existing:
        alters.append(
            "ALTER TABLE runtime_setup ADD COLUMN sonos_line_in_source_uid VARCHAR(255) NOT NULL DEFAULT ''",
        )
    if not alters:
        return
    with engine.begin() as conn:
        for stmt in alters:
            try:
                conn.execute(text(stmt))
                _log.info("Applied runtime_setup migration: %s", stmt.split("ADD COLUMN")[1].strip().split()[0])
            except Exception as exc:  # noqa: BLE001
                _log.warning("runtime_setup migrate skipped/failed (%s): %s", stmt[:80], exc)


def ensure_runtime_setup_plex_client_identifier_column(engine: Engine) -> None:
    """Add runtime_setup.plex_client_identifier when upgrading an existing DB."""
    insp = inspect(engine)
    if "runtime_setup" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("runtime_setup")}
    if "plex_client_identifier" in existing:
        return
    stmt = "ALTER TABLE runtime_setup ADD COLUMN plex_client_identifier VARCHAR(64)"
    with engine.begin() as conn:
        try:
            conn.execute(text(stmt))
            _log.info("Applied runtime_setup migration: plex_client_identifier")
        except Exception as exc:  # noqa: BLE001
            _log.warning("runtime_setup migrate skipped/failed: %s", exc)


def ensure_speed_dial_cover_column(engine: Engine) -> None:
    """Add speed_dial_favorites.cover_thumb_path when upgrading an existing DB."""
    insp = inspect(engine)
    if "speed_dial_favorites" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("speed_dial_favorites")}
    if "cover_thumb_path" in existing:
        return
    stmt = "ALTER TABLE speed_dial_favorites ADD COLUMN cover_thumb_path TEXT"
    with engine.begin() as conn:
        try:
            conn.execute(text(stmt))
            _log.info("Applied speed_dial_favorites migration: cover_thumb_path")
        except Exception as exc:  # noqa: BLE001
            _log.warning("speed_dial_favorites migrate skipped/failed: %s", exc)


def ensure_speed_dial_artist_radio_column(engine: Engine) -> None:
    """Add speed_dial_favorites.artist_radio when upgrading an existing DB."""
    insp = inspect(engine)
    if "speed_dial_favorites" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("speed_dial_favorites")}
    if "artist_radio" in existing:
        return
    stmt = "ALTER TABLE speed_dial_favorites ADD COLUMN artist_radio BOOLEAN"
    with engine.begin() as conn:
        try:
            conn.execute(text(stmt))
            _log.info("Applied speed_dial_favorites migration: artist_radio")
        except Exception as exc:  # noqa: BLE001
            _log.warning("speed_dial_favorites migrate skipped/failed: %s", exc)


def ensure_plexamp_player_sonos_line_in_column(engine: Engine) -> None:
    """Add plexamp_players.sonos_line_in_speaker_id when upgrading an existing DB."""
    insp = inspect(engine)
    if "plexamp_players" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("plexamp_players")}
    if "sonos_line_in_speaker_id" in existing:
        return
    stmt = "ALTER TABLE plexamp_players ADD COLUMN sonos_line_in_speaker_id VARCHAR(255) NOT NULL DEFAULT ''"
    with engine.begin() as conn:
        try:
            conn.execute(text(stmt))
            _log.info("Applied plexamp_players migration: sonos_line_in_speaker_id")
        except Exception as exc:  # noqa: BLE001
            _log.warning("plexamp_players migrate skipped/failed: %s", exc)


def ensure_plexamp_player_audio_output_columns(engine: Engine) -> None:
    """Add audio_output_kind/config and backfill from sonos_line_in_speaker_id."""
    insp = inspect(engine)
    if "plexamp_players" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("plexamp_players")}
    alters: list[str] = []
    if "audio_output_kind" not in existing:
        alters.append(
            "ALTER TABLE plexamp_players ADD COLUMN audio_output_kind VARCHAR(32) NOT NULL DEFAULT 'none'",
        )
    if "audio_output_config" not in existing:
        # JSON for Postgres; SQLite accepts JSON type via SQLAlchemy on create_all for new DBs.
        alters.append(
            "ALTER TABLE plexamp_players ADD COLUMN audio_output_config JSON NOT NULL DEFAULT '{}'",
        )
    with engine.begin() as conn:
        for stmt in alters:
            try:
                conn.execute(text(stmt))
                _log.info("Applied plexamp_players migration: %s", stmt.split("ADD COLUMN")[1].strip().split()[0])
            except Exception as exc:  # noqa: BLE001
                _log.warning("plexamp_players migrate skipped/failed (%s): %s", stmt[:80], exc)

    insp = inspect(engine)
    existing = {c["name"] for c in insp.get_columns("plexamp_players")}
    if "audio_output_kind" not in existing:
        return

    from app.db.database import SessionLocal
    from app.models import PlexampPlayer

    db = SessionLocal()
    try:
        for row in db.query(PlexampPlayer).all():
            legacy = (row.sonos_line_in_speaker_id or "").strip()
            kind = (getattr(row, "audio_output_kind", None) or "none").strip()
            config = getattr(row, "audio_output_config", None)
            if not isinstance(config, dict):
                config = {}
            if legacy and kind in ("", "none"):
                row.audio_output_kind = "sonos"
                row.audio_output_config = {"speaker_id": legacy}
            elif not kind:
                row.audio_output_kind = "none"
            if row.audio_output_config is None:
                row.audio_output_config = {}
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        _log.warning("plexamp_players audio_output backfill failed: %s", exc)
    finally:
        db.close()


def ensure_speed_dial_shuffle_column(engine: Engine) -> None:
    """Add speed_dial_favorites.shuffle when upgrading an existing DB."""
    insp = inspect(engine)
    if "speed_dial_favorites" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("speed_dial_favorites")}
    if "shuffle" in existing:
        return
    stmt = "ALTER TABLE speed_dial_favorites ADD COLUMN shuffle BOOLEAN"
    with engine.begin() as conn:
        try:
            conn.execute(text(stmt))
            _log.info("Applied speed_dial_favorites migration: shuffle")
        except Exception as exc:  # noqa: BLE001
            _log.warning("speed_dial_favorites migrate skipped/failed: %s", exc)


def ensure_speed_dial_initial_volumes_column(engine: Engine) -> None:
    """Add speed_dial_favorites.initial_volumes when upgrading an existing DB."""
    insp = inspect(engine)
    if "speed_dial_favorites" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("speed_dial_favorites")}
    if "initial_volumes" in existing:
        return
    stmt = "ALTER TABLE speed_dial_favorites ADD COLUMN initial_volumes JSON"
    with engine.begin() as conn:
        try:
            conn.execute(text(stmt))
            _log.info("Applied speed_dial_favorites migration: initial_volumes")
        except Exception as exc:  # noqa: BLE001
            _log.warning("speed_dial_favorites migrate skipped/failed: %s", exc)
