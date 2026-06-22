from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import PlexampPlayer
from app.services.audio_output import pioneer_eiscp
from app.services.audio_output.sonos_route import line_in_speaker_id_from_config, play_line_in
from app.schemas.domain import InitialVolumes, ReceiverStateResponse
from app.services.audio_output.types import (
    AudioOutput,
    audio_output_from_player_row,
    parse_pioneer_config,
    parse_sonos_config,
)
from app.services.runtime_setup import resolve_sonos_runtime
from app.services.sonos_service import SonosService

_log = logging.getLogger(__name__)


class AudioOutputRouter:
    def __init__(self, sonos_service: SonosService | None = None) -> None:
        self._sonos = sonos_service or SonosService()

    @staticmethod
    def output_for_player(player: PlexampPlayer) -> AudioOutput:
        return audio_output_from_player_row(player)

    def prepare_for_play(
        self,
        player: PlexampPlayer,
        db: Session,
        *,
        target_speaker_ids: list[str],
        initial_volumes: InitialVolumes | None = None,
    ) -> str:
        output = self.output_for_player(player)
        kind = output.kind
        if kind == "none":
            return "No external audio output configured for this player."
        if kind == "sonos":
            if not target_speaker_ids:
                return (
                    "Sonos: no speakers selected in Play to. "
                    "Select speakers or change this player to Pioneer/none in Setup."
                )
            cfg = parse_sonos_config(output)
            line_sid = line_in_speaker_id_from_config(cfg)
            if not line_sid:
                return "Sonos: no line-in speaker configured for this player in Setup."
            try:
                sonos_volumes = initial_volumes.sonos if initial_volumes and initial_volumes.sonos else None
                return play_line_in(
                    self._sonos,
                    db,
                    target_speaker_ids=target_speaker_ids,
                    line_in_speaker_id=line_sid,
                    speaker_volumes=sonos_volumes,
                )
            except Exception as exc:  # noqa: BLE001
                _log.exception("Sonos line-in orchestration failed")
                return f"Sonos error: {exc}"
        if kind == "pioneer":
            cfg = parse_pioneer_config(output)
            if not cfg.host:
                return "Pioneer: receiver IP is not configured in Setup."
            try:
                note = pioneer_eiscp.prepare_playback(cfg.host, cfg.input_code, port=cfg.port)
                if initial_volumes and initial_volumes.pioneer is not None:
                    level = pioneer_eiscp.percent_to_volume_level(initial_volumes.pioneer)
                    pioneer_eiscp.set_volume(cfg.host, level, port=cfg.port)
                    note = f"{note} Pioneer: volume {initial_volumes.pioneer}%."
                return note
            except OSError as exc:
                _log.exception("Pioneer ISCP prepare failed")
                return f"Pioneer error: {exc}"
            except Exception as exc:  # noqa: BLE001
                _log.exception("Pioneer prepare failed")
                return f"Pioneer error: {exc}"
        return f"Unknown audio output kind: {kind!r}"

    def apply_initial_volumes(
        self,
        player: PlexampPlayer,
        db: Session,
        *,
        target_speaker_ids: list[str],
        initial_volumes: InitialVolumes | None,
    ) -> str:
        """Fallback volume apply when Sonos is already playing outside the Start flow."""
        if initial_volumes is None:
            return ""
        notes: list[str] = []
        if initial_volumes.sonos and target_speaker_ids:
            runtime = resolve_sonos_runtime(db)
            note = self._sonos.set_absolute_volumes_selected(runtime, target_speaker_ids, initial_volumes.sonos)
            if note:
                notes.append(note)
        return " ".join(notes)

    def adjust_volume(self, player: PlexampPlayer, delta: int) -> str:
        output = self.output_for_player(player)
        if output.kind == "sonos":
            raise ValueError("Use Sonos volume endpoints when player output is Sonos line-in.")
        if output.kind != "pioneer":
            raise ValueError("This player has no volume-controllable audio output configured.")
        cfg = parse_pioneer_config(output)
        if delta == 0:
            return "Pioneer: no volume change requested."
        try:
            steps = pioneer_eiscp.volume_adjust(cfg.host, delta, port=cfg.port)
        except OSError as exc:
            raise ValueError(f"Pioneer volume failed: {exc}") from exc
        return f"Pioneer: volume {'up' if delta > 0 else 'down'} ({steps} step(s)) on {cfg.host}."

    def set_power(self, player: PlexampPlayer, *, on: bool) -> str:
        output = self.output_for_player(player)
        if output.kind != "pioneer":
            raise ValueError("Power control is only available for Pioneer audio output.")
        cfg = parse_pioneer_config(output)
        try:
            pioneer_eiscp.power(cfg.host, on=on, port=cfg.port)
        except OSError as exc:
            raise ValueError(f"Pioneer power failed: {exc}") from exc
        return f"Pioneer: {'on' if on else 'standby'} ({cfg.host})."

    def pioneer_status(self, player: PlexampPlayer) -> pioneer_eiscp.PioneerReceiverStatus:
        output = self.output_for_player(player)
        if output.kind != "pioneer":
            raise ValueError("Status is only available for Pioneer audio output.")
        cfg = parse_pioneer_config(output)
        if not cfg.host:
            raise ValueError("Pioneer receiver IP is not configured in Setup.")
        try:
            return pioneer_eiscp.query_status(cfg.host, port=cfg.port)
        except OSError as exc:
            raise ValueError(f"Pioneer status failed: {exc}") from exc

    def receiver_state(self, player: PlexampPlayer) -> ReceiverStateResponse:
        output = self.output_for_player(player)
        if output.kind != "pioneer":
            return ReceiverStateResponse(ok=True, power_on=None, input_code=None, volume_db=None)
        try:
            status = self.pioneer_status(player)
        except ValueError as exc:
            return ReceiverStateResponse(ok=False, error=str(exc))
        return ReceiverStateResponse(
            ok=True,
            power_on=status.power_on,
            input_code=status.input_code,
            volume_db=status.volume_db,
            volume_muted=status.volume_muted,
        )

    def test_output(self, player: PlexampPlayer) -> str:
        output = self.output_for_player(player)
        if output.kind == "none":
            return "No audio output configured for this player."
        if output.kind == "sonos":
            cfg = parse_sonos_config(output)
            if not cfg.speaker_id:
                return "Sonos line-in speaker is not selected in Setup."
            return f"Sonos line-in speaker id configured: {cfg.speaker_id!r}."
        if output.kind == "pioneer":
            cfg = parse_pioneer_config(output)
            if not cfg.host:
                return "Pioneer receiver IP is empty."
            try:
                return pioneer_eiscp.test_connection(cfg.host, cfg.input_code, port=cfg.port)
            except (OSError, ValueError) as exc:
                raise ValueError(str(exc)) from exc
        return f"Unknown audio output kind: {output.kind!r}"
