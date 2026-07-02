from __future__ import annotations

import logging
import math
import random
import time
from typing import Callable, Literal

from app.services.plexamp_client import build_track_list_server_uri

_log = logging.getLogger(__name__)

ArtistOrderMode = Literal["shuffle", "album_order", "popular_order", "popular_tracks_order"]

ORDER_MODE_LABELS: dict[ArtistOrderMode, str] = {
    "shuffle": "shuffled",
    "album_order": "album order",
    "popular_order": "user ratings",
    "popular_tracks_order": "popular tracks",
}

RATING_SORTS: dict[str, tuple[str, ...]] = {
    "popular_order": ("userRating:desc",),
}

ALBUM_TRACK_SORT = "year:asc,parentTitle:asc,parentIndex:asc,index:asc"

# Custom artist queues are capped for responsiveness (fetch, sort, and Plexamp URI size).
MAX_ORDERED_ARTIST_TRACKS = 100

_ORDERED_TRACK_KEYS_CACHE: dict[tuple[int, ArtistOrderMode], tuple[float, list[int]]] = {}
_ORDERED_TRACK_KEYS_CACHE_TTL_SECONDS = 300


def resolve_artist_order_mode(*, artist_order_mode: str | None, shuffle: bool) -> ArtistOrderMode:
    if artist_order_mode == "external_ratings_order":
        return "popular_tracks_order"
    if artist_order_mode in ORDER_MODE_LABELS:
        return artist_order_mode  # type: ignore[return-value]
    return "shuffle" if shuffle else "album_order"


def clear_ordered_artist_track_cache() -> None:
    _ORDERED_TRACK_KEYS_CACHE.clear()


def _cache_get_track_keys(artist_id: int, mode: ArtistOrderMode) -> list[int] | None:
    entry = _ORDERED_TRACK_KEYS_CACHE.get((artist_id, mode))
    if entry is None:
        return None
    expires_at, keys = entry
    if time.monotonic() > expires_at:
        _ORDERED_TRACK_KEYS_CACHE.pop((artist_id, mode), None)
        return None
    return list(keys)


def _cache_set_track_keys(artist_id: int, mode: ArtistOrderMode, keys: list[int]) -> None:
    _ORDERED_TRACK_KEYS_CACHE[(artist_id, mode)] = (
        time.monotonic() + _ORDERED_TRACK_KEYS_CACHE_TTL_SECONDS,
        list(keys),
    )


def _artist_rating_key(artist_item: object) -> int | None:
    rating_key = getattr(artist_item, "ratingKey", None)
    if rating_key is None:
        return None
    try:
        return int(rating_key)
    except (TypeError, ValueError):
        return None


def _track_album_year(track: object) -> int:
    for attr in ("parentYear", "year"):
        value = getattr(track, attr, None)
        if isinstance(value, (int, float)) and value > 0:
            return int(value)
    originally = getattr(track, "originallyAvailableAt", None)
    if originally is not None:
        text = str(originally)[:4]
        if text.isdigit():
            return int(text)
    return 0


def album_order_sort_key(track: object) -> tuple[int, str, int, int, int]:
    return (
        _track_album_year(track),
        (getattr(track, "parentTitle", None) or "").strip().lower(),
        int(getattr(track, "parentIndex", None) or 1),
        int(getattr(track, "index", None) or 0),
        int(getattr(track, "ratingKey", None) or 0),
    )


def _user_rating(track: object) -> float:
    value = getattr(track, "userRating", None)
    return float(value) if isinstance(value, (int, float)) else 0.0


def _load_popular_tracks(artist_item: object) -> list[object]:
    """Plex artist popular tracks (Last.fm listen counts, same as the artist page)."""
    popular_fn = getattr(artist_item, "popularTracks", None)
    if not callable(popular_fn):
        return []
    try:
        tracks = list(popular_fn())
    except Exception as exc:  # noqa: BLE001
        _log.debug("Artist popularTracks failed: %s", exc)
        return []
    return tracks[:MAX_ORDERED_ARTIST_TRACKS]


def _sort_by_rating_tiers(
    tracks: list[object],
    rating_fn: Callable[[object], float],
    *,
    rng: random.Random | None = None,
) -> list[object]:
    shuffle_rng = rng or random.Random()
    buckets: dict[float, list[object]] = {}
    for track in tracks:
        rating = rating_fn(track)
        buckets.setdefault(rating, []).append(track)

    ordered: list[object] = []
    for rating in sorted(buckets.keys(), reverse=True):
        tier = list(buckets[rating])
        shuffle_rng.shuffle(tier)
        ordered.extend(tier)
    return ordered


def sort_artist_tracks(
    tracks: list[object],
    mode: ArtistOrderMode,
    *,
    rng: random.Random | None = None,
) -> list[object]:
    if mode == "popular_order":
        return _sort_by_rating_tiers(tracks, _user_rating, rng=rng)
    if mode == "album_order":
        return sorted(tracks, key=album_order_sort_key)
    return list(tracks)


def _search_artist_tracks(artist_item: object, sort: str) -> list[object]:
    """Indexed library search — fast for large artists (avoids allLeaves over full catalogs)."""
    rating_key = _artist_rating_key(artist_item)
    section_fn = getattr(artist_item, "section", None)
    if rating_key is None or not callable(section_fn):
        return []
    try:
        section = section_fn()
        search_fn = getattr(section, "search", None)
        if not callable(search_fn):
            return []
        return list(
            search_fn(
                libtype="track",
                filters={"artist.id": rating_key},
                sort=sort,
                maxresults=MAX_ORDERED_ARTIST_TRACKS,
            ),
        )
    except Exception as exc:  # noqa: BLE001
        _log.debug("Artist track search failed sort=%s: %s", sort, exc)
        return []


