import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { api, API_BASE, MediaItem, Player, Speaker, SpeedDial } from "./api";
import { PickMusicSection, PickTab, playMediaTypeForTab } from "./PickMusicSection";
import { SetupModal } from "./SetupModal";

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

function IconPause() {
  return (
    <svg className="mediaCtrlIcon" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
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
  const [pickTab, setPickTab] = useState<PickTab>("playlist");
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
  const [artistRadio, setArtistRadio] = useState(true);
  const [shufflePlaylist, setShufflePlaylist] = useState(false);
  const [shuffleArtist, setShuffleArtist] = useState(false);

  const selectedPlayerName = useMemo(
    () => players.find((player) => player.id === selectedPlayer)?.name ?? "No player selected",
    [players, selectedPlayer],
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
  };

  useEffect(() => {
    refreshAll().catch((error) => setMessage(String(error)));
  }, []);

  useEffect(() => {
    reloadCollections(authConnected).catch(() => undefined);
  }, [authConnected, reloadCollections]);

  const toggleSpeaker = (speakerId: string) => {
    setSelectedSpeakers((current) =>
      current.includes(speakerId) ? current.filter((id) => id !== speakerId) : [...current, speakerId],
    );
  };

  const runPlay = async (payload?: Omit<SpeedDial, "id" | "label">) => {
    const mediaType = payload?.media_type ?? playMediaTypeForTab(pickTab);
    const mediaId = payload?.media_id ?? selectedMedia?.id;
    const playerId = payload?.player_id ?? selectedPlayer;
    const speakerIds = payload?.speaker_ids ?? selectedSpeakers;
    if (!mediaId || !playerId) {
      setMessage("Select media and Plexamp player first.");
      return;
    }
    const shufflePlay =
      payload?.shuffle ??
      (mediaType === "playlist" ? shufflePlaylist : mediaType === "artist" ? shuffleArtist : false);
    const result = await api.play({
      media_type: mediaType,
      media_id: mediaId,
      player_id: playerId,
      speaker_ids: speakerIds,
      preset_id: payload?.preset_id ?? null,
      ...(mediaType === "artist" ? { artist_radio: payload?.artist_radio ?? artistRadio } : {}),
      shuffle: shufflePlay,
    });
    setMessage(result.details);
  };

  const saveSpeedDial = async () => {
    if (!selectedMedia || !selectedPlayer) {
      setMessage("Select media and player before saving.");
      return;
    }
    const mt = playMediaTypeForTab(pickTab);
    await api.createSpeedDial({
      label: `${selectedMedia.title} -> ${selectedPlayerName}`,
      media_type: mt,
      media_id: selectedMedia.id,
      player_id: selectedPlayer,
      speaker_ids: selectedSpeakers,
      preset_id: null,
      ...(mt === "artist" ? { artist_radio: artistRadio } : {}),
      ...(mt === "playlist" || mt === "artist" ? { shuffle: mt === "playlist" ? shufflePlaylist : shuffleArtist } : {}),
    });
    setSpeedDial(await api.speedDial());
    setMessage("Saved to speed dial.");
  };

  const refreshPlexAuthFromApi = useCallback(async () => {
    const authStatus = await api.authStatus();
    setAuthConnected(authStatus.connected);
    setUsername(authStatus.username ?? "");
    await reloadCollections(authStatus.connected);
  }, [reloadCollections]);

  const handlePickTab = useCallback((tab: PickTab) => {
    setPickTab(tab);
    setSelectedMedia(null);
  }, []);

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

  const pausePlexamp = async () => {
    if (!selectedPlayer) {
      setMessage("Select a Plexamp player first.");
      return;
    }
    const result = await api.plexampPause(selectedPlayer);
    setMessage(result.details);
  };

  const resumePlexamp = async () => {
    if (!selectedPlayer) {
      setMessage("Select a Plexamp player first.");
      return;
    }
    const result = await api.plexampResume(selectedPlayer);
    setMessage(result.details);
  };

  const playSonosLineIn = async () => {
    if (selectedSpeakers.length === 0) {
      setMessage("Select at least one Sonos speaker to play line-in.");
      return;
    }
    const result = await api.sonosPlayLineIn(selectedSpeakers);
    setMessage(result.details);
  };

  const adjustSonosVolume = async (delta: number) => {
    if (selectedSpeakers.length === 0) {
      setMessage("Select at least one Sonos speaker to change volume.");
      return;
    }
    const result = await api.sonosVolumeAdjust(selectedSpeakers, delta);
    setMessage(result.details);
  };

  const deleteSpeedDial = async (id: number) => {
    await api.deleteSpeedDial(id);
    setSpeedDial(await api.speedDial());
    setMessage("Removed from speed dial.");
  };

  const playSpeedDialFavorite = async (favorite: SpeedDial) => {
    const result = await api.speedDialPlay(favorite.id);
    setMessage(result.details);
  };

  return (
    <div className="appShell">
      <div className="appMain">
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

        <PickMusicSection
          authConnected={authConnected}
          username={username}
          pickTab={pickTab}
          onPickTab={handlePickTab}
          collections={collections}
          selectedCollectionId={selectedCollectionId}
          onCollectionChange={setSelectedCollectionId}
          selectedMedia={selectedMedia}
          onSelectMedia={setSelectedMedia}
          artistRadio={artistRadio}
          onArtistRadioChange={setArtistRadio}
          shufflePlaylist={shufflePlaylist}
          onShufflePlaylistChange={setShufflePlaylist}
          shuffleArtist={shuffleArtist}
          onShuffleArtistChange={setShuffleArtist}
          onToast={setMessage}
        />

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
          <div className="stickyActions">
            <button type="button" className="primary" onClick={() => runPlay().catch((error) => setMessage(error.message))}>
              Start
            </button>
            <button type="button" onClick={() => saveSpeedDial().catch((error) => setMessage(error.message))}>
              Add to speed dial
            </button>
          </div>
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
                  onClick={() => playSpeedDialFavorite(favorite).catch((error) => setMessage(error.message))}
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

      <aside className="controlRail" aria-label="Playback controls">
        <fieldset className="controlFrameset">
          <legend>Sonos</legend>
          <div className="mediaToolbar mediaToolbarStack" role="group" aria-label="Sonos selected speakers">
            <button
              type="button"
              className="iconBtn"
              aria-label="Play line-in on selected Sonos speakers"
              title="Play line-in on selected speakers"
              onClick={() => playSonosLineIn().catch((e) => setMessage(e.message))}
            >
              <IconPlay />
            </button>
            <button
              type="button"
              className="iconBtn"
              aria-label="Stop selected Sonos speakers"
              title="Stop selected speakers"
              onClick={() => stopSonos().catch((e) => setMessage(e.message))}
            >
              <IconStop />
            </button>
            <button
              type="button"
              className="iconBtn"
              aria-label="Lower volume on selected Sonos speakers"
              title="Volume down (selected speakers)"
              onClick={() => adjustSonosVolume(-5).catch((e) => setMessage(e.message))}
            >
              <span className="volStepLabel" aria-hidden>
                −
              </span>
            </button>
            <button
              type="button"
              className="iconBtn"
              aria-label="Raise volume on selected Sonos speakers"
              title="Volume up (selected speakers)"
              onClick={() => adjustSonosVolume(5).catch((e) => setMessage(e.message))}
            >
              <span className="volStepLabel" aria-hidden>
                +
              </span>
            </button>
          </div>
        </fieldset>

        <fieldset className="controlFrameset">
          <legend>Plexamp</legend>
          <div className="mediaToolbar mediaToolbarStack" role="group" aria-label="Plexamp transport">
            <button
              type="button"
              className="iconBtn"
              aria-label="Resume Plexamp playback"
              title="Resume playback on Plexamp (current queue; does not start a new queue)"
              onClick={() => resumePlexamp().catch((e) => setMessage(e.message))}
            >
              <IconPlay />
            </button>
            <button
              type="button"
              className="iconBtn"
              aria-label="Pause Plexamp playback"
              title="Pause Plexamp playback"
              onClick={() => pausePlexamp().catch((e) => setMessage(e.message))}
            >
              <IconPause />
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
        </fieldset>
      </aside>
    </div>
  );
}

export default App;
