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
