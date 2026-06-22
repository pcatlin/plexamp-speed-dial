from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.audio_output.types import SonosOutputConfig
from app.services.runtime_setup import resolve_sonos_runtime
from app.services.sonos_service import SonosService


def play_line_in(
    sonos: SonosService,
    db: Session,
    *,
    target_speaker_ids: list[str],
    line_in_speaker_id: str,
    speaker_volumes: dict[str, int] | None = None,
) -> str:
    runtime = resolve_sonos_runtime(db)
    return sonos.group_selected_and_play_line_in(
        runtime,
        target_speaker_ids,
        line_in_speaker_id=line_in_speaker_id,
        line_in_name_legacy="",
        speaker_volumes=speaker_volumes,
    )


def line_in_speaker_id_from_config(config: SonosOutputConfig) -> str:
    return config.speaker_id.strip()
