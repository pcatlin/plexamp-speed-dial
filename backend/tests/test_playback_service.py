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
    def group_selected_and_play_line_in(self, runtime, output_speaker_ids, *, line_in_speaker_id="", line_in_name_legacy=""):  # noqa: ANN001
        return f"Sonos: ok (mock) ids={output_speaker_ids!r} line_in={line_in_speaker_id!r}"

    def stop_selected_speakers(self, runtime, output_speaker_ids):  # noqa: ANN001
        return f"Sonos: stopped mock ids={output_speaker_ids!r}"

    def selection_transport_playing(self, runtime, output_speaker_ids):  # noqa: ANN001
        return (False, None)

    def adjust_volume_selected(self, runtime, output_speaker_ids, delta):  # noqa: ANN001
        return f"Sonos: volume mock ids={output_speaker_ids!r} delta={delta}"


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


def test_playback_plexamp_skip_next_ok(db_session, monkeypatch):
    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True)
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)

    fake = Mock()
    fake.status_code = 200
    fake.text = "OK"
    monkeypatch.setattr("app.services.playback_service.plexamp_playback_command", lambda **kwargs: fake)

    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.plexamp_skip_next(player.id, db_session, auth_token="dummy-token")
    assert result.status == "ok"
    assert "Skipped to next track" in result.details


def test_playback_plexamp_pause_ok(db_session, monkeypatch):
    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True)
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)

    fake = Mock()
    fake.status_code = 200
    fake.text = "OK"
    monkeypatch.setattr("app.services.playback_service.plexamp_playback_command", lambda **kwargs: fake)

    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.plexamp_pause(player.id, db_session, auth_token="dummy-token")
    assert result.status == "ok"
    assert "Paused playback" in result.details


def test_playback_plexamp_resume_ok(db_session, monkeypatch):
    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True)
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)

    fake = Mock()
    fake.status_code = 200
    fake.text = "OK"
    monkeypatch.setattr("app.services.playback_service.plexamp_playback_command", lambda **kwargs: fake)

    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.plexamp_resume(player.id, db_session, auth_token="dummy-token")
    assert result.status == "ok"
    assert "Resumed playback" in result.details


def test_playback_sonos_stop_empty_returns_error(db_session):
    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.sonos_stop_selected([], db_session)
    assert result.status == "error"


def test_playback_sonos_play_line_in_empty_returns_error(db_session):
    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.sonos_play_line_in_selected([], 1, db_session)
    assert result.status == "error"


def test_playback_sonos_play_line_in_player_not_found(db_session):
    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.sonos_play_line_in_selected(["s1"], 999, db_session)
    assert result.status == "error"
    assert "not found" in result.details.lower()


def test_playback_sonos_play_line_in_ok(db_session):
    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True, sonos_line_in_speaker_id="fridge-uid")
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)
    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.sonos_play_line_in_selected(["s1"], player.id, db_session)
    assert result.status == "ok"
    assert "Sonos: ok (mock)" in result.details
    assert "fridge-uid" in result.details


def test_playback_sonos_volume_empty_returns_error(db_session):
    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.sonos_volume_adjust_selected([], 5, db_session)
    assert result.status == "error"


def test_playback_sonos_volume_ok(db_session):
    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.sonos_volume_adjust_selected(["s1"], -5, db_session)
    assert result.status == "ok"
    assert "delta=-5" in result.details


def test_playback_sonos_playback_state_empty(db_session):
    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    r = service.sonos_playback_state([], db_session)
    assert r.ok is True
    assert r.playing is False


def test_playback_sonos_playback_state_ok(db_session):
    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    r = service.sonos_playback_state(["s1"], db_session)
    assert r.ok is True
    assert r.playing is False


def test_playback_plexamp_playback_state_ok(db_session, monkeypatch):
    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True)
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)

    monkeypatch.setattr("app.services.playback_service.plexamp_timeline_state", lambda **kwargs: "paused")

    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    r = service.plexamp_playback_state(player.id, db_session, auth_token="dummy-token")
    assert r.ok is True
    assert r.playing is False
    assert r.state == "paused"


class FakeArtistPMS:
    machineIdentifier = "machine-id"
    library = type("Lib", (), {"identifier": "com.plexapp.plugins.library"})()

    class _Artist:
        type = "artist"
        title = "Radiohead"
        key = "/library/metadata/555"

        def station(self):
            class _Station:
                key = "/library/sections/1/stations/888"

            return _Station()

    def fetchItem(self, rating_key: int):  # noqa: ANN001
        return FakeArtistPMS._Artist()


class FakeArtistPlexService:
    def connect_server(self, token: str, conn=None) -> FakeArtistPMS:  # noqa: ANN001
        assert token == "dummy-token"
        return FakeArtistPMS()


def test_playback_artist_radio_uses_station_in_uri(db_session, monkeypatch):
    db_session.add(PlexCredential(auth_token="dummy-token", is_connected=True))
    db_session.commit()
    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True)
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)

    captured: dict = {}

    def capture_queue(**kwargs):  # noqa: ANN001
        captured["server_uri"] = kwargs["server_uri"]
        fake = Mock()
        fake.status_code = 200
        fake.text = ""
        return fake

    monkeypatch.setattr("app.services.playback_service.create_play_queue", capture_queue)

    service = PlaybackService(plex_service=FakeArtistPlexService(), sonos_service=FakeSonosService())
    result = service.play(
        PlayRequest(media_type="artist", media_id="555", player_id=player.id, speaker_ids=[], artist_radio=True),
        db_session,
        auth_token="dummy-token",
    )
    assert result.status == "ok"
    assert "stations/888" in captured["server_uri"]


