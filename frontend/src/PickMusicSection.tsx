import { useCallback, useEffect, useMemo, useState } from "react";
import { api, API_BASE, MediaItem } from "./api";

export type PickTab = "playlist" | "album" | "artist" | "track" | "random_album";

export function playMediaTypeForTab(tab: PickTab): "playlist" | "album" | "artist" | "track" {
  if (tab === "random_album") return "album";
  return tab;
}

type MediaSuggestions = {
  most_played: MediaItem[];
  unplayed: MediaItem[];
  random: MediaItem[];
};

const TABS: Array<{ id: PickTab; label: string }> = [
  { id: "playlist", label: "Playlist" },
  { id: "album", label: "Album" },
  { id: "artist", label: "Artist" },
  { id: "track", label: "Track" },
  { id: "random_album", label: "Random album" },
];

function IconShuffle() {
  return (
    <svg className="mediaCtrlIcon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
      />
    </svg>
  );
}

type Props = {
  authConnected: boolean;
  pickTab: PickTab;
  onPickTab: (tab: PickTab) => void;
  collections: { id: string; title: string }[];
  selectedCollectionId: string;
  onCollectionChange: (id: string) => void;
  selectedMedia: MediaItem | null;
  onSelectMedia: (item: MediaItem | null) => void;
  artistRadio: boolean;
  onArtistRadioChange: (value: boolean) => void;
  shufflePlaylist: boolean;
  onShufflePlaylistChange: (value: boolean) => void;
  shuffleArtist: boolean;
  onShuffleArtistChange: (value: boolean) => void;
  onToast: (msg: string) => void;
};

