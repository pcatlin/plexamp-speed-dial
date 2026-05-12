import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { api, API_BASE, MediaItem, MediaType, Player, Speaker, SpeedDial } from "./api";
import { SetupModal } from "./SetupModal";

const mediaTabs: Array<{ label: string; kind: "playlists" | "albums" | "artists" | "tracks"; mediaType: MediaType }> = [
  { label: "Playlist", kind: "playlists", mediaType: "playlist" },
  { label: "Album", kind: "albums", mediaType: "album" },
  { label: "Artist", kind: "artists", mediaType: "artist" },
  { label: "Track", kind: "tracks", mediaType: "track" },
];

function IconPlay() {
  return (
    <svg className="mediaCtrlIcon" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg className="mediaCtrlIcon" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M6 6h12v12H6V6z" />
    </svg>
  );
}

function IconSkipPrevious() {
  return (
    <svg className="mediaCtrlIcon" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M6 6h2v12H6V6zm3 6l9-6v12l-9-6z" />
    </svg>
  );
}

function IconSkipNext() {
  return (
    <svg className="mediaCtrlIcon" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M6 18V6l9 6-9 6zm10-12h2v12h-2V6z" />
    </svg>
  );
}

function App() {
  const [authConnected, setAuthConnected] = useState(false);
  const [username, setUsername] = useState("");
  const [currentTab, setCurrentTab] = useState(mediaTabs[0]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeakers, setSelectedSpeakers] = useState<string[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [speedDial, setSpeedDial] = useState<SpeedDial[]>([]);
  const [message, setMessage] = useState("Ready.");
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);

  const selectedPlayerName = useMemo(
    () => players.find((player) => player.id === selectedPlayer)?.name ?? "No player selected",
    [players, selectedPlayer],
  );

  const reloadMediaTab = useCallback(
    async (kind: typeof currentTab.kind, connected: boolean) => {
      if (!connected) {
        setMediaItems([]);
        setSelectedMedia(null);
        return;
      }
      try {
        const rows = await api.media(kind);
        setMediaItems(rows);
        setSelectedMedia(rows[0] ?? null);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setMessage(`Media failed: ${detail}`);
        setMediaItems([]);
        setSelectedMedia(null);
      }
    },
    [],
  );

  const reloadCollections = useCallback(async (connected: boolean) => {
    if (!connected) {
      setCollections([]);
      setSelectedCollectionId("");
      return;
    }
    try {
      const rows = await api.collections();
      setCollections(rows);
      setSelectedCollectionId(rows[0]?.id ?? "");
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setMessage(`Collections failed: ${detail}`);
      setCollections([]);
      setSelectedCollectionId("");
    }
  }, []);

  const reloadPlayersSelection = async (nextPlayers: Player[]) => {
    setPlayers(nextPlayers);
    setSelectedPlayer((current) => {
      if (!nextPlayers.length) return null;
      if (current && nextPlayers.some((p) => p.id === current)) return current;
      return nextPlayers[0]?.id ?? null;
    });
  };

  const refreshAll = async () => {
    const authStatus = await api.authStatus();
    setAuthConnected(authStatus.connected);
    setUsername(authStatus.username ?? "");
    const [speakerRows, playerRows, speedDialRows] = await Promise.all([api.speakers(), api.players(), api.speedDial()]);
    setSpeakers(speakerRows);
    await reloadPlayersSelection(playerRows);
    setSpeedDial(speedDialRows);
    await reloadCollections(authStatus.connected);
    await reloadMediaTab(currentTab.kind, authStatus.connected);
  };

  useEffect(() => {
    refreshAll().catch((error) => setMessage(String(error)));
  }, []);

  useEffect(() => {
    reloadMediaTab(currentTab.kind, authConnected).catch(() => undefined);
  }, [currentTab, authConnected, reloadMediaTab]);

  const toggleSpeaker = (speakerId: string) => {
    setSelectedSpeakers((current) =>
      current.includes(speakerId) ? current.filter((id) => id !== speakerId) : [...current, speakerId],
    );
  };

  const runPlay = async (payload?: Omit<SpeedDial, "id" | "label">) => {
    const mediaType = payload?.media_type ?? currentTab.mediaType;
    const mediaId = payload?.media_id ?? selectedMedia?.id;
    const playerId = payload?.player_id ?? selectedPlayer;
    const speakerIds = payload?.speaker_ids ?? selectedSpeakers;
    if (!mediaId || !playerId) {
      setMessage("Select media and Plexamp player first.");
      return;
    }
    const result = await api.play({
      media_type: mediaType,
      media_id: mediaId,
      player_id: playerId,
      speaker_ids: speakerIds,
      preset_id: payload?.preset_id ?? null,
    });
    setMessage(result.details);
  };

  const saveSpeedDial = async () => {
    if (!selectedMedia || !selectedPlayer) {
      setMessage("Select media and player before saving.");
      return;
    }
    await api.createSpeedDial({
      label: `${selectedMedia.title} -> ${selectedPlayerName}`,
      media_type: currentTab.mediaType,
      media_id: selectedMedia.id,
      player_id: selectedPlayer,
      speaker_ids: selectedSpeakers,
      preset_id: null,
    });
    setSpeedDial(await api.speedDial());
    setMessage("Saved to speed dial.");
  };

  const refreshPlexAuthFromApi = useCallback(async () => {
    const authStatus = await api.authStatus();
    setAuthConnected(authStatus.connected);
    setUsername(authStatus.username ?? "");
    await reloadCollections(authStatus.connected);
    await reloadMediaTab(currentTab.kind, authStatus.connected);
  }, [currentTab.kind, reloadCollections, reloadMediaTab]);

  const reloadSpeakersOnly = async () => {
    try {
      setSpeakers(await api.speakers());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const stopSonos = async () => {
    if (selectedSpeakers.length === 0) {
      setMessage("Select at least one Sonos speaker to stop.");
      return;
    }
    const result = await api.sonosStop(selectedSpeakers);
    setMessage(result.details);
  };

  const skipNextPlexamp = async () => {
    if (!selectedPlayer) {
      setMessage("Select a Plexamp player first.");
      return;
    }
    const result = await api.plexampSkipNext(selectedPlayer);
    setMessage(result.details);
  };

  const skipPreviousPlexamp = async () => {
    if (!selectedPlayer) {
      setMessage("Select a Plexamp player first.");
      return;
    }
    const result = await api.plexampSkipPrevious(selectedPlayer);
    setMessage(result.details);
  };

  const deleteSpeedDial = async (id: number) => {
    await api.deleteSpeedDial(id);
    setSpeedDial(await api.speedDial());
    setMessage("Removed from speed dial.");
  };

  return (
    <div className="container">
      <header className="headerRow">
        <h1>Plexamp Sonos Speed Dial</h1>
        <button type="button" className="ghost" onClick={() => setSetupOpen(true)}>
          Setup
        </button>
      </header>

      <SetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onPlayersUpdated={async () => {
          const plist = await api.players();
          await reloadPlayersSelection(plist);
        }}
        afterRuntimeSaved={reloadSpeakersOnly}
        onPlexAuthRefresh={refreshPlexAuthFromApi}
        onToast={(t) => setMessage(t)}
      />

      <section className="card">
        <h2>Pick Music</h2>
        {!authConnected ? (
          <p className="hint">
            Open <strong>Setup</strong> to configure your Plex server URL (or rely on backend env), then link your Plex account to
            load your library.
          </p>
        ) : (
          <p className="hint">
            Signed in as <strong>{username || "owner"}</strong>. Re-link from <strong>Setup</strong> if authorization fails or the library is empty.
          </p>
        )}
        <div className="tabRow">
          {mediaTabs.map((tab) => (
            <button key={tab.kind} className={tab.kind === currentTab.kind ? "active" : ""} onClick={() => setCurrentTab(tab)}>
              {tab.label}
            </button>
          ))}
          <button
            onClick={async () => {
              if (!selectedCollectionId) {
                setMessage("No album collections loaded — ensure Plex has collections and retry Connect.");
                return;
              }
              try {
                const album = await api.randomAlbum(selectedCollectionId);
                setSelectedMedia(album);
                setMessage(`Random album selected: ${album.title}`);
              } catch (e) {
                setMessage(String(e));
              }
            }}
          >
            Random Album
          </button>
        </div>
        {collections.length > 0 ? (
          <label className="checkboxRow">
            <span>Album collection:</span>
            <select value={selectedCollectionId} onChange={(e) => setSelectedCollectionId(e.target.value)}>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <select value={selectedMedia?.id ?? ""} onChange={(event) => setSelectedMedia(mediaItems.find((item) => item.id === event.target.value) ?? null)}>
          {mediaItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </section>

      <section className="card">
        <h2>Where to Play</h2>
        <h3>Sonos Speakers</h3>
        <p className="hint">
          Select Sonos outputs here to group them and switch them to the line-in source set in Setup (the player with
          Plexamp on analog in, e.g. Fridge). Leave all unchecked if you only want Plexamp without Sonos.
        </p>
        <button type="button" className="smallBtn" onClick={() => reloadSpeakersOnly().catch(() => undefined)}>
          Refresh speakers
        </button>
        {speakers.length === 0 ? <p className="hint">No speakers yet — enter seed IPs under Setup when using Docker/VLAN.</p> : null}
        {speakers.map((speaker) => (
          <label key={speaker.id} className="checkboxRow">
            <input type="checkbox" checked={selectedSpeakers.includes(speaker.id)} onChange={() => toggleSpeaker(speaker.id)} />
            {speaker.name}
          </label>
        ))}
        <h3>Plexamp Player</h3>
        <select value={selectedPlayer ?? ""} onChange={(event) => setSelectedPlayer(Number(event.target.value))}>
          <option value="">Choose player</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
        <p className="hint">Add or remove Plexamp headless endpoints under Setup.</p>
      </section>

      <section className="card sticky">
        <div className="mediaToolbar" role="group" aria-label="Playback controls">
          <button
            type="button"
            className="iconBtn primary"
            aria-label="Play"
            title="Play"
            onClick={() => runPlay().catch((error) => setMessage(error.message))}
          >
            <IconPlay />
          </button>
          <button type="button" className="iconBtn" aria-label="Stop" title="Stop Sonos" onClick={() => stopSonos().catch((e) => setMessage(e.message))}>
            <IconStop />
          </button>
          <button
            type="button"
            className="iconBtn"
            aria-label="Previous track"
            title="Previous track"
            onClick={() => skipPreviousPlexamp().catch((e) => setMessage(e.message))}
          >
            <IconSkipPrevious />
          </button>
          <button type="button" className="iconBtn" aria-label="Next track" title="Next track" onClick={() => skipNextPlexamp().catch((e) => setMessage(e.message))}>
            <IconSkipNext />
          </button>
        </div>
        <button onClick={() => saveSpeedDial().catch((error) => setMessage(error.message))}>Add to speed dial</button>
      </section>

      <section className="card">
        <h2>Speed Dial</h2>
        {speedDial.length === 0 ? <p>No favorites yet.</p> : null}
        <div className="grid">
          {speedDial.map((favorite) => (
            <div className="favorite" key={favorite.id}>
              <button
                type="button"
                className="favoritePlay"
                onClick={() => runPlay(favorite).catch((error) => setMessage(error.message))}
              >
                {favorite.has_cover_art ? (
                  <img
                    className="favoriteCover"
                    src={`${API_BASE}/speed-dial/${favorite.id}/cover`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      (event.target as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                ) : null}
                <span className="favoriteLabel">{favorite.label}</span>
              </button>
              <button className="danger" onClick={() => deleteSpeedDial(favorite.id).catch((error) => setMessage(error.message))}>
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      <p className="message">{message}</p>
    </div>
  );
}

export default App;
