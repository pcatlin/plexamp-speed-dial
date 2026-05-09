"""Persisted runtime configuration (Setup modal) with environment fallbacks."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
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


def effective_plex_url(stored_raw: str) -> str:
    stored = (stored_raw or "").strip().rstrip("/")
    return stored or settings.plex_server_url.strip().rstrip("/")


def get_or_create_runtime_setup(db: Session) -> RuntimeSetup:
    row = db.get(RuntimeSetup, _RUN_ID)
    if row is not None:
        return row
    row = RuntimeSetup(
        id=_RUN_ID,
        plex_server_url=settings.plex_server_url.strip(),
        plex_ssl_verify=settings.plex_ssl_verify,
        sonos_seed_ips=settings.sonos_seed_ips,
        sonos_discover_timeout=settings.sonos_discover_timeout,
        sonos_allow_network_scan=settings.sonos_allow_network_scan,
        sonos_interface_addr=settings.sonos_interface_addr,
        sonos_demo_fallback=settings.sonos_demo_fallback,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def resolve_plex_conn(db: Session) -> PlexConn:
    row = get_or_create_runtime_setup(db)
    return PlexConn(base_url=effective_plex_url(row.plex_server_url), ssl_verify=row.plex_ssl_verify)


def resolve_sonos_runtime(db: Session) -> SonosRuntime:
    row = get_or_create_runtime_setup(db)
    return SonosRuntime(
        seed_ips=row.sonos_seed_ips,
        discover_timeout=row.sonos_discover_timeout,
        allow_network_scan=row.sonos_allow_network_scan,
        interface_addr=row.sonos_interface_addr,
        demo_fallback=row.sonos_demo_fallback,
    )
