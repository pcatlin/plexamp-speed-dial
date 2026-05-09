from sqlalchemy.orm import Session

from app.models import PlexampPlayer, SonosGroupPreset
from app.schemas.domain import PlayRequest, PlayResponse


class PlaybackService:
    def play(self, payload: PlayRequest, db: Session) -> PlayResponse:
        player = db.get(PlexampPlayer, payload.player_id)
        if not player:
            return PlayResponse(status="error", details="Selected Plexamp player not found")

        target_speakers = payload.speaker_ids
        if payload.preset_id:
            preset = db.get(SonosGroupPreset, payload.preset_id)
            if not preset:
                return PlayResponse(status="error", details="Sonos preset not found")
            target_speakers = preset.speaker_ids

        details = (
            f"Queued {payload.media_type} {payload.media_id} on {player.name} "
            f"for speakers: {', '.join(target_speakers) if target_speakers else 'none selected'}"
        )
        return PlayResponse(status="ok", details=details)