def _load_bounded_artist_tracks(artist_item: object, *, sort: str | None = None) -> list[object]:
    """Fetch up to MAX_ORDERED_ARTIST_TRACKS via artist allLeaves (with optional server sort)."""
    tracks_fn = getattr(artist_item, "tracks", None)
    if not callable(tracks_fn):
        return []

    kwargs_variants: list[dict[str, object]] = []
    if sort:
        kwargs_variants.extend(
            [
                {"sort": sort, "maxresults": MAX_ORDERED_ARTIST_TRACKS},
                {"sort": sort, "container_size": MAX_ORDERED_ARTIST_TRACKS},
                {"sort": sort},
            ],
        )
    kwargs_variants.extend(
        [
            {"maxresults": MAX_ORDERED_ARTIST_TRACKS},
            {"container_size": MAX_ORDERED_ARTIST_TRACKS},
        ],
    )

    for kwargs in kwargs_variants:
        try:
            tracks = list(tracks_fn(**kwargs))
        except TypeError:
            continue
        except Exception as exc:  # noqa: BLE001
            _log.debug("Artist allLeaves fetch failed kwargs=%s: %s", kwargs, exc)
            continue
        if tracks:
            return tracks[:MAX_ORDERED_ARTIST_TRACKS]

    try:
        tracks = list(tracks_fn())
    except Exception as exc:  # noqa: BLE001
        _log.debug("Artist allLeaves fetch failed: %s", exc)
        return []
    if not tracks:
        return []
    if len(tracks) > MAX_ORDERED_ARTIST_TRACKS:
        _log.info(
            "Artist allLeaves returned %s tracks; using first %s for ordered playback",
            len(tracks),
            MAX_ORDERED_ARTIST_TRACKS,
        )
    return tracks[:MAX_ORDERED_ARTIST_TRACKS]


def _load_tracks_with_sort(artist_item: object, sort: str) -> list[object]:
    tracks = _search_artist_tracks(artist_item, sort)
    if tracks:
        return tracks
    return _load_bounded_artist_tracks(artist_item, sort=sort)


def load_artist_tracks(artist_item: object, mode: ArtistOrderMode) -> list[object]:
    if mode == "popular_tracks_order":
        return _load_popular_tracks(artist_item)

    if mode == "album_order":
        tracks = _load_tracks_with_sort(artist_item, ALBUM_TRACK_SORT)
        if tracks:
            return tracks
        return _load_bounded_artist_tracks(artist_item)

    if mode in RATING_SORTS:
        for sort in RATING_SORTS[mode]:
            tracks = _load_tracks_with_sort(artist_item, sort)
            if tracks:
                return tracks
        # Plex may reject rating sorts in search/allLeaves; still play a bounded set client-sorted.
        return _load_bounded_artist_tracks(artist_item)

    return _load_bounded_artist_tracks(artist_item)


def _valid_track_rating_key(track: object) -> int | None:
    rating_key = getattr(track, "ratingKey", None)
    if rating_key is None:
        return None
    if isinstance(rating_key, float) and math.isnan(rating_key):
        return None
    if isinstance(rating_key, str) and rating_key.strip().lower() == "nan":
        return None
    try:
        return int(rating_key)
    except (TypeError, ValueError):
        return None


def _ordered_track_rating_keys(tracks: list[object], mode: ArtistOrderMode) -> list[int]:
    valid = [track for track in tracks if _valid_track_rating_key(track) is not None]
    if not valid:
        return []
    if mode == "popular_tracks_order":
        ordered = valid
    elif mode != "shuffle":
        ordered = sort_artist_tracks(valid, mode)
    else:
        ordered = valid
    keys: list[int] = []
    for track in ordered[:MAX_ORDERED_ARTIST_TRACKS]:
        rating_key = _valid_track_rating_key(track)
        if rating_key is not None:
            keys.append(rating_key)
    return keys


def build_ordered_artist_server_uri(pms: object, artist_item: object, mode: ArtistOrderMode) -> str:
    """Return a Plexamp-ready server URI for a custom-ordered artist queue."""
    artist_id = _artist_rating_key(artist_item)
    if artist_id is not None:
        cached_keys = _cache_get_track_keys(artist_id, mode)
        if cached_keys:
            return build_track_list_server_uri(
                pms.machineIdentifier,
                pms.library.identifier,
                cached_keys,
            )

    rating_keys = _ordered_track_rating_keys(load_artist_tracks(artist_item, mode), mode)
    if not rating_keys:
        raise ValueError("Artist has no tracks to play.")

    if artist_id is not None:
        _cache_set_track_keys(artist_id, mode, rating_keys)

    return build_track_list_server_uri(
        pms.machineIdentifier,
        pms.library.identifier,
        rating_keys,
    )


# Backwards-compatible alias for any external callers.
def create_ordered_artist_play_queue_key(pms: object, artist_item: object, mode: ArtistOrderMode) -> str:
    uri = build_ordered_artist_server_uri(pms, artist_item, mode)
    prefix = f"server://{pms.machineIdentifier}/{pms.library.identifier}"
    if uri.startswith(prefix):
        return uri[len(prefix) :]
    return uri