def test_playback_artist_library_uses_metadata_uri(db_session, monkeypatch):
    db_session.add(PlexCredential(auth_token="dummy-token", is_connected=True))
    db_session.commit()
    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True)
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)

    captured: dict = {}

    def capture_queue(**kwargs):  # noqa: ANN001
        captured["server_uri"] = kwargs["server_uri"]
        fake = Mock()
        fake.status_code = 200
        fake.text = ""
        return fake

    monkeypatch.setattr("app.services.playback_service.create_play_queue", capture_queue)

    service = PlaybackService(plex_service=FakeArtistPlexService(), sonos_service=FakeSonosService())
    result = service.play(
        PlayRequest(media_type="artist", media_id="555", player_id=player.id, speaker_ids=[], artist_radio=False),
        db_session,
        auth_token="dummy-token",
    )
    assert result.status == "ok"
    assert "metadata/555" in captured["server_uri"]
    assert "stations" not in captured["server_uri"]


class FakeTrackPMS:
    machineIdentifier = "machine-id"
    library = type("Lib", (), {"identifier": "com.plexapp.plugins.library"})()

    class _FakeStation:
        key = "/library/metadata/1/station/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?type=10"

    class _FakeArtist:
        def station(self):
            return FakeTrackPMS._FakeStation()

    class _Track:
        type = "track"
        title = "Hit"
        key = "/library/metadata/777"

        def artist(self):
            return FakeTrackPMS._FakeArtist()

    def fetchItem(self, rating_key: int):  # noqa: ANN001
        return FakeTrackPMS._Track()


class FakeTrackPlexService:
    def connect_server(self, token: str, conn=None) -> FakeTrackPMS:  # noqa: ANN001
        assert token == "dummy-token"
        return FakeTrackPMS()


def test_playback_track_radio_uses_station_in_uri(db_session, monkeypatch):
    db_session.add(PlexCredential(auth_token="dummy-token", is_connected=True))
    db_session.commit()
    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True)
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)

    captured: dict = {}

    def capture_queue(**kwargs):  # noqa: ANN001
        captured.update(kwargs)
        fake = Mock()
        fake.status_code = 200
        fake.text = ""
        return fake

    monkeypatch.setattr("app.services.playback_service.create_play_queue", capture_queue)

    service = PlaybackService(plex_service=FakeTrackPlexService(), sonos_service=FakeSonosService())
    result = service.play(
        PlayRequest(media_type="track", media_id="777", player_id=player.id, speaker_ids=[]),
        db_session,
        auth_token="dummy-token",
    )
    assert result.status == "ok"
    assert "/library/metadata/777/station/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" in captured["server_uri"]
    assert captured.get("shuffle") == 0
    assert "track radio" in result.details


def test_playback_playlist_shuffle_passed_to_plexamp(db_session, monkeypatch):
    db_session.add(PlexCredential(auth_token="dummy-token", is_connected=True))
    db_session.commit()
    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True)
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)

    captured: dict = {}

    def capture_queue(**kwargs):  # noqa: ANN001
        captured.update(kwargs)
        fake = Mock()
        fake.status_code = 200
        fake.text = ""
        return fake

    monkeypatch.setattr("app.services.playback_service.create_play_queue", capture_queue)

    service = PlaybackService(plex_service=FakePlexService(), sonos_service=FakeSonosService())
    result = service.play(
        PlayRequest(
            media_type="playlist",
            media_id="100",
            player_id=player.id,
            speaker_ids=[],
            shuffle=True,
        ),
        db_session,
        auth_token="dummy-token",
    )
    assert result.status == "ok"
    assert captured.get("shuffle") == 1
    assert "shuffled" in result.details


def test_playback_album_ignores_shuffle(db_session, monkeypatch):
    db_session.add(PlexCredential(auth_token="dummy-token", is_connected=True))
    db_session.commit()
    player = PlexampPlayer(name="Kitchen", host="plexamp.local", port=32500, is_active=True)
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)

    captured: dict = {}

    def capture_queue(**kwargs):  # noqa: ANN001
        captured.update(kwargs)
        fake = Mock()
        fake.status_code = 200
        fake.text = ""
        return fake

    monkeypatch.setattr("app.services.playback_service.create_play_queue", capture_queue)

    class FakeAlbumPMS:
        machineIdentifier = "machine-id"
        library = type("Lib", (), {"identifier": "com.plexapp.plugins.library"})()

        class _Al:
            type = "album"
            title = "Album"
            key = "/library/metadata/42"

        def fetchItem(self, rating_key: int):  # noqa: ANN001
            return FakeAlbumPMS._Al()

    class FakeAlbumPlexService:
        def connect_server(self, token: str, conn=None) -> FakeAlbumPMS:  # noqa: ANN001
            return FakeAlbumPMS()

    service = PlaybackService(plex_service=FakeAlbumPlexService(), sonos_service=FakeSonosService())
    result = service.play(
        PlayRequest(media_type="album", media_id="42", player_id=player.id, speaker_ids=[], shuffle=True),
        db_session,
        auth_token="dummy-token",
    )
    assert result.status == "ok"
    assert captured.get("shuffle") == 0
