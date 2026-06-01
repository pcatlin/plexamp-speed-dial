from app.services.audio_output import pioneer_eiscp


def test_eiscp_frame_contains_command():
    packet = pioneer_eiscp._frame("PWR01")
    assert packet.startswith(b"ISCP")
    assert b"!1PWR01" in packet
    assert len(packet) == 16 + len(b"!1PWR01\r")


def test_eiscp_header_is_16_bytes():
    import struct

    packet = pioneer_eiscp._frame("PWRQSTN")
    header = packet[:16]
    magic, header_size, data_size, version, reserved = struct.unpack("!4sIIb3s", header)
    assert magic == b"ISCP"
    assert header_size == 16
    assert data_size == len(b"!1PWRQSTN\r")
    assert version == 1
    assert reserved == b"\x00\x00\x00"


def test_normalize_input_code_remaps_legacy_hdmi2():
    assert pioneer_eiscp.normalize_input_code("22") == "02"


def test_prepare_playback_calls_power_and_input(monkeypatch):
    calls: list[str] = []

    def fake_send(host: str, command: str, *, port: int = 60128, timeout: float = 4.0, expect_response: bool = False) -> bytes:
        calls.append(command)
        if command == "SLIQSTN":
            return b"ISCP\x00\x00\x00\x10\x00\x00\x00\x0c\x01\x00\x00\x00!1SLI02\r"
        return b""

    monkeypatch.setattr(pioneer_eiscp, "_send_command", fake_send)
    monkeypatch.setattr(pioneer_eiscp.time, "sleep", lambda _s: None)
    msg = pioneer_eiscp.prepare_playback("192.168.1.9", "02", port=60128)
    assert calls == ["PWR01", "SLI02", "SLIQSTN"]
    assert "SLI02" in msg
    assert "192.168.1.9" in msg


def test_volume_down_uses_mvldown_not_mvldn(monkeypatch):
    calls: list[str] = []

    def fake_send(host: str, command: str, *, port: int = 60128, timeout: float = 4.0) -> None:
        calls.append(command)

    monkeypatch.setattr(pioneer_eiscp, "_send_command", fake_send)
    pioneer_eiscp.volume_down("192.168.1.9")
    assert calls[0].startswith("MVLDOWN")
    assert calls[0] != "MVLDN"


def test_volume_adjust_sends_multiple_steps(monkeypatch):
    calls: list[str] = []

    def fake_send(host: str, command: str, *, port: int = 60128, timeout: float = 4.0) -> None:
        calls.append(command)

    monkeypatch.setattr(pioneer_eiscp, "_send_command", fake_send)
    monkeypatch.setattr(pioneer_eiscp.time, "sleep", lambda _s: None)
    steps = pioneer_eiscp.volume_adjust("10.0.0.5", 10, port=60128)
    assert steps == 2
    assert len(calls) == 2
    assert all(c in pioneer_eiscp._VOLUME_UP_COMMANDS for c in calls)
