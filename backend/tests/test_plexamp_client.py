from app.services import plexamp_client

MULTI_TIMELINE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="3" commandID="-1">
    <Timeline state="stopped" type="photo" itemType="photo" />
    <Timeline state="playing" controllable="playPause,stop" type="music" itemType="music" />
    <Timeline state="stopped" type="video" itemType="video" />
</MediaContainer>
"""


def test_timeline_state_prefers_music_over_photo():
    assert plexamp_client._timeline_state_from_xml(MULTI_TIMELINE_XML) == "playing"


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
