from app.models import PlexampPlayer, SonosGroupPreset
from app.schemas.domain import PlayRequest
from app.services.playback_service import PlaybackService


def test_playback_service_returns_error_when_player_missing(db_session):
    service = PlaybackService()
    result = service.play(
        PlayRequest(media_type="album", media_id="a1", player_id=99, speaker_ids=[]),
        db_session,
    )
    assert result.status == "error"
    assert "not found" in result.details.lower()


def test_playback_service_uses_preset_speakers(db_session):
    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True)
    preset = SonosGroupPreset(name="Downstairs", speaker_ids=["s1", "s2"])
    db_session.add_all([player, preset])
    db_session.commit()
    db_session.refresh(player)
    db_session.refresh(preset)

    service = PlaybackService()
    result = service.play(
        PlayRequest(media_type="playlist", media_id="p1", player_id=player.id, speaker_ids=["s3"], preset_id=preset.id),
        db_session,
    )
    assert result.status == "ok"
    assert "s1, s2" in result.details
