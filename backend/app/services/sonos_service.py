import logging

from soco import SoCo
from soco import discover

from app.schemas.domain import SonosSpeaker
from app.services.runtime_setup import SonosRuntime

_log = logging.getLogger(__name__)


def _normalize_sonos_uid(raw: str) -> tuple[str, str | None]:
    """Return (full_id, base_uid_without_group_suffix) for RINCON IDs."""
    s = (raw or "").strip()
    if not s:
        return "", None
    if ":" in s:
        return s, s.split(":", 1)[0]
    return s, None


class SonosService:
    def discover_visible_zones(self, runtime: SonosRuntime) -> set[SoCo]:
        """Return visible Sonos players (SoCo instances). Same rules as list_speakers."""
        seeds = [ip.strip() for ip in runtime.seed_ips.split(",") if ip.strip()]
        zones: set | None = None

        if seeds:
            for ip in seeds:
                try:
                    speaker = SoCo(ip)
                    speaker.player_name
                    zones = speaker.visible_zones
                    if zones:
                        _log.info("Sonos zones from seed IP %s (%d players)", ip, len(zones))
                        break
                except Exception as exc:  # noqa: BLE001
                    _log.warning("Sonos seed IP %s failed: %s", ip, exc)
            if not zones:
                zones = set()

        if not seeds or not zones:
            interface = runtime.interface_addr.strip() or None
            try:
                kwargs: dict = {
                    "timeout": runtime.discover_timeout,
                    "include_invisible": False,
                    "allow_network_scan": runtime.allow_network_scan,
                }
                if interface:
                    kwargs["interface_addr"] = interface
                discovered = discover(**kwargs)
            except Exception as exc:  # noqa: BLE001
                _log.warning("SoCo discover raised: %s", exc)
                discovered = None

            if discovered:
                zones = discovered
                _log.info("Sonos discover found %d players", len(zones))
            elif zones is None:
                zones = set()

        return zones or set()

    # Backwards-compatible alias (older code referred to "zone groups")
    def discover_zone_groups(self, runtime: SonosRuntime) -> set[SoCo]:
        return self.discover_visible_zones(runtime)

    def list_speakers(self, runtime: SonosRuntime) -> list[SonosSpeaker]:
        zones = self.discover_visible_zones(runtime)
        if not zones:
            _log.info("No Sonos zones found (Docker/multicast: set seed IPs under Setup).")
            return []

        return [
            SonosSpeaker(id=speaker.uid, name=speaker.player_name, ip=speaker.ip_address)
            for speaker in sorted(zones, key=lambda z: (z.player_name or "").lower())
        ]

    @staticmethod
    def _device_for_api_speaker_id(zones: set[SoCo], speaker_id: str) -> SoCo | None:
        """Map API speaker id (player uid, optionally with :group suffix) to a SoCo device."""
        sid, base = _normalize_sonos_uid(speaker_id)
        if not sid:
            return None
        for d in zones:
            du = d.uid
            if du == sid or (base is not None and du == base):
                return d
        return None

    @staticmethod
    def _all_devices(zones: set[SoCo]) -> list[SoCo]:
        by_uid: dict[str, SoCo] = {}
        for d in zones:
            u = d.uid
            if u and u not in by_uid:
                by_uid[u] = d
        return list(by_uid.values())

    def _find_line_in_source(self, zones: set[SoCo], *, speaker_id: str, name_legacy: str) -> SoCo | None:
        """Resolve line-in player: prefer configured speaker id (API id / SoCo uid), else legacy name substring."""
        devices = self._all_devices(zones)
        sid = (speaker_id or "").strip()
        if sid:
            want_uid, want_base = _normalize_sonos_uid(sid)
            if want_uid:
                for d in devices:
                    du = d.uid
                    if du == want_uid or (want_base is not None and du == want_base):
                        return d
        name_sub = (name_legacy or "").strip().lower()
        if name_sub:
            for d in devices:
                pname = (d.player_name or "").lower()
                if name_sub in pname:
                    return d
        return None

    @staticmethod
    def _group_coordinator(device: SoCo) -> SoCo:
        """Return coordinator SoCo for this device's current group (or device if ungrouped / slave)."""
        device.zone_group_state.poll(device)
        grp = device.group
        if grp is None:
            return device
        return grp.coordinator

    def group_selected_and_play_line_in(
        self,
        runtime: SonosRuntime,
        output_speaker_ids: list[str],
        *,
        line_in_speaker_id: str = "",
        line_in_name_legacy: str = "",
    ) -> str:
        """
        Group selected Sonos outputs and play line-in from the given Sonos player (e.g. Plexamp analog in).

        Uses SoCo ``switch_to_line_in`` / ``x-rincon-stream`` so outputs hear another player's line-in.
        """
        zones = self.discover_visible_zones(runtime)
        if not zones:
            return "Sonos: no zones discovered — set seed IPs in Setup or check the network."

        targets: list[SoCo] = []
        for sid in output_speaker_ids:
            dev = self._device_for_api_speaker_id(zones, sid)
            if dev is None:
                _log.warning("Sonos: no device matched speaker id %r", sid)
            else:
                targets.append(dev)

        seen_u: set[str] = set()
        uniq: list[SoCo] = []
        for d in targets:
            if d.uid in seen_u:
                continue
            seen_u.add(d.uid)
            uniq.append(d)
        targets = uniq

        if not targets:
            return "Sonos: none of the selected speakers matched discovered zones."

        line_src = self._find_line_in_source(
            zones,
            speaker_id=line_in_speaker_id,
            name_legacy=line_in_name_legacy,
        )
        if line_src is None:
            return (
                "Sonos: line-in source not found. Open Setup → Plexamp players and choose the Sonos line-in for this player "
                f"(saved id {line_in_speaker_id!r} or legacy name {line_in_name_legacy!r})."
            )

        if line_src.uid in {t.uid for t in targets}:
            master = line_src
        else:
            master = sorted(targets, key=lambda z: (z.player_name or "").lower())[0]

        # Each selected player may still be in an old zone group (e.g. user unchecked one room).
        # SoCo join() does not remove other members of that group — unjoin first so only the
        # checked speakers end up in the new group before line-in / play.
        for d in sorted(targets, key=lambda z: (z.uid or "")):
            try:
                d.unjoin()
            except Exception as exc:  # noqa: BLE001
                _log.warning("Sonos unjoin %s failed (continuing): %s", d.player_name, exc)

        for d in targets:
            if d.uid != master.uid:
                try:
                    d.join(master)
                except Exception as exc:  # noqa: BLE001
                    _log.warning("Sonos join %s → %s failed: %s", d.player_name, master.player_name, exc)
                    raise

        coord = self._group_coordinator(master)
        try:
            if coord.uid == line_src.uid:
                coord.switch_to_line_in()
            else:
                coord.switch_to_line_in(source=line_src)
            coord.play()
        except Exception as exc:  # noqa: BLE001
            _log.exception("Sonos line-in playback failed")
            raise RuntimeError(f"Sonos line-in failed: {exc}") from exc

        names = ", ".join(sorted((t.player_name or t.uid) for t in targets))
        return f"Sonos: grouped [{names}] → line-in from {line_src.player_name or line_src.uid}."

    def stop_selected_speakers(self, runtime: SonosRuntime, output_speaker_ids: list[str]) -> str:
        """Stop playback on the coordinator for each selected speaker (deduplicated by group)."""
        coordinators, err = self._unique_coordinators_for_speaker_ids(
            runtime, output_speaker_ids, no_zones_detail="nothing to stop."
        )
        if err:
            return err

        stopped: list[str] = []
        for coord in coordinators:
            coord.stop()
            stopped.append(coord.player_name or coord.uid)

        names = ", ".join(sorted(stopped))
        return f"Sonos: stopped playback on {names}."

    def _unique_coordinators_for_speaker_ids(
        self,
        runtime: SonosRuntime,
        output_speaker_ids: list[str],
        *,
        no_zones_detail: str = "nothing to adjust.",
    ) -> tuple[list[SoCo], str]:
        """Resolve group coordinators for selected API speaker ids (deduplicated). Empty list + message on failure."""
        zones = self.discover_visible_zones(runtime)
        if not zones:
            return [], f"Sonos: no zones discovered — {no_zones_detail}"

        coordinators: list[SoCo] = []
        seen_uid: set[str] = set()
        for sid in output_speaker_ids:
            dev = self._device_for_api_speaker_id(zones, sid)
            if dev is None:
                _log.warning("Sonos: no device matched speaker id %r", sid)
                continue
            coord = self._group_coordinator(dev)
            if coord.uid in seen_uid:
                continue
            seen_uid.add(coord.uid)
            coordinators.append(coord)

        if not coordinators:
            return [], "Sonos: none of the selected speakers matched discovered zones."
        return coordinators, ""

    def _unique_devices_for_speaker_ids(
        self, runtime: SonosRuntime, output_speaker_ids: list[str], *, no_zones_detail: str
    ) -> tuple[list[SoCo], str]:
        """Resolve one SoCo per selected API speaker id (deduplicated by player UID, not by group)."""
        zones = self.discover_visible_zones(runtime)
        if not zones:
            return [], f"Sonos: no zones discovered — {no_zones_detail}"

        devices: list[SoCo] = []
        seen_uid: set[str] = set()
        for sid in output_speaker_ids:
            dev = self._device_for_api_speaker_id(zones, sid)
            if dev is None:
                _log.warning("Sonos: no device matched speaker id %r", sid)
                continue
            if dev.uid in seen_uid:
                continue
            seen_uid.add(dev.uid)
            devices.append(dev)

        if not devices:
            return [], "Sonos: none of the selected speakers matched discovered zones."
        return devices, ""

    def adjust_volume_selected(self, runtime: SonosRuntime, output_speaker_ids: list[str], delta: int) -> str:
        """Apply the same relative volume step to every selected zone (each player, not coordinator-only).

        Bonded groups keep per-room balance: each checked speaker gets ``SetRelativeVolume`` so all
        selected outputs move together instead of only adjusting the group coordinator once.
        """
        devices, err = self._unique_devices_for_speaker_ids(
            runtime, output_speaker_ids, no_zones_detail="nothing to adjust."
        )
        if err:
            return err
        if delta == 0:
            return "Sonos: volume delta was zero — no change."

        lines: list[str] = []
        for dev in devices:
            try:
                new_vol = int(dev.set_relative_volume(delta))
            except Exception as exc:  # noqa: BLE001
                _log.warning("Sonos volume adjust failed for %s: %s", dev.player_name or dev.uid, exc)
                label = dev.player_name or dev.uid
                lines.append(f"{label} (failed: {exc})")
                continue
            label = dev.player_name or dev.uid
            lines.append(f"{label} → {new_vol}%")

        names = "; ".join(sorted(lines))
        sign = "+" if delta > 0 else ""
        return f"Sonos: volume {sign}{delta}% on {names}."

    def selection_transport_playing(self, runtime: SonosRuntime, output_speaker_ids: list[str]) -> tuple[bool | None, str | None]:
        """Return (playing, error). True if any coordinator for the selection is PLAYING or TRANSITIONING."""
        coordinators, err = self._unique_coordinators_for_speaker_ids(
            runtime, output_speaker_ids, no_zones_detail="nothing to query."
        )
        if err:
            return None, err
        try:
            for coord in coordinators:
                coord.zone_group_state.poll(coord)
                st = (coord.get_current_transport_info().get("current_transport_state") or "").upper()
                if st in ("PLAYING", "TRANSITIONING"):
                    return True, None
            return False, None
        except Exception as exc:  # noqa: BLE001
            _log.warning("Sonos transport state query failed: %s", exc)
            return None, str(exc)
