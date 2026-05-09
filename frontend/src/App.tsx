import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { api, MediaItem, MediaType, Player, Speaker, SpeedDial } from "./api";

const mediaTabs: Array<{ label: string; kind: "playlists" | "albums" | "artists" | "tracks"; mediaType: MediaType }> = [
  { label: "Playlist", kind: "playlists", mediaType: "playlist" },
  { label: "Album", kind: "albums", mediaType: "album" },
  { label: "Artist", kind: "artists", mediaType: "artist" },
  { label: "Track", kind: "tracks", mediaType: "track" },
];

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

  const refreshAll = async () => {
    const authStatus = await api.authStatus();
    setAuthConnected(authStatus.connected);
    setUsername(authStatus.username ?? "");
    const [speakerRows, playerRows, speedDialRows] = await Promise.all([api.speakers(), api.players(), api.speedDial()]);
    setSpeakers(speakerRows);
    setPlayers(playerRows);
    setSelectedPlayer((existing) => existing ?? playerRows[0]?.id ?? null);
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

  const deleteSpeedDial = async (id: number) => {
    await api.deleteSpeedDial(id);
    setSpeedDial(await api.speedDial());
    setMessage("Removed from speed dial.");
  };

  const addDemoPlayer = async () => {
    await api.createPlayer({
      name: `Player ${players.length + 1}`,
      host: "plexamp.local",
      port: 32500,
      is_active: true,
    });
    const updated = await api.players();
    setPlayers(updated);
    if (!selectedPlayer && updated[0]) {
      setSelectedPlayer(updated[0].id);
    }
  };

  return (
    <div className="container">
      <h1>Plexamp Sonos Speed Dial</h1>
      <section className="card">
        <h2>Plex Auth</h2>
        <p>{authConnected ? `Connected as ${username || "owner"}` : "Not connected"}</p>
        <p className="hint">
          Put <code>PLEX_SERVER_URL</code> in the repo-root <code>.env</code> or <code>backend/.env</code> too (otherwise media returns 503 if you start uvicorn from <code>backend/</code>). Use LAN IP / <code>host.docker.internal:32400</code> when the API is in Docker.
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              const r = await api.plexServerTest();
              const libs = r.music_library_sections.join(", ") || "(none)";
              setMessage(
                r.ok
                  ? `Plex OK — ${r.friendly_name ?? "server"} @ ${r.configured_url}. Music libs: ${libs}. ${r.error_detail ?? ""}`.trim()
                  : `Plex check failed (${r.configured_url || "no URL"}): ${r.error_detail ?? "unknown"} (ssl_verify=${r.ssl_verify_enabled})`,
              );
            } catch (err) {
              setMessage(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          Test Plex server (API)
        </button>
        <button
          type="button"
          onClick={async () => {
            setMessage("Opening Plex sign-in — approve this app in the browser window…");
            try {
              const start = await api.startAuth();
              window.open(start.auth_url, "_blank", "noopener,noreferrer");
              let finished = false;
              for (let i = 0; i < 90; i += 1) {
                await new Promise((r) => setTimeout(r, 2000));
                const st = await api.pollPlexPin(start.pin_id);
                if (st.status === "connected") {
                  finished = true;
                  setAuthConnected(true);
                  setUsername(st.username ?? "");
                  setMessage("Plex linked. Loading your library…");
                  await reloadCollections(true);
                  await reloadMediaTab(currentTab.kind, true);
                  setMessage(`Plex linked as ${st.username ?? "account"}`);
                  break;
                }
              }
              if (!finished) {
                const last = await api.authStatus();
                if (!last.connected) {
                  setMessage("Still waiting for Plex approval, or sign-in timed out. Try Connect again.");
                }
              }
            } catch (e) {
              setMessage(String(e));
            }
          }}
        >
          {authConnected ? "Reconnect Plex" : "Connect Plex"}
        </button>
      </section>

      <section className="card">
        <h2>Pick Music</h2>
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
          If this list is empty while using Docker, set <code>SONOS_SEED_IPS</code> on the API to the LAN IP of any Sonos
          player (comma-separated for retries). Multicast discovery rarely works from a bridge network.
        </p>
        {speakers.length === 0 ? <p className="hint">No speakers returned yet — check API logs and SONOS_SEED_IPS.</p> : null}
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
        <button onClick={addDemoPlayer}>Add Plexamp Player</button>
      </section>

      <section className="card sticky">
        <button className="primary" onClick={() => runPlay().catch((error) => setMessage(error.message))}>
          Play now
        </button>
        <button onClick={() => saveSpeedDial().catch((error) => setMessage(error.message))}>Add to speed dial</button>
      </section>

      <section className="card">
        <h2>Speed Dial</h2>
        {speedDial.length === 0 ? <p>No favorites yet.</p> : null}
        <div className="grid">
          {speedDial.map((favorite) => (
            <div className="favorite" key={favorite.id}>
              <button onClick={() => runPlay(favorite).catch((error) => setMessage(error.message))}>{favorite.label}</button>
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
