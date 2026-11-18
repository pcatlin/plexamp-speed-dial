from __future__ import annotations

import logging
import time
from collections.abc import Callable
from datetime import datetime, timezone

from soco import SoCo
from soco import discover

from app.schemas.domain import SonosSpeaker
from app.services.runtime_setup import SonosRuntime

_log = logging.getLogger(__name__)
_DISCOVERY_CACHE_TTL_SECONDS = 60


def _utc_ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _speaker_label(device: SoCo) -> str:
    return device.player_name or device.uid or "?"


def _log_sonos(message: str) -> None:
    """Short timestamped Sonos action line (mirrors companion request logging)."""
    _log.info("%s Sonos %s", _utc_ts(), message)


def _normalize_sonos_uid(raw: str) -> tuple[str, str | None]:
    """Return (full_id, base_uid_without_group_suffix) for RINCON IDs."""
    s = (raw or "").strip()
    if not s:
        return "", None
    if ":" in s:
        return s, s.split(":", 1)[0]
    return s, None


def _name_for_sonos_uid(zones: set[SoCo], raw_uid: str) -> str | None:
    uid = (raw_uid or "").split("#", 1)[0].strip()
    want, base = _normalize_sonos_uid(uid)
    if not want:
        return None
    for device in zones:
        du = device.uid
        if du == want or (base is not None and du == base):
            return device.player_name or du
    return None


def format_playback_source_label(
    *,
    uri: str,
    title: str,
    artist: str,
    transport_state: str,
    resolve_speaker_name: Callable[[str], str | None],
) -> str | None:
    """Human-readable Sonos input/source for API responses."""
    uri = (uri or "").strip()
    title = (title or "").strip()
    artist = (artist or "").strip()
    state = (transport_state or "").upper()

    source_type = SoCo.music_source_from_uri(uri)
    if source_type == "NONE" or state == "STOPPED":
        return "Idle"

    if source_type == "LINE_IN":
        src_uid = uri.split(":", 1)[-1] if ":" in uri else ""
        src_name = resolve_speaker_name(src_uid)
        return f"Line-in · {src_name}" if src_name else "Line-in"

    if source_type == "TV":
        return "TV"
    if source_type == "AIRPLAY":
        return "AirPlay"
    if source_type == "SPOTIFY_CONNECT":
        return f"Spotify · {title}" if title else "Spotify"
    if source_type == "RADIO":
        return f"Radio · {title}" if title else "Radio"
    if source_type == "WEB_FILE":
        return title or "Streaming"

    if uri.startswith("x-rincon:") and not uri.startswith(("x-rincon-stream:", "x-rincon-queue:", "x-rincon-mp3radio:")):
        grouped_uid = uri.removeprefix("x-rincon:").split("#", 1)[0]
        grouped_name = resolve_speaker_name(grouped_uid)
        return f"Grouped · {grouped_name}" if grouped_name else "Grouped"

    if title and artist:
        return f"{title} — {artist}"
    if title:
        return title
    if source_type == "LIBRARY":
        return "Queue"
    if state in ("PLAYING", "TRANSITIONING", "PAUSED_PLAYBACK"):
        return "Playing"
    return None


