def test_health_endpoint(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_player_create_and_play_flow(client):
    player_response = client.post(
        "/api/v1/players",
        json={"name": "Office", "host": "plexamp.local", "port": 32500, "is_active": True},
    )
    assert player_response.status_code == 200
    player_id = player_response.json()["id"]

    play_response = client.post(
        "/api/v1/play",
        json={"media_type": "album", "media_id": "album-1", "player_id": player_id, "speaker_ids": ["s1"]},
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

    deleted = client.delete(f"/api/v1/speed-dial/{favorite_id}")
    assert deleted.status_code == 200

    listed_after = client.get("/api/v1/speed-dial")
    assert listed_after.status_code == 200
    assert listed_after.json() == []
