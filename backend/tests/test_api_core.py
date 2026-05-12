from unittest.mock import Mock


def test_health_endpoint(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_player_create_and_play_flow(client, db_session, monkeypatch):
    from app.models import PlexCredential

    db_session.add(PlexCredential(auth_token="stub-token", is_connected=True))
    db_session.commit()

    class FakePMS:
        machineIdentifier = "mid"
        library = type("L", (), {"identifier": "com.plexapp.plugins.library"})()

        class Album:
            type = "album"
            title = "Stub Album"
            key = "/library/metadata/1"

        def fetchItem(self, rating_key):  # noqa: ANN001
            return FakePMS.Album

    class FakePlex:
        def connect_server(self, token: str, conn=None):  # noqa: ANN003
            return FakePMS()

    import app.api.routes as routes_module
    from app.services.playback_service import PlaybackService

    monkeypatch.setattr(routes_module, "playback_service", PlaybackService(plex_service=FakePlex()))

    fake_resp = Mock()
    fake_resp.status_code = 200
    fake_resp.text = ""

    monkeypatch.setattr(
        "app.services.playback_service.create_play_queue",
        lambda **_kwargs: fake_resp,
    )

    player_response = client.post(
        "/api/v1/players",
        json={"name": "Office", "host": "plexamp.local", "port": 32500, "is_active": True},
    )
    assert player_response.status_code == 200
    player_id = player_response.json()["id"]

    play_response = client.post(
        "/api/v1/play",
        json={"media_type": "album", "media_id": "1", "player_id": player_id, "speaker_ids": []},
    )
    assert play_response.status_code == 200
    assert play_response.json()["status"] == "ok"


def test_speed_dial_create_list_delete(client):
    player_id = client.post(
        "/api/v1/players",
        json={"name": "Kitchen", "host": "plexamp.local", "port": 32500, "is_active": True},
    ).json()["id"]

    created = client.post(
        "/api/v1/speed-dial",
        json={
            "label": "Morning Mix",
            "media_type": "playlist",
            "media_id": "playlist-1",
            "player_id": player_id,
            "speaker_ids": ["s1", "s2"],
            "preset_id": None,
        },
    )
    assert created.status_code == 200
    favorite_id = created.json()["id"]

    listed = client.get("/api/v1/speed-dial")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0].get("has_cover_art") is False

    deleted = client.delete(f"/api/v1/speed-dial/{favorite_id}")
    assert deleted.status_code == 200

    listed_after = client.get("/api/v1/speed-dial")
    assert listed_after.status_code == 200
    assert listed_after.json() == []


def test_sonos_stop_requires_selected_speakers(client):
    r = client.post("/api/v1/sonos/stop", json={"speaker_ids": []})
    assert r.status_code == 400


def test_plexamp_skip_next_happy_path(client, db_session, monkeypatch):
    from app.models import PlexCredential

    db_session.add(PlexCredential(auth_token="stub-token", is_connected=True))
    db_session.commit()

    player_id = client.post(
        "/api/v1/players",
        json={"name": "Amp", "host": "plexamp.local", "port": 32500, "is_active": True},
    ).json()["id"]

    fake = Mock(status_code=200, text="OK")
    monkeypatch.setattr("app.services.playback_service.plexamp_playback_command", lambda **kwargs: fake)

    r = client.post("/api/v1/plexamp/skip-next", json={"player_id": player_id})
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_speed_dial_play_by_id(client, db_session, monkeypatch):
    from app.models import PlexCredential
    from app.schemas.domain import PlayResponse

    db_session.add(PlexCredential(auth_token="stub-token", is_connected=True))
    db_session.commit()

    import app.api.routes as routes_module

    seen: dict = {}

    def fake_play(payload, db, *, auth_token):  # noqa: ANN001
        seen["payload"] = payload
        return PlayResponse(status="ok", details="played")

    monkeypatch.setattr(routes_module.playback_service, "play", fake_play)

    player_id = client.post(
        "/api/v1/players",
        json={"name": "Kitchen", "host": "plexamp.local", "port": 32500, "is_active": True},
    ).json()["id"]

    favorite_id = client.post(
        "/api/v1/speed-dial",
        json={
            "label": "Morning",
            "media_type": "album",
            "media_id": "99",
            "player_id": player_id,
            "speaker_ids": ["s1"],
            "preset_id": None,
        },
    ).json()["id"]

    r = client.post(f"/api/v1/speed-dial/{favorite_id}/play")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert seen["payload"].media_id == "99"
    assert seen["payload"].speaker_ids == ["s1"]
    assert seen["payload"].artist_radio is True


def test_speed_dial_play_respects_stored_artist_radio(client, db_session, monkeypatch):
    from app.models import PlexCredential
    from app.schemas.domain import PlayResponse

    db_session.add(PlexCredential(auth_token="stub-token", is_connected=True))
    db_session.commit()

    import app.api.routes as routes_module

    seen: dict = {}

    def fake_play(payload, db, *, auth_token):  # noqa: ANN001
        seen["payload"] = payload
        return PlayResponse(status="ok", details="played")

    monkeypatch.setattr(routes_module.playback_service, "play", fake_play)

    player_id = client.post(
        "/api/v1/players",
        json={"name": "Kitchen", "host": "plexamp.local", "port": 32500, "is_active": True},
    ).json()["id"]

    favorite_id = client.post(
        "/api/v1/speed-dial",
        json={
            "label": "Artist lib",
            "media_type": "artist",
            "media_id": "77",
            "player_id": player_id,
            "speaker_ids": [],
            "preset_id": None,
            "artist_radio": False,
        },
    ).json()["id"]

    r = client.post(f"/api/v1/speed-dial/{favorite_id}/play")
    assert r.status_code == 200
    assert seen["payload"].artist_radio is False


def test_speed_dial_play_missing_returns_404(client, db_session):
    from app.models import PlexCredential

    db_session.add(PlexCredential(auth_token="stub-token", is_connected=True))
    db_session.commit()

    r = client.post("/api/v1/speed-dial/99999/play")
    assert r.status_code == 404


def test_speed_dial_cover_thumb_saved_and_served(client, db_session, monkeypatch):
    from app.models import PlexCredential

    db_session.add(PlexCredential(auth_token="stub-token", is_connected=True))
    db_session.commit()

    import app.api.routes as routes_module

    monkeypatch.setattr(
        routes_module.plex_service,
        "thumb_path_for_item",
        lambda rk, token, conn: "/library/metadata/1/thumb",
    )
    monkeypatch.setattr(
        routes_module.plex_service,
        "fetch_thumb_bytes",
        lambda stored, token, conn: (b"\xff\xd8\xff", "image/jpeg"),
    )

    player_id = client.post(
        "/api/v1/players",
        json={"name": "Kitchen", "host": "plexamp.local", "port": 32500, "is_active": True},
    ).json()["id"]

    created = client.post(
        "/api/v1/speed-dial",
        json={
            "label": "With art",
            "media_type": "album",
            "media_id": "42",
            "player_id": player_id,
            "speaker_ids": [],
            "preset_id": None,
        },
    )
    assert created.status_code == 200
    favorite_id = created.json()["id"]

    listed = client.get("/api/v1/speed-dial")
    assert listed.json()[0]["has_cover_art"] is True

    cover = client.get(f"/api/v1/speed-dial/{favorite_id}/cover")
    assert cover.status_code == 200
    assert cover.headers.get("content-type", "").startswith("image/jpeg")
    assert cover.content == b"\xff\xd8\xff"
