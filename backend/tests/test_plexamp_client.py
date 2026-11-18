import logging

from app.services import plexamp_client

MULTI_TIMELINE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="3" commandID="-1">
    <Timeline state="stopped" type="photo" itemType="photo" />
    <Timeline state="playing" controllable="playPause,stop" type="music" itemType="music" title="Daydreaming" grandparentTitle="Radiohead" parentTitle="A Moon Shaped Pool" ratingKey="42" key="/library/metadata/42" />
    <Timeline state="stopped" type="video" itemType="video" />
</MediaContainer>
"""


def _clear_companion_throttle_state() -> None:
    plexamp_client._host_last_request_mono.clear()
    plexamp_client._host_locks.clear()
    with plexamp_client._command_id_lock:
        plexamp_client._command_id = 0


def test_timeline_state_prefers_music_over_photo():
    assert plexamp_client._timeline_state_from_xml(MULTI_TIMELINE_XML) == "playing"


def test_timeline_snapshot_reads_track_metadata():
    snap = plexamp_client._timeline_snapshot_from_xml(MULTI_TIMELINE_XML)
    assert snap is not None
    assert snap.state == "playing"
    assert snap.title == "Daydreaming"
    assert snap.artist == "Radiohead"
    assert snap.album == "A Moon Shaped Pool"
    assert snap.rating_key == "42"


def test_timeline_state_reads_paused_music():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1">
    <Timeline state="paused" type="music" itemType="music" />
</MediaContainer>
"""
    assert plexamp_client._timeline_state_from_xml(xml) == "paused"


def test_timeline_implies_playing_maps_music_states():
    assert plexamp_client.plexamp_timeline_implies_playing("playing") is True
    assert plexamp_client.plexamp_timeline_implies_playing("paused") is False


def test_build_track_list_server_uri_joins_rating_keys():
    assert (
        plexamp_client.build_track_list_server_uri("machine", "section-1", [10, 20, 30])
        == "server://machine/section-1/library/metadata/10,20,30"
    )


def test_playlist_playback_library_key_normalizes_paths():
    assert plexamp_client.playlist_playback_library_key(25289, "/playlists/25289") == "/playlists/25289/items"
    assert plexamp_client.playlist_playback_library_key(25289, "/playlist/25289") == "/playlists/25289/items"
    assert plexamp_client.playlist_playback_library_key(25289, "/playlists/25289/items") == "/playlists/25289/items"
    assert plexamp_client.playlist_playback_library_key(100, "/library/metadata/100") == "/playlists/100/items"


def test_create_play_queue_matches_desktop_query_shape(monkeypatch):
    _clear_companion_throttle_state()
    captured: dict = {}

    class FakeResp:
        status_code = 200
        text = ""

    def fake_get(url, timeout=None, headers=None):  # noqa: ANN001
        captured["url"] = url
        captured["headers"] = headers
        return FakeResp()

    monkeypatch.setattr(plexamp_client.requests, "get", fake_get)
    monkeypatch.setattr(plexamp_client.settings, "plexamp_min_request_interval_seconds", 0.0)

    resp = plexamp_client.create_play_queue(
        plexamp_base="http://player.local:32500",
        server_uri="server://mid/com.plexapp.plugins.library/playlists/25289/items",
        token="tok",
        pms_address="192-168-0-100.example.plex.direct",
        pms_port=32400,
        pms_protocol="https",
        timeout=5.0,
        machine_identifier="mid",
        shuffle=0,
        playlist_id=25289,
    )
    assert resp.status_code == 200
    url = captured["url"]
    assert "source=mid" in url
    assert "machineIdentifier=mid" in url
    assert "includeExternalMedia=1" in url
    assert "shuffle=0" in url
    assert "playlistID=25289" in url
    assert "playlists%2F25289%2Fitems" in url or "/playlists/25289/items" in url
    assert "commandID=1" in url


def test_command_id_increments_across_requests(monkeypatch):
    _clear_companion_throttle_state()
    monkeypatch.setattr(plexamp_client.settings, "plexamp_min_request_interval_seconds", 0.0)
    urls: list[str] = []

    class FakeResp:
        status_code = 200
        text = MULTI_TIMELINE_XML

    def fake_get(url, timeout=None, headers=None):  # noqa: ANN001
        urls.append(url)
        return FakeResp()

    monkeypatch.setattr(plexamp_client.requests, "get", fake_get)

    plexamp_client.plexamp_playback_command(
        plexamp_base="http://verox.local:32500",
        token="tok",
        action="play",
        timeout=1.0,
    )
    plexamp_client.plexamp_timeline_snapshot(
        plexamp_base="http://verox.local:32500",
        token="tok",
        timeout=1.0,
    )
    assert "commandID=1" in urls[0]
    assert "commandID=2" in urls[1]


def test_companion_get_logs_timestamped_request(monkeypatch, caplog):
    _clear_companion_throttle_state()
    monkeypatch.setattr(plexamp_client.settings, "plexamp_min_request_interval_seconds", 0.0)

    class FakeResp:
        status_code = 200
        text = ""

    monkeypatch.setattr(plexamp_client.requests, "get", lambda *a, **k: FakeResp())

    with caplog.at_level(logging.INFO, logger="app.services.plexamp_client"):
        plexamp_client.companion_get(
            "http://verox.local:32500/player/timeline/poll?token=secret&type=music",
            timeout=1.0,
            headers={"Accept": "application/xml"},
        )

    joined = "\n".join(r.message for r in caplog.records)
    assert "GET http://verox.local:32500/player/timeline/poll?token=<redacted>&type=music" in joined
    assert "status=200" in joined
    assert "duration_ms=" in joined
    assert "secret" not in joined
    assert "companion request" not in joined
    assert "companion throttle" not in joined


def test_companion_get_throttles_second_request(monkeypatch):
    _clear_companion_throttle_state()
    monkeypatch.setattr(plexamp_client.settings, "plexamp_min_request_interval_seconds", 0.2)
    sleeps: list[float] = []
    monkeypatch.setattr(plexamp_client.time, "sleep", lambda seconds: sleeps.append(seconds))

    class FakeResp:
        status_code = 200
        text = ""

    monkeypatch.setattr(plexamp_client.requests, "get", lambda *a, **k: FakeResp())

    url = "http://verox.local:32500/player/playback/play?token=x"
    plexamp_client.companion_get(url, timeout=1.0, headers={"Accept": "application/xml"})
    plexamp_client.companion_get(url, timeout=1.0, headers={"Accept": "application/xml"})

    assert sleeps, "expected throttle sleep before second request"
    assert sleeps[0] > 0


def test_timeline_snapshot_serializes_polls(monkeypatch):
    _clear_companion_throttle_state()
    monkeypatch.setattr(plexamp_client.settings, "plexamp_min_request_interval_seconds", 0.0)
    urls: list[str] = []

    class FakeResp:
        def __init__(self, text: str) -> None:
            self.status_code = 200
            self.text = text

    def fake_get(url, timeout=None, headers=None):  # noqa: ANN001
        urls.append(url)
        if "type=music" in url:
            return FakeResp(MULTI_TIMELINE_XML)
        return FakeResp("<MediaContainer/>")

    monkeypatch.setattr(plexamp_client.requests, "get", fake_get)

    snap = plexamp_client.plexamp_timeline_snapshot(
        plexamp_base="http://verox.local:32500",
        token="tok",
        timeout=1.0,
    )
    assert snap is not None
    assert snap.state == "playing"
    assert len(urls) == 1
    assert "type=music" in urls[0]
