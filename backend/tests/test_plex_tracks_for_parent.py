from types import SimpleNamespace
from unittest.mock import Mock

from app.services.plex_service import PlexService
from app.services.runtime_setup import PlexConn


def test_get_tracks_for_parent_playlist_pages_instead_of_loading_all(monkeypatch):
    """Large playlists must not call Playlist.items() (full download)."""
    service = PlexService()
    conn = PlexConn(base_url="http://plex.local:32400", ssl_verify=False)

    fetched: list[tuple] = []

    class FakePlaylist:
        type = "playlist"
        playlistType = "audio"
        key = "/playlists/25290"

        def items(self):  # pragma: no cover - must not be used
            raise AssertionError("Playlist.items() loads the entire playlist")

        def fetchItems(self, ekey, **kwargs):  # noqa: ANN001
            fetched.append((ekey, kwargs))
            return [
                SimpleNamespace(type="track", ratingKey=1, title="A", grandparentTitle="Art", parentTitle="Alb"),
                SimpleNamespace(type="track", ratingKey=2, title="B", grandparentTitle="Art", parentTitle="Alb"),
            ]

    fake_server = Mock()
    fake_server.fetchItem.return_value = FakePlaylist()
    monkeypatch.setattr(service, "connect_server", lambda *_a, **_k: fake_server)

    rows = service.get_tracks_for_parent("25290", "playlist", "tok", conn, limit=50)
    assert len(rows) == 2
    assert rows[0].title == "A"
    assert fetched == [("/playlists/25290/items", {"maxresults": 50, "container_size": 50})]


def test_get_tracks_for_parent_album_passes_page_cap(monkeypatch):
    service = PlexService()
    conn = PlexConn(base_url="http://plex.local:32400", ssl_verify=False)
    track_kwargs: dict = {}

    class FakeAlbum:
        type = "album"

        def tracks(self, **kwargs):  # noqa: ANN001
            track_kwargs.update(kwargs)
            return [
                SimpleNamespace(type="track", ratingKey=9, title="Cut", grandparentTitle="A", parentTitle="Alb"),
            ]

    fake_server = Mock()
    fake_server.fetchItem.return_value = FakeAlbum()
    monkeypatch.setattr(service, "connect_server", lambda *_a, **_k: fake_server)

    rows = service.get_tracks_for_parent("12", "album", "tok", conn, limit=20)
    assert len(rows) == 1
    assert track_kwargs == {"maxresults": 20, "container_size": 20}
