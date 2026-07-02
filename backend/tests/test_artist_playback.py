import random

from app.services.artist_playback import (
    MAX_ORDERED_ARTIST_TRACKS,
    _load_popular_tracks,
    _search_artist_tracks,
    _sort_by_rating_tiers,
    _user_rating,
    build_ordered_artist_server_uri,
    clear_ordered_artist_track_cache,
    resolve_artist_order_mode,
    sort_artist_tracks,
)


class FakeTrack:
    def __init__(self, **kwargs: object) -> None:
        for key, value in kwargs.items():
            setattr(self, key, value)


class FakeSection:
    def __init__(self, tracks: list[object]) -> None:
        self._tracks = tracks
        self.search_calls: list[dict[str, object]] = []

    def search(self, **kwargs: object) -> list[object]:
        self.search_calls.append(kwargs)
        sort = kwargs.get("sort")
        if sort == "userRating:desc":
            return sort_artist_tracks(self._tracks, "popular_order", rng=random.Random(0))[:MAX_ORDERED_ARTIST_TRACKS]
        return list(self._tracks)[:MAX_ORDERED_ARTIST_TRACKS]


class FakeArtist:
    def __init__(self, tracks: list[object]) -> None:
        self.ratingKey = 42
        self._tracks = tracks
        self.section_obj = FakeSection(tracks)
        self.all_leaves_calls = 0
        self.popular_tracks_calls = 0

    def popularTracks(self) -> list[object]:
        self.popular_tracks_calls += 1
        return sorted(
            self._tracks,
            key=lambda track: int(getattr(track, "ratingCount", 0) or 0),
            reverse=True,
        )

    def tracks(self, sort: str | None = None, **kwargs: object) -> list[object]:
        self.all_leaves_calls += 1
        if sort == "userRating:desc":
            return sort_artist_tracks(self._tracks, "popular_order", rng=random.Random(0))
        return list(self._tracks)

    def section(self) -> FakeSection:
        return self.section_obj


def test_resolve_artist_order_mode_prefers_explicit_mode():
    assert resolve_artist_order_mode(artist_order_mode="popular_order", shuffle=False) == "popular_order"
    assert resolve_artist_order_mode(artist_order_mode="popular_tracks_order", shuffle=False) == "popular_tracks_order"


def test_resolve_artist_order_mode_migrates_external_ratings_alias():
    assert resolve_artist_order_mode(artist_order_mode="external_ratings_order", shuffle=False) == "popular_tracks_order"


def test_resolve_artist_order_mode_falls_back_to_shuffle_flag():
    assert resolve_artist_order_mode(artist_order_mode=None, shuffle=True) == "shuffle"
    assert resolve_artist_order_mode(artist_order_mode=None, shuffle=False) == "album_order"


def test_album_order_sort_key_orders_by_year_album_disc_track():
    tracks = [
        FakeTrack(parentYear=2000, parentTitle="B", parentIndex=1, index=2, ratingKey=2),
        FakeTrack(parentYear=2000, parentTitle="B", parentIndex=1, index=1, ratingKey=1),
        FakeTrack(parentYear=1999, parentTitle="A", parentIndex=1, index=1, ratingKey=3),
    ]
    ordered = sort_artist_tracks(tracks, "album_order")
    assert [track.ratingKey for track in ordered] == [3, 1, 2]


def test_popular_order_groups_by_user_rating_then_shuffles_within_tier():
    tracks = [
        FakeTrack(userRating=6, ratingKey=1),
        FakeTrack(userRating=8, ratingKey=2),
        FakeTrack(userRating=8, ratingKey=3),
    ]
    ordered = sort_artist_tracks(tracks, "popular_order", rng=random.Random(1))
    assert [track.userRating for track in ordered] == [8, 8, 6]
    assert {track.ratingKey for track in ordered[:2]} == {2, 3}
    assert ordered[2].ratingKey == 1


def test_sort_by_rating_tiers_is_deterministic_with_seeded_rng():
    tracks = [
        FakeTrack(userRating=10, ratingKey=1),
        FakeTrack(userRating=10, ratingKey=2),
        FakeTrack(userRating=8, ratingKey=3),
    ]
    first = _sort_by_rating_tiers(tracks, _user_rating, rng=random.Random(7))
    second = _sort_by_rating_tiers(tracks, _user_rating, rng=random.Random(7))
    assert [track.ratingKey for track in first] == [track.ratingKey for track in second]


class FakePMS:
    machineIdentifier = "machine"
    library = FakeTrack(identifier="section-1")


def test_build_ordered_artist_server_uri_uses_direct_track_list():
    artist = FakeArtist(
        [
            FakeTrack(userRating=10, ratingKey=101),
            FakeTrack(userRating=8, ratingKey=102),
        ],
    )
    uri = build_ordered_artist_server_uri(FakePMS(), artist, "popular_order")
    assert uri == "server://machine/section-1/library/metadata/101,102"
    assert artist.all_leaves_calls == 0


def test_build_ordered_artist_server_uri_caps_at_max_tracks():
    clear_ordered_artist_track_cache()
    artist = FakeArtist([FakeTrack(userRating=10, ratingKey=i) for i in range(150)])
    uri = build_ordered_artist_server_uri(FakePMS(), artist, "popular_order")
    key_count = uri.rsplit("/", 1)[-1].count(",") + 1
    assert key_count == MAX_ORDERED_ARTIST_TRACKS


def test_build_ordered_artist_server_uri_uses_cache_on_repeat():
    clear_ordered_artist_track_cache()
    artist = FakeArtist(
        [
            FakeTrack(ratingCount=100, ratingKey=101),
            FakeTrack(ratingCount=50, ratingKey=102),
        ],
    )
    pms = FakePMS()
    first = build_ordered_artist_server_uri(pms, artist, "popular_tracks_order")
    artist.popular_tracks_calls = 0
    second = build_ordered_artist_server_uri(pms, artist, "popular_tracks_order")
    assert first == second
    assert artist.popular_tracks_calls == 0


def test_popular_tracks_order_preserves_plex_order():
    clear_ordered_artist_track_cache()
    artist = FakeArtist(
        [
            FakeTrack(ratingCount=10, ratingKey=1),
            FakeTrack(ratingCount=999, ratingKey=2),
            FakeTrack(ratingCount=50, ratingKey=3),
        ],
    )
    uri = build_ordered_artist_server_uri(FakePMS(), artist, "popular_tracks_order")
    assert uri.endswith("/library/metadata/2,3,1")
    assert artist.popular_tracks_calls == 1
    assert artist.all_leaves_calls == 0


def test_load_popular_tracks_uses_artist_popular_tracks():
    artist = FakeArtist([FakeTrack(ratingCount=5, ratingKey=9)])
    tracks = _load_popular_tracks(artist)
    assert [track.ratingKey for track in tracks] == [9]
    assert artist.popular_tracks_calls == 1


def test_search_artist_tracks_prefers_library_search():
    artist = FakeArtist([FakeTrack(userRating=9, ratingKey=7)])
    tracks = _search_artist_tracks(artist, "userRating:desc")
    assert [track.ratingKey for track in tracks] == [7]
    assert artist.section_obj.search_calls
    assert artist.all_leaves_calls == 0
