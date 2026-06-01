from __future__ import annotations

import logging
import socket
import struct
import time
from typing import Literal

_log = logging.getLogger(__name__)

DEFAULT_PORT = 60128
DEFAULT_TIMEOUT = 4.0

# Earlier UI builds used wrong SLI codes for HDMI presets (e.g. 22 = phono, not HDMI 2).
_LEGACY_INPUT_CODES: dict[str, str] = {
    "12": "10",
    "22": "02",
    "23": "01",
    "24": "11",
    "42": "22",
    "44": "23",
}


def normalize_input_code(input_code: str) -> str:
    code = input_code.strip().upper()
    return _LEGACY_INPUT_CODES.get(code, code)


def _frame(command: str) -> bytes:
    """Build eISCP packet (16-byte header + ``!1{command}\\r``), matching onkyo-eiscp."""
    iscp_message = f"!1{command}\r"
    header = struct.pack("!4sIIb3s", b"ISCP", 16, len(iscp_message), 0x01, b"\x00\x00\x00")
    return header + iscp_message.encode("ascii")


def _recv_response(sock: socket.socket, timeout: float) -> bytes:
    sock.settimeout(timeout)
    try:
        header_bytes = sock.recv(16)
    except socket.timeout:
        return b""
    if len(header_bytes) < 16:
        return header_bytes
    try:
        magic, header_size, data_size, _version, _reserved = struct.unpack("!4sIIb3s", header_bytes)
    except struct.error:
        return header_bytes
    if magic != b"ISCP" or header_size != 16:
        return header_bytes
    body = b""
    while len(body) < data_size:
        try:
            chunk = sock.recv(data_size - len(body))
        except socket.timeout:
            break
        if not chunk:
            break
        body += chunk
    return header_bytes + body


def _send_command(
    host: str,
    command: str,
    *,
    port: int = DEFAULT_PORT,
    timeout: float = DEFAULT_TIMEOUT,
    expect_response: bool = False,
) -> bytes:
    packet = _frame(command)
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.sendall(packet)
        if expect_response:
            return _recv_response(sock, timeout)
        try:
            return _recv_response(sock, min(timeout, 1.0))
        except OSError:
            return b""
    return b""


def power(host: str, *, on: bool, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT) -> None:
    _send_command(host, "PWR01" if on else "PWR00", port=port, timeout=timeout)


def set_input(host: str, input_code: str, *, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT) -> None:
    code = normalize_input_code(input_code)
    _send_command(host, f"SLI{code}", port=port, timeout=timeout)


_VOLUME_UP_COMMANDS = ("MVLUP1", "MVLUP")
_VOLUME_DOWN_COMMANDS = ("MVLDOWN1", "MVLDOWN")


def _volume_step(host: str, commands: tuple[str, ...], *, port: int, timeout: float) -> None:
    last_error: OSError | None = None
    for command in commands:
        try:
            _send_command(host, command, port=port, timeout=timeout)
            return
        except OSError as exc:
            last_error = exc
    if last_error is not None:
        raise last_error


def volume_up(host: str, *, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT) -> None:
    _volume_step(host, _VOLUME_UP_COMMANDS, port=port, timeout=timeout)


def volume_down(host: str, *, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT) -> None:
    _volume_step(host, _VOLUME_DOWN_COMMANDS, port=port, timeout=timeout)


def volume_adjust(
    host: str,
    delta: int,
    *,
    port: int = DEFAULT_PORT,
    timeout: float = DEFAULT_TIMEOUT,
    step_pause_s: float = 0.08,
) -> int:
    if delta == 0:
        return 0
    steps = max(1, min(abs(delta) // 5, 12))
    fn = volume_up if delta > 0 else volume_down
    for i in range(steps):
        fn(host, port=port, timeout=timeout)
        if i + 1 < steps:
            time.sleep(step_pause_s)
    return steps


def query_power(host: str, *, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT) -> bool | None:
    raw = _send_command(host, "PWRQSTN", port=port, timeout=timeout, expect_response=True)
    text = raw.decode("ascii", errors="ignore")
    if "PWR01" in text:
        return True
    if "PWR00" in text:
        return False
    return None


def query_input(host: str, *, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT) -> str | None:
    raw = _send_command(host, "SLIQSTN", port=port, timeout=timeout, expect_response=True)
    text = raw.decode("ascii", errors="ignore")
    marker = "SLI"
    idx = text.find(marker)
    if idx < 0:
        return None
    tail = text[idx + len(marker) :]
    code = ""
    for ch in tail:
        if ch in "0123456789ABCDEFabcdef":
            code += ch.upper()
            if len(code) == 2:
                return code
        elif code:
            break
    return None


def prepare_playback(host: str, input_code: str, *, port: int = DEFAULT_PORT) -> str:
    """Power on and switch to the configured input."""
    power(host, on=True, port=port)
    time.sleep(0.6)
    set_input(host, input_code, port=port)
    active = query_input(host, port=port)
    code = input_code.upper()
    if active == code:
        return f"Pioneer: powered on, input SLI{code} on {host}:{port}."
    if active:
        return (
            f"Pioneer: powered on on {host}:{port}; sent SLI{code} "
            f"(receiver reports SLI{active})."
        )
    return f"Pioneer: powered on, sent SLI{code} on {host}:{port} (input query had no response)."


def test_connection(host: str, input_code: str, *, port: int = DEFAULT_PORT) -> str:
    """Verify TCP + ISCP, then switch to the configured input."""
    try:
        state = query_power(host, port=port)
    except OSError as exc:
        raise ValueError(
            f"Cannot reach {host}:{port} ({exc}). "
            "Check IP, enable Network/IP control on the receiver, and Hybrid Standby / network standby settings."
        ) from exc
    if state is None:
        raise ValueError(
            f"Connected to {host}:{port} but no ISCP response to PWRQSTN. "
            "Confirm IP control is enabled (not RS-232 only) and port is 60128."
        )
    power_label: Literal["on", "off", "unknown"] = (
        "on" if state is True else "off" if state is False else "unknown"
    )
    if not state:
        power(host, on=True, port=port)
        time.sleep(0.6)
    code = input_code.upper()
    set_input(host, code, port=port)
    time.sleep(0.3)
    active = query_input(host, port=port)
    if active == code:
        return f"Pioneer at {host}:{port} (power {power_label}): switched to input SLI{code}."
    if active:
        return (
            f"Pioneer at {host}:{port} (power {power_label}): sent SLI{code}, "
            f"receiver reports SLI{active}. Check Input Assign on the AVR if wrong."
        )
    return (
        f"Pioneer at {host}:{port} (power {power_label}): sent SLI{code} "
        "(no SLI response; input may still have changed)."
    )
