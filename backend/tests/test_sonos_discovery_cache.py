from unittest.mock import Mock

from app.services.runtime_setup import SonosRuntime
from app.services.sonos_service import SonosService


def test_discover_visible_zones_uses_cache_for_same_runtime(monkeypatch):
    runtime = SonosRuntime(
        seed_ips="192.168.0.170",
        discover_timeout=5,
        allow_network_scan=False,
        interface_addr="",
    )
    svc = SonosService()
    calls = {"n": 0}
    fake_device = Mock(uid="RINCON_1")

    def fake_discover(_runtime: SonosRuntime) -> set[Mock]:
        calls["n"] += 1
        return {fake_device}

    monkeypatch.setattr(svc, "_discover_visible_zones_uncached", fake_discover)

    assert svc.discover_visible_zones(runtime) == {fake_device}
    assert svc.discover_visible_zones(runtime) == {fake_device}
    assert calls["n"] == 1


def test_discover_visible_zones_cache_misses_when_runtime_changes(monkeypatch):
    runtime_a = SonosRuntime("192.168.0.170", 5, False, "")
    runtime_b = SonosRuntime("192.168.0.171", 5, False, "")
    svc = SonosService()
    calls = {"n": 0}

    def fake_discover(_runtime: SonosRuntime) -> set[Mock]:
        calls["n"] += 1
        return {Mock(uid=f"device-{calls['n']}")}

    monkeypatch.setattr(svc, "_discover_visible_zones_uncached", fake_discover)

    first = svc.discover_visible_zones(runtime_a)
    second = svc.discover_visible_zones(runtime_a)
    third = svc.discover_visible_zones(runtime_b)

    assert first is second
    assert third is not first
    assert calls["n"] == 2
