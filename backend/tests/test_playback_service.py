from unittest.mock import Mock

import pytest

from app.models import PlexCredential, PlexampPlayer, SonosGroupPreset
from app.schemas.domain import PlayRequest
from app.services.playback_service import PlaybackService


@pytest.fixture()
def patched_play_queue(monkeypatch):
    fake = Mock()
    fake.status_code = 200
    fake.text = ""
    monkeypatch.setattr("app.services.playback_service.create_play_queue", lambda **kwargs: fake)
    return fake


class FakePMS:
    machineIdentifier = "machine-id"
    library = type("Lib", (), {"identifier": "com.plexapp.plugins.library"})()

    class _Item:
        def __init__(self) -> None:
            self.type = "playlist"
            self.title = "My Mix"
            self.key = "/library/metadata/100"

        def station(self):  # pragma: no cover - not artist
            return None

    def fetchItem(self, rating_key: int):  # noqa: ANN001
        return FakePMS._Item()


class FakePlexService:
    def connect_server(self, token: str, conn=None) -> FakePMS:  # noqa: ANN001
        assert token == "dummy-token"
        return FakePMS()


class FakeSonosService:
    def group_selected_and_play_line_in(self, runtime, output_speaker_ids):  # noqa: ANN001
        return f"Sonos: ok (mock) ids={output_speaker_ids!r}"


def test_playback_service_returns_error_when_player_missing(db_session, patched_play_queue):
    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.play(
        PlayRequest(media_type="album", media_id="42", player_id=99, speaker_ids=[]),
        db_session,
        auth_token="dummy-token",
    )
    assert result.status == "error"
    assert "not found" in result.details.lower()


def test_playback_service_uses_preset_speakers(db_session, patched_play_queue):
    db_session.add(PlexCredential(auth_token="dummy-token", is_connected=True))
    db_session.commit()

    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True)
    preset = SonosGroupPreset(name="Downstairs", speaker_ids=["s1", "s2"])
    db_session.add_all([player, preset])
    db_session.commit()
    db_session.refresh(player)
    db_session.refresh(preset)

    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.play(
        PlayRequest(media_type="playlist", media_id="123", player_id=player.id, speaker_ids=["s3"], preset_id=preset.id),
        db_session,
        auth_token="dummy-token",
    )
    assert result.status == "ok"
    assert "Sonos: ok (mock)" in result.details
    assert "['s1', 's2']" in result.details
