from __future__ import annotations

import logging
import socket
import struct
import time
from dataclasses import dataclass
from typing import Literal

_log = logging.getLogger(__name__)

DEFAULT_PORT = 60128
DEFAULT_TIMEOUT = 4.0
# Pioneer main-zone MVL index: dB = (index / 2) - offset (0.5 dB per step). Index 0 = mute (−∞).
PIONEER_MVL_DB_OFFSET = 82.0

# Earlier UI builds used wrong SLI codes for HDMI presets (e.g. 22 = phono, not HDMI 2).
# Remap codes saved by older UI builds. Do not remap "23" — it is CD on VSX-LX505 (old builds wrongly used it for HDMI 3).
_LEGACY_INPUT_CODES: dict[str, str] = {
    "12": "10",
    "22": "02",
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


def _iscp_message_from_packet(raw: bytes) -> str | None:
    if len(raw) < 16:
        return None
    try:
        magic, header_size, data_size, _version, _reserved = struct.unpack("!4sIIb3s", raw[:16])
    except struct.error:
        return None
    if magic != b"ISCP" or header_size != 16:
        return None
    body = raw[16 : 16 + data_size].decode("ascii", errors="ignore")
    if len(body) < 3 or body[0] != "!":
        return None
    zone_end = 1
    while zone_end < len(body) and body[zone_end].isdigit():
        zone_end += 1
    return body[zone_end:].strip("\r\n")


def _iter_iscp_packets(raw: bytes) -> list[str]:
    messages: list[str] = []
    offset = 0
    while offset + 16 <= len(raw):
        try:
            magic, header_size, data_size, _version, _reserved = struct.unpack(
                "!4sIIb3s",
                raw[offset : offset + 16],
            )
        except struct.error:
            break
        if magic != b"ISCP" or header_size != 16:
            break
        packet_end = offset + 16 + data_size
        if packet_end > len(raw):
            break
        msg = _iscp_message_from_packet(raw[offset:packet_end])
        if msg:
            messages.append(msg)
        offset = packet_end
    return messages


def _is_query_answer(sent_command: str, message: str) -> bool:
    if message == sent_command or message.endswith("QSTN"):
        return False
    prefix = sent_command[:3]
    if not message.startswith(prefix):
        return False
    return len(message) > len(prefix)


def _recv_query_answer(
    sock: socket.socket,
    sent_command: str,
    timeout: float,
    *,
    collected: list[str] | None = None,
) -> str | None:
    """Read eISCP packets until the receiver answers a QSTN query (not the echo)."""
    deadline = time.time() + timeout
    buffer = b""
    last_match: str | None = None
    while time.time() < deadline:
        remaining = deadline - time.time()
        if remaining <= 0:
            break
        chunk = _recv_response(sock, min(0.35, remaining))
        if not chunk:
            continue
        buffer += chunk
        for message in _iter_iscp_packets(buffer):
            if collected is not None:
                collected.append(message)
            if _is_query_answer(sent_command, message):
                last_match = message
    for message in _iter_iscp_packets(buffer):
        if collected is not None and message not in collected:
            collected.append(message)
        if _is_query_answer(sent_command, message):
            last_match = message
    return last_match


def _latest_answer(messages: list[str], prefix: str) -> str | None:
    for message in reversed(messages):
        if message.startswith(prefix) and not message.endswith("QSTN") and len(message) > len(prefix):
            return message
    return None


def _send_query(
    host: str,
    command: str,
    *,
    port: int = DEFAULT_PORT,
    timeout: float = DEFAULT_TIMEOUT,
) -> str | None:
    packet = _frame(command)
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.sendall(packet)
        return _recv_query_answer(sock, command, timeout)


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
            answer = _recv_query_answer(sock, command, timeout)
            return answer.encode("ascii") if answer else b""
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


def percent_to_volume_level(percent: int) -> int:
    """Map UI volume percent (0–100) to Pioneer ISCP MVL index (0–80)."""
    p = max(0, min(100, int(percent)))
    return round(p * 80 / 100)


def set_volume(host: str, level: int, *, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT) -> None:
    level = max(0, min(80, int(level)))
    _send_command(host, f"MVL{level:02X}", port=port, timeout=timeout)


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


def _parse_iscp_hex_value(text: str, prefix: str, *, value_len: int = 2) -> str | None:
    idx = text.find(prefix)
    if idx < 0:
        return None
    tail = text[idx + len(prefix) :]
    value = ""
    for ch in tail:
        if ch in "0123456789ABCDEFabcdef":
            value += ch.upper()
            if len(value) >= value_len:
                return value[:value_len]
        elif value:
            break
    return value or None


def _parse_power_answer(message: str | None) -> bool | None:
    if not message:
        return None
    msg = message.strip().upper()
    if msg in ("PWR01", "PWRON"):
        return True
    if msg in ("PWR00", "PWROFF"):
        return False
    if msg.startswith("PWR") and len(msg) > 3:
        tail = msg[3:]
        if tail in ("01", "ON"):
            return True
        if tail in ("00", "OFF"):
            return False
    return None


def _parse_power_from_session(messages: list[str], raw: bytes) -> bool | None:
    for message in reversed(messages):
        state = _parse_power_answer(message)
        if state is not None:
            return state
    text = raw.decode("ascii", errors="ignore").upper()
    for token, state in (("PWR01", True), ("PWRON", True), ("PWR00", False), ("PWROFF", False)):
        if token in text:
            return state
    return None


def _parse_volume_answer(message: str | None) -> int | None:
    if not message:
        return None
    code = _parse_iscp_hex_value(message, "MVL")
    if not code:
        return None
    try:
        return max(int(code, 16), 0)
    except ValueError:
        return None


def volume_level_is_muted(level: int | None) -> bool:
    return level == 0


def volume_level_to_db(level: int | None) -> float | None:
    """Map Pioneer ISCP MVL index to dB (matches receiver front-panel display)."""
    if level is None or volume_level_is_muted(level):
        return None
    return round(level / 2 - PIONEER_MVL_DB_OFFSET, 1)


def query_power(host: str, *, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT) -> bool | None:
    return _parse_power_answer(_send_query(host, "PWRQSTN", port=port, timeout=timeout))


def query_input(host: str, *, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT) -> str | None:
    msg = _send_query(host, "SLIQSTN", port=port, timeout=timeout)
    if not msg:
        return None
    return _parse_iscp_hex_value(msg, "SLI")


def query_volume(host: str, *, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT) -> int | None:
    """Return main-zone volume level in 0–80 ISCP steps, or None."""
    return _parse_volume_answer(_send_query(host, "MVLQSTN", port=port, timeout=timeout))


@dataclass(frozen=True)
class PioneerReceiverStatus:
    power_on: bool | None
    input_code: str | None
    volume_level: int | None
    volume_db: float | None
    volume_muted: bool = False


def query_status(host: str, *, port: int = DEFAULT_PORT, timeout: float = DEFAULT_TIMEOUT) -> PioneerReceiverStatus:
    """Query power, input, and volume over one TCP session."""
    per_query_timeout = min(timeout, 2.5)
    messages: list[str] = []
    raw = b""
    with socket.create_connection((host, port), timeout=timeout) as sock:
        for command in ("PWRQSTN", "SLIQSTN", "MVLQSTN"):
            sock.sendall(_frame(command))
            deadline = time.time() + per_query_timeout
            buffer = b""
            while time.time() < deadline:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                chunk = _recv_response(sock, min(0.35, remaining))
                if not chunk:
                    continue
                buffer += chunk
                raw += chunk
                for message in _iter_iscp_packets(buffer):
                    messages.append(message)

    power_on = _parse_power_from_session(messages, raw)
    input_msg = _latest_answer(messages, "SLI")
    volume_msg = _latest_answer(messages, "MVL")
    input_code = _parse_iscp_hex_value(input_msg, "SLI") if input_msg else None
    volume_level = _parse_volume_answer(volume_msg)
    if power_on is None and (input_code is not None or volume_level is not None):
        # VSX units often omit a distinct PWR QSTN body but still answer SLI/MVL when the main zone is active.
        power_on = True
    muted = volume_level_is_muted(volume_level)
    return PioneerReceiverStatus(
        power_on=power_on,
        input_code=input_code,
        volume_level=volume_level,
        volume_db=volume_level_to_db(volume_level),
        volume_muted=muted,
    )


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
