"""Schema contracts and import guards for domain models."""

import pytest


def test_speed_dial_read_is_distinct_subclass_of_create():
    from app.schemas.domain import InitialVolumes, SpeedDialCreate, SpeedDialRead

    create_fields = set(SpeedDialCreate.model_fields)
    read_fields = set(SpeedDialRead.model_fields)

    assert issubclass(SpeedDialRead, SpeedDialCreate)
    assert SpeedDialRead is not SpeedDialCreate

    assert "id" not in create_fields
    assert "has_cover_art" not in create_fields
    assert {"id", "has_cover_art"}.issubset(read_fields)
    assert "initial_volumes" in create_fields
    assert "initial_volumes" in read_fields

    row = SpeedDialRead(
        id=1,
        label="Morning",
        media_type="playlist",
        media_id="playlist-1",
        player_id=2,
        speaker_ids=["s1"],
        has_cover_art=True,
        initial_volumes=InitialVolumes(sonos={"s1": 20}, pioneer=35),
    )
    assert row.id == 1
    assert row.has_cover_art is True
    assert row.initial_volumes is not None
    assert row.initial_volumes.sonos == {"s1": 20}
    assert row.initial_volumes.pioneer == 35


@pytest.mark.parametrize(
    ("create_cls_name", "read_cls_name", "read_only_fields"),
    [
        ("SonosGroupPresetCreate", "SonosGroupPresetRead", {"id"}),
        ("PlayerCreate", "PlayerRead", {"id"}),
        ("SpeedDialCreate", "SpeedDialRead", {"id", "has_cover_art"}),
        ("RuntimeSetupUpdate", "RuntimeSetupRead", {"plex_server_url_effective"}),
    ],
)
def test_create_read_pairs_keep_read_only_fields_separate(
    create_cls_name: str,
    read_cls_name: str,
    read_only_fields: set[str],
):
    import app.schemas.domain as domain

    create_cls = getattr(domain, create_cls_name)
    read_cls = getattr(domain, read_cls_name)

    create_fields = set(create_cls.model_fields)
    read_fields = set(read_cls.model_fields)

    assert issubclass(read_cls, create_cls)
    assert read_cls is not create_cls
    assert read_only_fields.isdisjoint(create_fields)
    assert read_only_fields.issubset(read_fields)


def test_speed_dial_patch_requires_at_least_one_field():
    from pydantic import ValidationError

    from app.schemas.domain import SpeedDialPatch

    with pytest.raises(ValidationError):
        SpeedDialPatch()

    patch = SpeedDialPatch(speaker_ids=["s1"])
    assert patch.speaker_ids == ["s1"]

    cleared = SpeedDialPatch.model_validate({"initial_volumes": None})
    assert cleared.initial_volumes is None
    assert "initial_volumes" in cleared.model_fields_set


def test_api_routes_imports_speed_dial_read():
    """Regression guard: routes must import SpeedDialRead or the API fails at startup."""
    import app.api.routes as routes_module
    from app.schemas.domain import SpeedDialRead

    assert routes_module.SpeedDialRead is SpeedDialRead
