from app.db.runtime_setup_migrate import ensure_amps_table_and_migrate_pioneer_configs
from app.models import Amp, PlexampPlayer


def test_amp_crud_and_player_link(client):
    created = client.post(
        "/api/v1/amps",
        json={"name": "Living room", "host": "192.168.1.50", "port": 60128, "input_code": "02"},
    )
    assert created.status_code == 200
    amp_id = created.json()["id"]

    listed = client.get("/api/v1/amps")
    assert listed.status_code == 200
    assert any(row["id"] == amp_id and row["name"] == "Living room" for row in listed.json())

    patched = client.patch(f"/api/v1/amps/{amp_id}", json={"name": "Den"})
    assert patched.status_code == 200
    assert patched.json()["name"] == "Den"

    player = client.post(
        "/api/v1/players",
        json={
            "name": "Caldera",
            "host": "caldera.local",
            "port": 32500,
            "is_active": True,
            "audio_output": {"kind": "pioneer", "config": {"amp_id": amp_id}},
        },
    )
    assert player.status_code == 200
    player_id = player.json()["id"]

    players = client.get("/api/v1/players").json()
    row = next(p for p in players if p["id"] == player_id)
    assert row["audio_output"] == {"kind": "pioneer", "config": {"amp_id": amp_id}}

    blocked = client.delete(f"/api/v1/amps/{amp_id}")
    assert blocked.status_code == 400

    client.patch(
        f"/api/v1/players/{player_id}",
        json={"audio_output": {"kind": "none", "config": {}}},
    )
    deleted = client.delete(f"/api/v1/amps/{amp_id}")
    assert deleted.status_code == 200


def test_migrate_legacy_pioneer_config_to_amp(db_session):
    player = PlexampPlayer(
        name="Kitchen Amp",
        host="plexamp.local",
        port=32500,
        is_active=True,
        audio_output_kind="pioneer",
        audio_output_config={"host": "10.0.0.8", "input_code": "02", "port": 60128},
    )
    db_session.add(player)
    db_session.commit()

    ensure_amps_table_and_migrate_pioneer_configs(db_session.get_bind())

    db_session.expire_all()
    refreshed = db_session.get(PlexampPlayer, player.id)
    assert refreshed is not None
    assert refreshed.audio_output_config.get("amp_id")
    amp = db_session.get(Amp, refreshed.audio_output_config["amp_id"])
    assert amp is not None
    assert amp.host == "10.0.0.8"
    assert amp.input_code == "02"
    assert amp.name == "Kitchen Amp"
