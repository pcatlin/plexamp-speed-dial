"""Persisted runtime configuration (Setup modal), stored in the database."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import RuntimeSetup

_RUN_ID = 1


@dataclass(frozen=True)
class PlexConn:
    base_url: str
    ssl_verify: bool


@dataclass(frozen=True)
class SonosRuntime:
    seed_ips: str
    discover_timeout: int
    allow_network_scan: bool
    interface_addr: str
    demo_fallback: bool
    line_in_source_name: str
    line_in_source_uid: str


def effective_plex_url(stored_raw: str) -> str:
    """PMS base URL from Setup (DB) only."""
    return (stored_raw or "").strip().rstrip("/")


def _ensure_plex_client_identifier(db: Session, row: RuntimeSetup) -> None:
    existing = (getattr(row, "plex_client_identifier", None) or "").strip()
    if existing:
        return
    row.plex_client_identifier = str(uuid.uuid4())
    db.add(row)
    db.commit()
    db.refresh(row)


def get_or_create_runtime_setup(db: Session) -> RuntimeSetup:
    row = db.get(RuntimeSetup, _RUN_ID)
    if row is None:
        row = RuntimeSetup(id=_RUN_ID)
        db.add(row)
        db.commit()
        db.refresh(row)
    _ensure_plex_client_identifier(db, row)
    return row


def resolve_plex_conn(db: Session) -> PlexConn:
    row = get_or_create_runtime_setup(db)
    return PlexConn(base_url=effective_plex_url(row.plex_server_url), ssl_verify=row.plex_ssl_verify)


def resolve_sonos_runtime(db: Session) -> SonosRuntime:
    row = get_or_create_runtime_setup(db)
    name_db = (getattr(row, "sonos_line_in_source_name", None) or "").strip()
    uid_db = (getattr(row, "sonos_line_in_source_uid", None) or "").strip()
    return SonosRuntime(
        seed_ips=row.sonos_seed_ips,
        discover_timeout=row.sonos_discover_timeout,
        allow_network_scan=row.sonos_allow_network_scan,
        interface_addr=row.sonos_interface_addr,
        demo_fallback=row.sonos_demo_fallback,
        line_in_source_name=name_db,
        line_in_source_uid=uid_db,
    )
