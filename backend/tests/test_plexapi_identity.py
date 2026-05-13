"""Tests for stable Plex client identity (python-plexapi global headers)."""

from __future__ import annotations

import plexapi

from app.plexapi_identity import apply_stable_plexapi_headers


def test_apply_stable_keeps_same_base_headers_object() -> None:
    """Replacing BASE_HEADERS breaks modules that did `from plexapi import BASE_HEADERS` at import time."""
    stable = "00000000-0000-4000-8000-0000000000ab"
    before_id = id(plexapi.BASE_HEADERS)
    apply_stable_plexapi_headers(stable)
    assert id(plexapi.BASE_HEADERS) == before_id
    assert plexapi.BASE_HEADERS["X-Plex-Client-Identifier"] == stable
    assert plexapi.X_PLEX_IDENTIFIER == stable
