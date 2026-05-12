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