class SonosService:
    def __init__(self) -> None:
        self._discovery_cache: dict[SonosRuntime, tuple[float, set[SoCo]]] = {}

    def discover_visible_zones(self, runtime: SonosRuntime) -> set[SoCo]:
        """Return visible Sonos players (SoCo instances). Same rules as list_speakers."""
        now = time.monotonic()
        cached = self._discovery_cache.get(runtime)
        if cached is not None:
            expires_at, zones = cached
            if now < expires_at:
                return zones

        zones = self._discover_visible_zones_uncached(runtime)
        self._discovery_cache[runtime] = (now + _DISCOVERY_CACHE_TTL_SECONDS, zones)
        return zones

    def _discover_visible_zones_uncached(self, runtime: SonosRuntime) -> set[SoCo]:
        """Perform SSDP/seed-IP discovery without using the in-memory cache."""
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

        speakers: list[SonosSpeaker] = []
        for device in sorted(zones, key=lambda z: (z.player_name or "").lower()):
            volume: int | None = None
            try:
                volume = int(device.volume)
            except Exception:  # noqa: BLE001
                pass
            source, playing = self._playback_status(device, zones)
            speakers.append(
                SonosSpeaker(
                    id=device.uid,
                    name=device.player_name,
                    ip=device.ip_address,
                    volume=volume,
                    source=source,
                    playing=playing,
                )
            )
        return speakers

    def _playback_status(self, device: SoCo, zones: set[SoCo]) -> tuple[str | None, bool | None]:
        """Return ``(source_label, playing)`` for a device via its group coordinator."""
        try:
            coord = self._group_coordinator(device)
            transport = coord.get_current_transport_info()
            track_info = coord.get_current_track_info()
            transport_state = str(transport.get("current_transport_state") or "")
            source = format_playback_source_label(
                uri=str(track_info.get("uri") or ""),
                title=str(track_info.get("title") or ""),
                artist=str(track_info.get("artist") or ""),
                transport_state=transport_state,
                resolve_speaker_name=lambda uid: _name_for_sonos_uid(zones, uid),
            )
            playing = transport_state.upper() in ("PLAYING", "TRANSITIONING")
            return source, playing
        except Exception as exc:  # noqa: BLE001
            _log.debug("Sonos playback status failed for %s: %s", device.player_name or device.uid, exc)
            return None, None

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

    @staticmethod
    def _current_group_member_uids(device: SoCo) -> set[str]:
        """Return UIDs of players in ``device``'s current zone group (solo if ungrouped)."""
        device.zone_group_state.poll(device)
        grp = device.group
        if grp is None:
            return {device.uid}
        members = getattr(grp, "members", None)
        if members:
            return {m.uid for m in members if getattr(m, "uid", None)}
        coord = getattr(grp, "coordinator", None)
        if coord is not None and getattr(coord, "uid", None):
            return {device.uid, coord.uid}
        return {device.uid}

    def _selection_already_grouped(self, targets: list[SoCo]) -> bool:
        """True when every target shares one group whose members are exactly the selection."""
        if not targets:
            return False
        want = {t.uid for t in targets}
        coord_uids: set[str] = set()
        for device in targets:
            if self._current_group_member_uids(device) != want:
                return False
            coord_uids.add(self._group_coordinator(device).uid)
        return len(coord_uids) == 1

    @staticmethod
    def _coordinator_line_in_state(coord: SoCo, line_src: SoCo) -> tuple[bool, bool]:
        """Return ``(on_desired_line_in, transport_playing)`` for the group coordinator."""
        try:
            track = coord.get_current_track_info() or {}
            uri = str(track.get("uri") or "").strip()
            transport = coord.get_current_transport_info() or {}
            state = str(transport.get("current_transport_state") or "").upper()
        except Exception:  # noqa: BLE001
            return False, False

        if not uri.startswith("x-rincon-stream:"):
            on_line = False
        else:
            stream_uid = uri.removeprefix("x-rincon-stream:").split("#", 1)[0]
            want_uid, want_base = _normalize_sonos_uid(line_src.uid)
            stream_full, stream_base = _normalize_sonos_uid(stream_uid)
            on_line = bool(
                stream_full
                and want_uid
                and (stream_full == want_uid or (want_base and stream_base == want_base))
            )
        playing = state in ("PLAYING", "TRANSITIONING")
        return on_line, playing

    def group_selected_and_play_line_in(
        self,
        runtime: SonosRuntime,
        output_speaker_ids: list[str],
        *,
        line_in_speaker_id: str = "",
        line_in_name_legacy: str = "",
        speaker_volumes: dict[str, int] | None = None,
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

        target_names = ", ".join(sorted(_speaker_label(t) for t in targets))
        _log_sonos(
            f"line-in start group=[{target_names}] master={_speaker_label(master)} "
            f"source={_speaker_label(line_src)}"
        )

        # Skip unjoin/join when the selection already forms exactly one group. Otherwise
        # unjoin first: SoCo join() does not drop other rooms still glued to a target.
        if self._selection_already_grouped(targets):
            _log_sonos(f"group already ok [{target_names}]")
        else:
            for d in sorted(targets, key=lambda z: (z.uid or "")):
                try:
                    _log_sonos(f"unjoin {_speaker_label(d)}")
                    d.unjoin()
                except Exception as exc:  # noqa: BLE001
                    _log.warning("Sonos unjoin %s failed (continuing): %s", d.player_name, exc)

            for d in targets:
                if d.uid != master.uid:
                    try:
                        _log_sonos(f"join {_speaker_label(d)} → {_speaker_label(master)}")
                        d.join(master)
                    except Exception as exc:  # noqa: BLE001
                        _log.warning(
                            "Sonos join %s → %s failed: %s",
                            d.player_name,
                            master.player_name,
                            exc,
                        )
                        raise

        volume_note = ""
        if speaker_volumes:
            volume_note = self._apply_speaker_volumes(zones, output_speaker_ids, speaker_volumes)

        coord = self._group_coordinator(master)
        try:
            on_line, playing = self._coordinator_line_in_state(coord, line_src)
            if on_line and playing:
                _log_sonos(
                    f"line-in already ok {_speaker_label(coord)} ← {_speaker_label(line_src)}"
                )
            else:
                if not on_line:
                    if coord.uid == line_src.uid:
                        _log_sonos(f"switch_to_line_in {_speaker_label(coord)}")
                        coord.switch_to_line_in()
                    else:
                        _log_sonos(
                            f"switch_to_line_in {_speaker_label(coord)} ← {_speaker_label(line_src)}"
                        )
                        coord.switch_to_line_in(source=line_src)
                _log_sonos(f"play {_speaker_label(coord)}")
                coord.play()
        except Exception as exc:  # noqa: BLE001
            _log.exception("Sonos line-in playback failed")
            raise RuntimeError(f"Sonos line-in failed: {exc}") from exc

        names = ", ".join(sorted((t.player_name or t.uid) for t in targets))
        base = f"Sonos: grouped [{names}] → line-in from {line_src.player_name or line_src.uid}."
        _log_sonos(f"line-in ok group=[{names}] source={line_src.player_name or line_src.uid}")
        return f"{base} {volume_note}".strip() if volume_note else base

    def _apply_speaker_volumes(
        self,
        zones: set,
        output_speaker_ids: list[str],
        speaker_volumes: dict[str, int],
    ) -> str:
        lines: list[str] = []
        seen_uid: set[str] = set()
        for sid in output_speaker_ids:
            if sid not in speaker_volumes:
                continue
            dev = self._device_for_api_speaker_id(zones, sid)
            if dev is None or dev.uid in seen_uid:
                continue
            seen_uid.add(dev.uid)
            vol = max(0, min(100, int(speaker_volumes[sid])))
            try:
                _log_sonos(f"volume {_speaker_label(dev)}={vol}")
                dev.volume = vol
            except Exception as exc:  # noqa: BLE001
                _log.warning("Sonos volume set failed for %s: %s", dev.player_name or dev.uid, exc)
                label = dev.player_name or dev.uid
                lines.append(f"{label} (failed: {exc})")
                continue
            label = dev.player_name or dev.uid
            lines.append(f"{label} → {vol}%")
        if not lines:
            return ""
        return f"Sonos: volume set on {'; '.join(sorted(lines))}."

    def stop_selected_speakers(self, runtime: SonosRuntime, output_speaker_ids: list[str]) -> str:
        """Stop playback on the coordinator for each selected speaker (deduplicated by group)."""
        coordinators, err = self._unique_coordinators_for_speaker_ids(
            runtime, output_speaker_ids, no_zones_detail="nothing to stop."
        )
        if err:
            return err

        stopped: list[str] = []
        for coord in coordinators:
            _log_sonos(f"stop {_speaker_label(coord)}")
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

    def add_speakers_to_group(
        self,
        runtime: SonosRuntime,
        group_speaker_ids: list[str],
        speaker_ids_to_add: list[str],
    ) -> str:
        """Join speakers onto the coordinator of the current group (or form a new group)."""
        to_add, err = self._unique_devices_for_speaker_ids(
            runtime,
            speaker_ids_to_add,
            no_zones_detail="nothing to add.",
        )
        if err:
            return err

        group_devs: list[SoCo] = []
        if group_speaker_ids:
            group_devs, group_err = self._unique_devices_for_speaker_ids(
                runtime,
                group_speaker_ids,
                no_zones_detail="nothing to add.",
            )
            if group_err and "no zones discovered" in group_err:
                return group_err
            # Stale ids are ignored; we still form/extend a group from matched devices.

        if group_devs:
            master = self._group_coordinator(group_devs[0])
        else:
            master = sorted(to_add, key=lambda z: (z.player_name or "").lower())[0]

        _log_sonos(
            f"group add master={_speaker_label(master)} "
            f"speakers=[{', '.join(sorted(_speaker_label(d) for d in to_add))}]"
        )
        joined_any = False
        for d in to_add:
            if d.uid == master.uid:
                continue
            try:
                if self._group_coordinator(d).uid == master.uid:
                    continue
            except Exception:  # noqa: BLE001
                pass
            joined_any = True
            try:
                _log_sonos(f"unjoin {_speaker_label(d)}")
                d.unjoin()
            except Exception as exc:  # noqa: BLE001
                _log.warning("Sonos unjoin %s failed (continuing): %s", d.player_name, exc)
            try:
                _log_sonos(f"join {_speaker_label(d)} → {_speaker_label(master)}")
                d.join(master)
            except Exception as exc:  # noqa: BLE001
                _log.warning("Sonos join %s → %s failed: %s", d.player_name, master.player_name, exc)
                raise

        added_names = ", ".join(sorted((d.player_name or d.uid) for d in to_add))
        master_name = master.player_name or master.uid
        if not joined_any and group_devs:
            _log_sonos(f"group already ok master={_speaker_label(master)}")
            return f"Sonos: {added_names} already in group with {master_name}."
        if group_devs:
            return f"Sonos: added {added_names} to group with {master_name}."
        if len(to_add) == 1:
            return f"Sonos: selected {added_names}."
        return f"Sonos: grouped {added_names} (coordinator {master_name})."

    def remove_speakers_from_group(self, runtime: SonosRuntime, speaker_ids: list[str]) -> str:
        """Unjoin speakers so they leave their current Sonos group."""
        devices, err = self._unique_devices_for_speaker_ids(
            runtime,
            speaker_ids,
            no_zones_detail="nothing to remove.",
        )
        if err:
            return err

        removed: list[str] = []
        for d in devices:
            try:
                _log_sonos(f"unjoin {_speaker_label(d)}")
                d.unjoin()
            except Exception as exc:  # noqa: BLE001
                _log.warning("Sonos unjoin %s failed: %s", d.player_name, exc)
                raise
            removed.append(d.player_name or d.uid)

        names = ", ".join(sorted(removed))
        _log_sonos(f"group remove [{names}]")
        return f"Sonos: removed {names} from group."

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

        sign = "+" if delta > 0 else ""
        _log_sonos(
            f"volume adjust {sign}{delta} "
            f"speakers=[{', '.join(sorted(_speaker_label(d) for d in devices))}]"
        )
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
            _log_sonos(f"volume {label}={new_vol}")

        names = "; ".join(sorted(lines))
        return f"Sonos: volume {sign}{delta}% on {names}."

    def set_absolute_volumes(self, runtime: SonosRuntime, volumes: dict[str, int]) -> str:
        """Set absolute volume percent on each matched Sonos zone."""
        if not volumes:
            return "Sonos: no volume levels requested."
        zones = self.discover_visible_zones(runtime)
        if not zones:
            return "Sonos: no zones discovered — nothing to set."

        lines: list[str] = []
        seen_uid: set[str] = set()
        for sid, raw_vol in volumes.items():
            dev = self._device_for_api_speaker_id(zones, sid)
            if dev is None or dev.uid in seen_uid:
                continue
            seen_uid.add(dev.uid)
            vol = max(0, min(100, int(raw_vol)))
            try:
                _log_sonos(f"volume {_speaker_label(dev)}={vol}")
                dev.volume = vol
            except Exception as exc:  # noqa: BLE001
                _log.warning("Sonos volume set failed for %s: %s", dev.player_name or dev.uid, exc)
                label = dev.player_name or dev.uid
                lines.append(f"{label} (failed: {exc})")
                continue
            label = dev.player_name or dev.uid
            lines.append(f"{label} → {vol}%")

        if not lines:
            return "Sonos: no speakers matched for volume set."
        return f"Sonos: volume set on {'; '.join(sorted(lines))}."

    def set_absolute_volumes_selected(
        self,
        runtime: SonosRuntime,
        output_speaker_ids: list[str],
        volumes: dict[str, int],
    ) -> str:
        """Set absolute volume percent on each selected Sonos zone."""
        if not volumes:
            return ""
        filtered = {sid: volumes[sid] for sid in output_speaker_ids if sid in volumes}
        if not filtered:
            return "Sonos: no selected speakers matched for initial volume."
        msg = self.set_absolute_volumes(runtime, filtered)
        if msg.startswith("Sonos: volume set on "):
            return f"Sonos: initial volume on {msg.removeprefix('Sonos: volume set on ')}"
        return msg

    def selection_transport_playing(self, runtime: SonosRuntime, output_speaker_ids: list[str]) -> tuple[bool | None, str | None]:
        """Return (playing, error). True if any coordinator for the selection is PLAYING or TRANSITIONING."""
        coordinators, err = self._unique_coordinators_for_speaker_ids(
            runtime, output_speaker_ids, no_zones_detail="nothing to query."
        )
        if err:
            return None, err
        try:
            playing_any = False
            for coord in coordinators:
                coord.zone_group_state.poll(coord)
                st = (coord.get_current_transport_info().get("current_transport_state") or "").upper()
                if st in ("PLAYING", "TRANSITIONING"):
                    playing_any = True
            return playing_any, None
        except Exception as exc:  # noqa: BLE001
            _log.warning("Sonos transport state query failed: %s", exc)
            return None, str(exc)
