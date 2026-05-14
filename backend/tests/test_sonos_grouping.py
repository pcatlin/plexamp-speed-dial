"""Tests for Sonos zone grouping behavior in SonosService."""

from __future__ import annotations

import pytest

from app.services.runtime_setup import SonosRuntime
from app.services.sonos_service import SonosService


class _FakeGroup:
    def __init__(self, coordinator: object) -> None:
        self.coordinator = coordinator


class _FakeZoneState:
    def poll(self, device: object) -> None:  # noqa: ANN401
        return None


class FakeSonosDevice:
    """Minimal SoCo-shaped object for grouping tests."""

    def __init__(self, uid: str, name: str, *, volume: int = 50) -> None:
        self.uid = uid
        self.player_name = name
        self.zone_group_state = _FakeZoneState()
        self.group: _FakeGroup | None = None
        self.unjoin_calls = 0
        self.join_targets: list[str] = []
        self.switch_calls: list[object | None] = []
        self.play_calls = 0
        self._volume = volume

    @property
    def volume(self) -> int:
        return self._volume

    @volume.setter
    def volume(self, value: int) -> None:
        self._volume = int(value)

    def unjoin(self, **kwargs: object) -> None:
        self.unjoin_calls += 1
        self.group = None

    def join(self, master: FakeSonosDevice, **kwargs: object) -> None:
        self.join_targets.append(master.uid)
        self.group = _FakeGroup(coordinator=master)

    def switch_to_line_in(self, source: object | None = None, **kwargs: object) -> None:
        self.switch_calls.append(source)

    def play(self, **kwargs: object) -> None:
        self.play_calls += 1

    def set_relative_volume(self, relative_volume: int) -> int:
        self._volume = max(0, min(100, self._volume + int(relative_volume)))
        return self._volume


@pytest.fixture()
def runtime() -> SonosRuntime:
    return SonosRuntime(
        seed_ips="",
        discover_timeout=5,
        allow_network_scan=False,
        interface_addr="",
        line_in_source_name="Fridge",
        line_in_source_uid="",
    )


def test_group_selected_unjoins_targets_before_joining(runtime: SonosRuntime, monkeypatch: pytest.MonkeyPatch) -> None:
    """Unchecked rooms must not stay glued to a selected player via the old coordinator."""
    bathroom = FakeSonosDevice("uid-bath", "Bathroom")
    move = FakeSonosDevice("uid-move", "Sonos Move")
    fridge = FakeSonosDevice("uid-fridge", "Kitchen Fridge")

    # Move is still a satellite of Bathroom from a prior session.
    move.group = _FakeGroup(coordinator=bathroom)

    svc = SonosService()

    def fake_zones(rt: SonosRuntime) -> set[FakeSonosDevice]:  # noqa: ARG001
        return {bathroom, move, fridge}

    monkeypatch.setattr(svc, "discover_visible_zones", fake_zones)

    svc.group_selected_and_play_line_in(runtime, ["uid-move"])

    assert move.unjoin_calls == 1
    assert move.join_targets == []
    assert move.play_calls == 1
    assert len(move.switch_calls) == 1 and move.switch_calls[0] is fridge


def test_group_selected_unjoins_both_before_pairing(runtime: SonosRuntime, monkeypatch: pytest.MonkeyPatch) -> None:
    alpha = FakeSonosDevice("uid-a", "Alpha Room")
    beta = FakeSonosDevice("uid-b", "Beta Room")
    fridge = FakeSonosDevice("uid-fridge", "Fridge Amp")

    svc = SonosService()
    monkeypatch.setattr(svc, "discover_visible_zones", lambda rt: {alpha, beta, fridge})

    svc.group_selected_and_play_line_in(runtime, ["uid-b", "uid-a"])

    assert alpha.unjoin_calls == 1
    assert beta.unjoin_calls == 1
    # Master is lexicographically first by player name: "Alpha Room" < "Beta Room"
    assert alpha.join_targets == []
    assert beta.join_targets == [alpha.uid]
    assert alpha.play_calls == 1
    assert alpha.switch_calls and alpha.switch_calls[0] is fridge


def test_adjust_volume_selected_applies_relative_step_to_each_selected_zone(
    runtime: SonosRuntime, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Each checked speaker gets a relative volume step (grouped rooms are not collapsed to coordinator-only)."""
    kitchen = FakeSonosDevice("uid-k", "Kitchen", volume=98)
    kitchen.group = _FakeGroup(coordinator=kitchen)
    dining = FakeSonosDevice("uid-d", "Dining", volume=98)
    dining.group = _FakeGroup(coordinator=kitchen)

    svc = SonosService()
    monkeypatch.setattr(svc, "discover_visible_zones", lambda rt: {kitchen, dining})

    msg = svc.adjust_volume_selected(runtime, ["uid-k", "uid-d"], 10)
    assert kitchen.volume == 100
    assert dining.volume == 100
    assert "100%" in msg

    msg2 = svc.adjust_volume_selected(runtime, ["uid-d"], -20)
    assert kitchen.volume == 100
    assert dining.volume == 80
    assert "-20%" in msg2
