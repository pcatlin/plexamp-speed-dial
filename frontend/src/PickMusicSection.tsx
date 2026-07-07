import { useCallback, useEffect, useMemo, useState } from "react";
import { api, API_BASE, MediaItem, type MediaSuggestions } from "./api";
import { MediaSuggestionRails, mediaSuggestionRailsForFamily } from "./MediaSuggestionRails";
import { IconChevronDown, IconShuffle } from "./icons";
import { ARTIST_ORDER_OPTIONS, artistOrderModeDisabledWithRadio, type ArtistOrderMode } from "./artistOrder";
import {
  radioRandomnessFromSliderIndex,
  radioRandomnessLabel,
  radioRandomnessSliderIndex,
  RADIO_RANDOMNESS_STEPS,
} from "./radioRandomness";

export type PickTab = "playlist" | "album" | "artist" | "track" | "random_album";

export function playMediaTypeForTab(tab: PickTab): "playlist" | "album" | "artist" | "track" {
  if (tab === "random_album") return "album";
  return tab;
}

const TABS: Array<{ id: PickTab; label: string }> = [
  { id: "playlist", label: "Playlist" },
  { id: "album", label: "Album" },
  { id: "artist", label: "Artist" },
  { id: "track", label: "Track" },
  { id: "random_album", label: "Random album" },
];

type RadioRandomnessSliderProps = {
  id: string;
  value: number;
  onChange: (value: number) => void;
};

