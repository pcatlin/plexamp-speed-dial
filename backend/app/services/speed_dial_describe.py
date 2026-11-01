"""Human-readable play-target descriptions for speed-dial favorites (HA / API clients)."""

from __future__ import annotations

from typing import Any


def format_speed_dial_play_description(
    *,
    player_name: str,
    output_kind: str,
    pioneer_label: str = "",
    speaker_ids: list[str] | None = None,
    speaker_names: dict[str, str] | None = None,
    initial_volumes: dict[str, Any] | None = None,
) -> str:
    """
    Build a short description of what play would activate.

    Examples:
      ``Kitchen · Bathroom (20%), Fridge (10%)``
      ``Caldera · 192.168.1.50 (35%)``
      ``Amp · No speakers``
    """
    player = (player_name or "").strip() or "Unknown player"
    volumes = initial_volumes if isinstance(initial_volumes, dict) else {}
    kind = (output_kind or "none").strip().lower()

    if kind == "pioneer":
        label = (pioneer_label or "").strip() or "Pioneer AVR"
        pioneer_vol = volumes.get("pioneer")
        if pioneer_vol is not None:
            try:
                target = f"{label} ({int(pioneer_vol)}%)"
            except (TypeError, ValueError):
                target = label
        else:
            target = label
        return f"{player} · {target}"

    ids = [str(sid) for sid in (speaker_ids or []) if sid]
    names = speaker_names or {}
    if not ids:
        return f"{player} · No speakers"

    sonos_vols = volumes.get("sonos") if isinstance(volumes.get("sonos"), dict) else {}
    parts: list[str] = []
    for sid in ids:
        name = (names.get(sid) or "").strip() or sid
        vol = sonos_vols.get(sid)
        if vol is not None:
            try:
                parts.append(f"{name} ({int(vol)}%)")
            except (TypeError, ValueError):
                parts.append(name)
        else:
            parts.append(name)
    return f"{player} · {', '.join(parts)}"