export function PickMusicSection({
  authConnected,
  pickTab,
  onPickTab,
  collections,
  selectedCollectionId,
  onCollectionChange,
  selectedMedia,
  onSelectMedia,
  artistRadio,
  onArtistRadioChange,
  shufflePlaylist,
  onShufflePlaylistChange,
  shuffleArtist,
  onShuffleArtistChange,
  onToast,
}: Props) {
  const [playlists, setPlaylists] = useState<MediaItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchHits, setSearchHits] = useState<MediaItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<MediaSuggestions | null>(null);
  const [suggestionSelect, setSuggestionSelect] = useState("");
  const [previewTracks, setPreviewTracks] = useState<MediaItem[]>([]);
  const [previewTracksLoading, setPreviewTracksLoading] = useState(false);

  const suggestionFamily = useMemo(() => {
    if (pickTab === "album" || pickTab === "artist" || pickTab === "track") return pickTab;
    return null;
  }, [pickTab]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!authConnected || pickTab !== "playlist") {
      setPlaylists([]);
      return;
    }
    let cancelled = false;
    api
      .media("playlists")
      .then((rows) => {
        if (cancelled) return;
        setPlaylists(rows);
        if (rows.length) {
          onSelectMedia(rows[0]);
        } else {
          onSelectMedia(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          onToast(err instanceof Error ? err.message : String(err));
          setPlaylists([]);
          onSelectMedia(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authConnected, pickTab, onSelectMedia, onToast]);

  useEffect(() => {
    if (!authConnected || !suggestionFamily) {
      setSuggestions(null);
      return;
    }
    api
      .mediaSuggestions(suggestionFamily)
      .then(setSuggestions)
      .catch((err) => {
        onToast(err instanceof Error ? err.message : String(err));
        setSuggestions(null);
      });
  }, [authConnected, suggestionFamily, onToast]);

  useEffect(() => {
    if (!authConnected || !suggestionFamily) {
      setSearchHits([]);
      return;
    }
    if (debouncedQuery.length < 2) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    api
      .mediaSearch(suggestionFamily, debouncedQuery)
      .then((rows) => {
        if (!cancelled) setSearchHits(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          onToast(err instanceof Error ? err.message : String(err));
          setSearchHits([]);
        }
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authConnected, suggestionFamily, debouncedQuery, onToast]);

  useEffect(() => {
    if (!authConnected) {
      setPreviewTracks([]);
      setPreviewTracksLoading(false);
      return;
    }
    if (pickTab !== "playlist" && pickTab !== "album" && pickTab !== "artist") {
      setPreviewTracks([]);
      setPreviewTracksLoading(false);
      return;
    }
    if (!selectedMedia || selectedMedia.type !== pickTab) {
      setPreviewTracks([]);
      setPreviewTracksLoading(false);
      return;
    }
    const family = pickTab as "playlist" | "album" | "artist";
    let cancelled = false;
    setPreviewTracks([]);
    setPreviewTracksLoading(true);
    api
      .mediaTracksForParent(family, selectedMedia.id, 50)
      .then((rows) => {
        if (!cancelled) setPreviewTracks(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          onToast(err instanceof Error ? err.message : String(err));
          setPreviewTracks([]);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewTracksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authConnected, pickTab, selectedMedia?.id, selectedMedia?.type, onToast]);

  const allSuggestionItems = useMemo(() => {
    if (!suggestions) return [] as MediaItem[];
    return [...suggestions.most_played, ...suggestions.unplayed, ...suggestions.random];
  }, [suggestions]);

  const pickFromSuggestionSelect = useCallback(
    (value: string) => {
      setSuggestionSelect(value);
      if (!value) return;
      const hit = allSuggestionItems.find((x) => x.id === value);
      if (hit) {
        onSelectMedia(hit);
        setSearchQuery("");
        setSearchHits([]);
      }
    },
    [allSuggestionItems, onSelectMedia],
  );

  const shuffleRandomAlbum = useCallback(async () => {
    if (!selectedCollectionId) {
      onToast("Choose an album collection first.");
      return;
    }
    try {
      const album = await api.randomAlbum(selectedCollectionId);
      onSelectMedia(album);
      setSuggestionSelect("");
      setSearchQuery("");
      setSearchHits([]);
      onToast(`Random: ${album.title}`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e));
    }
  }, [selectedCollectionId, onSelectMedia, onToast]);

  const showArt =
    selectedMedia &&
    (selectedMedia.type === "album" || selectedMedia.type === "artist" || selectedMedia.type === "track" || selectedMedia.type === "playlist");

  return (
    <section className="card">
      <h2>Pick Music</h2>
      {!authConnected ? <p className="hint">Plex not connected. Sign in on Setup.</p> : null}

      <div className="tabRow pickMusicTabs" role="tablist" aria-label="Music source">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={pickTab === tab.id}
            className={pickTab === tab.id ? "active" : ""}
            onClick={() => {
              onPickTab(tab.id);
              setSuggestionSelect("");
              setSearchQuery("");
              setSearchHits([]);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!authConnected ? null : pickTab === "playlist" ? (
        <div className="pickPanel">
          <label className="fieldLabel" htmlFor="pick-playlist">
            Playlist
          </label>
          <select
            id="pick-playlist"
            value={selectedMedia?.type === "playlist" ? selectedMedia.id : ""}
            onChange={(e) => {
              const row = playlists.find((p) => p.id === e.target.value);
              onSelectMedia(row ?? null);
            }}
          >
            {playlists.length === 0 ? <option value="">No playlists loaded</option> : null}
            {playlists.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <label className="checkboxRow shufflePickRow">
            <input type="checkbox" checked={shufflePlaylist} onChange={(e) => onShufflePlaylistChange(e.target.checked)} />
            Shuffle
          </label>
          <p className="hint subtle">When on, Plexamp builds a shuffled queue for this playlist.</p>
        </div>
      ) : null}

      {!authConnected ? null : suggestionFamily ? (
        <div className="pickPanel">
          {pickTab === "artist" ? (
            <label className="checkboxRow artistRadioRow">
              <input type="checkbox" checked={artistRadio} onChange={(e) => onArtistRadioChange(e.target.checked)} />
              Radio
            </label>
          ) : null}
          {pickTab === "artist" ? (
            <p className="hint subtle artistRadioHint">
              When checked, Plex artist radio; when off, only this artist&apos;s library tracks.
            </p>
          ) : null}
          {pickTab === "artist" ? (
            <label className="checkboxRow shufflePickRow">
              <input type="checkbox" checked={shuffleArtist} onChange={(e) => onShuffleArtistChange(e.target.checked)} />
              Shuffle
            </label>
          ) : null}
          {pickTab === "artist" ? (
            <p className="hint subtle shuffleArtistHint">When on, Plexamp shuffles the queue (radio or library).</p>
          ) : null}
          <label className="fieldLabel" htmlFor={`pick-search-${suggestionFamily}`}>
            Search {suggestionFamily}s
          </label>
          <input
            id={`pick-search-${suggestionFamily}`}
            className="textSearchInput"
            type="search"
            autoComplete="off"
            placeholder={`Type at least 2 characters…`}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSuggestionSelect("");
            }}
          />
          {searchLoading ? <p className="hint subtle">Searching…</p> : null}
          {searchHits.length > 0 ? (
            <ul className="searchHitList" aria-label="Search results">
              {searchHits.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="searchHitBtn"
                    onClick={() => {
                      onSelectMedia(item);
                      setSuggestionSelect("");
                    }}
                  >
                    <span className="searchHitTitle">{item.title}</span>
                    {item.subtitle ? <span className="searchHitSub">{item.subtitle}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <label className="fieldLabel" htmlFor="pick-suggestions">
            Suggestions
          </label>
          <select
            id="pick-suggestions"
            className="suggestionSelect"
            value={suggestionSelect}
            onChange={(e) => pickFromSuggestionSelect(e.target.value)}
          >
            <option value="">Choose from most played, unplayed, or random…</option>
            {suggestions && suggestions.most_played.length > 0 ? (
              <optgroup label="Most played">
                {suggestions.most_played.map((item) => (
                  <option key={`m-${item.id}`} value={item.id}>
                    {item.title}
                    {item.subtitle ? ` — ${item.subtitle}` : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {suggestions && suggestions.unplayed.length > 0 ? (
              <optgroup label="Unplayed">
                {suggestions.unplayed.map((item) => (
                  <option key={`u-${item.id}`} value={item.id}>
                    {item.title}
                    {item.subtitle ? ` — ${item.subtitle}` : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {suggestions && suggestions.random.length > 0 ? (
              <optgroup label="Random">
                {suggestions.random.map((item) => (
                  <option key={`r-${item.id}`} value={item.id}>
                    {item.title}
                    {item.subtitle ? ` — ${item.subtitle}` : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </div>
      ) : null}

      {!authConnected ? null : pickTab === "random_album" ? (
        <div className="pickPanel">
          {collections.length > 0 ? (
            <>
              <label className="fieldLabel" htmlFor="pick-collection">
                Album collection
              </label>
              <select id="pick-collection" value={selectedCollectionId} onChange={(e) => onCollectionChange(e.target.value)}>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <div className="shuffleRow">
                <button type="button" className="iconBtn primary shuffleAlbumBtn" title="Pick random album" aria-label="Shuffle random album" onClick={() => shuffleRandomAlbum().catch(() => undefined)}>
                  <IconShuffle />
                </button>
                <span className="hint shuffleHint">Shuffle a random album from this collection.</span>
              </div>
            </>
          ) : (
            <p className="hint">No album collections found — create collections in Plex, then refresh.</p>
          )}
        </div>
      ) : null}

      {showArt && selectedMedia ? (
        <div className="pickedArtWrap">
          <img className="pickedArt" src={`${API_BASE}/media/art/${selectedMedia.id}`} alt="" loading="lazy" decoding="async" />
          <div className="pickedArtMeta">
            <div className="pickedArtTitle">{selectedMedia.title}</div>
            {selectedMedia.subtitle ? <div className="pickedArtSub">{selectedMedia.subtitle}</div> : null}
          </div>
        </div>
      ) : null}

      {showArt && selectedMedia && (pickTab === "playlist" || pickTab === "album" || pickTab === "artist") ? (
        <div className="trackPreviewShell">
          <div className="fieldLabel">
            Tracks
            {!previewTracksLoading && previewTracks.length > 0 ? (
              <span className="trackPreviewCount"> (showing {previewTracks.length})</span>
            ) : null}
          </div>
          {previewTracksLoading ? (
            <p className="hint subtle">Loading tracks…</p>
          ) : previewTracks.length > 0 ? (
            <ol className="trackPreviewList" aria-label="Tracks in this selection">
              {previewTracks.map((track, index) => (
                <li key={track.id} className="trackPreviewRow">
                  <span className="trackPreviewIdx">{index + 1}</span>
                  <span className="trackPreviewCell">
                    <span className="trackPreviewTitle">{track.title}</span>
                    {track.subtitle ? <span className="trackPreviewSub">{track.subtitle}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint subtle">No tracks returned for this item.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