function RadioRandomnessControl({ id, value, onChange }: RadioRandomnessSliderProps) {
  return (
    <div className="radioRandomnessBlock">
      <label className="fieldLabel radioRandomnessLabel" htmlFor={id}>
        Randomness
      </label>
      <input
        id={id}
        className="radioRandomnessSlider"
        type="range"
        min={0}
        max={RADIO_RANDOMNESS_STEPS.length - 1}
        step={1}
        value={radioRandomnessSliderIndex(value)}
        onChange={(e) => onChange(radioRandomnessFromSliderIndex(Number(e.target.value)))}
      />
      <span className="radioRandomnessValue">{radioRandomnessLabel(value)}</span>
      <p className="hint subtle radioRandomnessHint">
        Higher values include more distant related artists; unlimited has no cap.
      </p>
    </div>
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
  detailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
  artistRadio: boolean;
  onArtistRadioChange: (value: boolean) => void;
  shufflePlaylist: boolean;
  onShufflePlaylistChange: (value: boolean) => void;
  artistOrderMode: ArtistOrderMode;
  onArtistOrderModeChange: (value: ArtistOrderMode) => void;
  radioDegreesOfSeparation: number;
  onRadioDegreesOfSeparationChange: (value: number) => void;
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
  detailsOpen,
  onDetailsOpenChange,
  artistRadio,
  onArtistRadioChange,
  shufflePlaylist,
  onShufflePlaylistChange,
  artistOrderMode,
  onArtistOrderModeChange,
  radioDegreesOfSeparation,
  onRadioDegreesOfSeparationChange,
  onToast,
}: Props) {
  const [playlists, setPlaylists] = useState<MediaItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchHits, setSearchHits] = useState<MediaItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<MediaSuggestions | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [previewTracks, setPreviewTracks] = useState<MediaItem[]>([]);
  const [previewTracksLoading, setPreviewTracksLoading] = useState(false);

  const suggestionFamily = useMemo(() => {
    if (pickTab === "album" || pickTab === "artist" || pickTab === "track") return pickTab;
    return null;
  }, [pickTab]);

  const showRadioRandomness = pickTab === "track" || (pickTab === "artist" && artistRadio);

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
      setSuggestionsLoading(false);
      return;
    }
    let cancelled = false;
    setSuggestionsLoading(true);
    api
      .mediaSuggestions(suggestionFamily)
      .then((rows) => {
        if (!cancelled) setSuggestions(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          onToast(err instanceof Error ? err.message : String(err));
          setSuggestions(null);
        }
      })
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
    const controller = new AbortController();
    let cancelled = false;
    setPreviewTracks([]);
    setPreviewTracksLoading(true);
    api
      .mediaTracksForParent(family, selectedMedia.id, 50, { signal: controller.signal })
      .then((rows) => {
        if (!cancelled) setPreviewTracks(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof Error && err.message === "Request was cancelled") return;
          onToast(err instanceof Error ? err.message : String(err));
          setPreviewTracks([]);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewTracksLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authConnected, pickTab, selectedMedia?.id, selectedMedia?.type, onToast]);

  const pickFromSuggestionRail = useCallback(
    (item: MediaItem) => {
      onSelectMedia(item);
      setSearchQuery("");
      setSearchHits([]);
    },
    [onSelectMedia],
  );

  const shuffleRandomAlbum = useCallback(async () => {
    if (!selectedCollectionId) {
      onToast("Choose an album collection first.");
      return;
    }
    try {
      const album = await api.randomAlbum(selectedCollectionId);
      onSelectMedia(album);
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

  const pickMusicSummary = useMemo(() => {
    if (!selectedMedia) return "Nothing selected";
    const tabLabel = TABS.find((tab) => tab.id === pickTab)?.label ?? pickTab;
    return `${tabLabel} · ${selectedMedia.title}`;
  }, [pickTab, selectedMedia]);

  const selectedArtistOrder =
    ARTIST_ORDER_OPTIONS.find((option) => option.id === artistOrderMode) ?? ARTIST_ORDER_OPTIONS[0];

  return (
    <section className="card pickMusicCard">
      <details
        className="playToDetails"
        open={detailsOpen}
        onToggle={(event) => onDetailsOpenChange(event.currentTarget.open)}
      >
        <summary className="playToSummary">
          <span className="playToSummaryText">
            <span className="sectionTitle">Pick Music</span>
            <span className="playToSummarySelection">{pickMusicSummary}</span>
          </span>
          <IconChevronDown />
        </summary>
        <div className="playToBody">
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
          {showRadioRandomness ? (
            <RadioRandomnessControl
              id={pickTab === "track" ? "pick-track-radio-randomness" : "pick-radio-randomness"}
              value={radioDegreesOfSeparation}
              onChange={onRadioDegreesOfSeparationChange}
            />
          ) : null}
          {pickTab === "artist" ? (
            <fieldset className="artistOrderFieldset">
              <legend className="fieldLabel artistOrderLegend">Play order</legend>
              <div className="artistOrderOptions" role="radiogroup" aria-label="Artist play order">
                {ARTIST_ORDER_OPTIONS.map((option) => {
                  const disabled = artistRadio && artistOrderModeDisabledWithRadio(option.id);
                  return (
                    <label key={option.id} className={`artistOrderOption${disabled ? " isDisabled" : ""}`}>
                      <input
                        type="radio"
                        name="artist-order"
                        value={option.id}
                        checked={artistOrderMode === option.id}
                        disabled={disabled}
                        onChange={() => onArtistOrderModeChange(option.id)}
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
              <p className="hint subtle artistOrderHint">
                {artistRadio
                  ? "User ratings, Plex popular tracks, and album order apply to library playback only. Radio uses shuffle when selected."
                  : selectedArtistOrder.hint}
              </p>
            </fieldset>
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
                    }}
                  >
                    <span className="searchHitTitle">{item.title}</span>
                    {item.subtitle ? <span className="searchHitSub">{item.subtitle}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <MediaSuggestionRails
            rails={mediaSuggestionRailsForFamily(suggestionFamily, suggestions)}
            selectedId={selectedMedia?.type === suggestionFamily ? selectedMedia.id : null}
            loading={suggestionsLoading}
            loadingMessage={`Loading ${suggestionFamily} suggestions…`}
            emptyMessage={`No ${suggestionFamily} suggestions from Plex yet.`}
            onSelect={pickFromSuggestionRail}
          />
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
          <div className="trackPreviewBody">
            {previewTracksLoading ? (
              <p className="hint subtle trackPreviewPlaceholder">Loading tracks…</p>
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
              <p className="hint subtle trackPreviewPlaceholder">No tracks returned for this item.</p>
            )}
          </div>
        </div>
      ) : null}
        </div>
      </details>
    </section>
  );
}
