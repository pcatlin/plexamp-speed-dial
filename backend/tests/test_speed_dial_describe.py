from app.services.speed_dial_describe import format_speed_dial_play_description


def test_description_sonos_with_volumes():
    text = format_speed_dial_play_description(
        player_name="Kitchen",
        output_kind="sonos",
        speaker_ids=["s1", "s2"],
        speaker_names={"s1": "Bathroom", "s2": "Fridge"},
        initial_volumes={"sonos": {"s1": 20, "s2": 10}},
    )
    assert text == "Kitchen · Bathroom (20%), Fridge (10%)"


def test_description_sonos_without_volumes():
    text = format_speed_dial_play_description(
        player_name="Kitchen",
        output_kind="none",
        speaker_ids=["s1"],
        speaker_names={"s1": "Bathroom"},
        initial_volumes=None,
    )
    assert text == "Kitchen · Bathroom"


def test_description_pioneer_with_volume():
    text = format_speed_dial_play_description(
        player_name="Caldera",
        output_kind="pioneer",
        pioneer_label="192.168.1.50",
        speaker_ids=[],
        initial_volumes={"pioneer": 35},
    )
    assert text == "Caldera · 192.168.1.50 (35%)"


def test_description_no_speakers():
    text = format_speed_dial_play_description(
        player_name="Amp",
        output_kind="sonos",
        speaker_ids=[],
    )
    assert text == "Amp · No speakers"
