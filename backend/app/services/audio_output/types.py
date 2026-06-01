from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

AudioOutputKind = Literal["none", "sonos", "pioneer"]


class AudioOutput(BaseModel):
    kind: AudioOutputKind = "none"
    config: dict[str, Any] = Field(default_factory=dict)

    @field_validator("kind", mode="before")
    @classmethod
    def normalize_kind(cls, value: object) -> str:
        text = (str(value) if value is not None else "none").strip().lower()
        if text not in ("none", "sonos", "pioneer"):
            raise ValueError(f"Unsupported audio output kind: {value!r}")
        return text


class SonosOutputConfig(BaseModel):
    speaker_id: str = ""

    def normalized(self) -> SonosOutputConfig:
        return SonosOutputConfig(speaker_id=self.speaker_id.strip())


class PioneerOutputConfig(BaseModel):
    host: str
    input_code: str
    port: int = 60128

    @field_validator("input_code")
    @classmethod
    def validate_input_code(cls, value: str) -> str:
        code = (value or "").strip().upper()
        if len(code) != 2 or not all(c in "0123456789ABCDEF" for c in code):
            raise ValueError("input_code must be a 2-character ISCP input code (e.g. 02 for HDMI 2 / GAME).")
        return code

    @field_validator("port")
    @classmethod
    def validate_port(cls, value: int) -> int:
        if value < 1 or value > 65535:
            raise ValueError("port must be between 1 and 65535.")
        return value

    def normalized(self) -> PioneerOutputConfig:
        return PioneerOutputConfig(
            host=self.host.strip(),
            input_code=self.input_code,
            port=self.port,
        )


def audio_output_from_player_row(row: object) -> AudioOutput:
    kind = (getattr(row, "audio_output_kind", None) or "none").strip().lower()
    config = getattr(row, "audio_output_config", None) or {}
    if not isinstance(config, dict):
        config = {}
    if kind == "none":
        legacy = (getattr(row, "sonos_line_in_speaker_id", None) or "").strip()
        if legacy:
            return AudioOutput(kind="sonos", config={"speaker_id": legacy})
        return AudioOutput(kind="none", config={})
    return AudioOutput(kind=kind, config=config)


def apply_audio_output_to_row(row: object, output: AudioOutput) -> None:
    if output.kind == "sonos":
        parse_sonos_config(output)
    elif output.kind == "pioneer":
        parse_pioneer_config(output)
    row.audio_output_kind = output.kind
    row.audio_output_config = dict(output.config)
    if output.kind == "sonos":
        sid = str(output.config.get("speaker_id") or "").strip()
        row.sonos_line_in_speaker_id = sid
    else:
        row.sonos_line_in_speaker_id = ""


def parse_sonos_config(output: AudioOutput) -> SonosOutputConfig:
    return SonosOutputConfig.model_validate(output.config).normalized()


def parse_pioneer_config(output: AudioOutput) -> PioneerOutputConfig:
    return PioneerOutputConfig.model_validate(output.config).normalized()
