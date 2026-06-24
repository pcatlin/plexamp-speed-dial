from app.services.sonos_service import format_playback_source_label


def test_format_playback_source_label_line_in():
    label = format_playback_source_label(
        uri="x-rincon-stream:RINCON_123",
        title="",
        artist="",
        transport_state="PLAYING",
        resolve_speaker_name=lambda uid: "Kitchen Amp" if uid == "RINCON_123" else None,
    )
    assert label == "Line-in · Kitchen Amp"


def test_format_playback_source_label_idle():
    label = format_playback_source_label(
        uri="",
        title="",
        artist="",
        transport_state="STOPPED",
        resolve_speaker_name=lambda _uid: None,
    )
    assert label == "Idle"


def test_format_playback_source_label_track():
    label = format_playback_source_label(
        uri="x-file-cifs://server/track.mp3",
        title="Wonderboy",
        artist="Tenacious D",
        transport_state="PLAYING",
        resolve_speaker_name=lambda _uid: None,
    )
    assert label == "Wonderboy — Tenacious D"
