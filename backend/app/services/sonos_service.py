import logging

from soco import SoCo
from soco import discover

from app.core.config import settings
from app.schemas.domain import SonosSpeaker

_log = logging.getLogger(__name__)


class SonosService:
    def list_speakers(self) -> list[SonosSpeaker]:
        seeds = [ip.strip() for ip in settings.sonos_seed_ips.split(",") if ip.strip()]
        zones: set | None = None

        if seeds:
            for ip in seeds:
                try:
                    speaker = SoCo(ip)
                    speaker.player_name  # force quick reachability check
                    zones = speaker.visible_zones
                    if zones:
                        _log.info("Sonos list built from seed IP %s (%d zones)", ip, len(zones))
                        break
                except Exception as exc:  # noqa: BLE001
                    _log.warning("Sonos seed IP %s failed: %s", ip, exc)
            if not zones:
                zones = set()

        if not seeds or not zones:
            interface = settings.sonos_interface_addr.strip() or None
            try:
                kwargs: dict = {
                    "timeout": settings.sonos_discover_timeout,
                    "include_invisible": False,
                    "allow_network_scan": settings.sonos_allow_network_scan,
                }
                if interface:
                    kwargs["interface_addr"] = interface
                discovered = discover(**kwargs)
            except Exception as exc:  # noqa: BLE001
                _log.warning("SoCo discover raised: %s", exc)
                discovered = None

            if discovered:
                zones = discovered
                _log.info("Sonos discover found %d zones", len(zones))
            elif zones is None:
                zones = set()

        if not zones and settings.sonos_demo_fallback:
            _log.warning("Sonos demo fallback enabled — returning placeholder speakers")
            return [
                SonosSpeaker(id="demo-living-room", name="Living Room (demo)", ip="192.168.1.10"),
                SonosSpeaker(id="demo-kitchen", name="Kitchen (demo)", ip="192.168.1.11"),
            ]

        if not zones:
            _log.info(
                "No Sonos zones found (Docker/multicast: set SONOS_SEED_IPS to a player LAN IP)."
            )
            return []

        return [
            SonosSpeaker(id=speaker.uid, name=speaker.player_name, ip=speaker.ip_address)
            for speaker in sorted(zones, key=lambda z: z.player_name.lower())
        ]
