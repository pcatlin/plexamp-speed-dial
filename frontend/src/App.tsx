import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import "./App.css";
import { api, InitialVolumes, MediaItem, Player, Speaker, SpeedDial, playbackStateWebSocketUrl } from "./api";
import CreditsPage from "./CreditsPage";
import { PickMusicSection, PickTab, playMediaTypeForTab } from "./PickMusicSection";
import { SetupModal } from "./SetupModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { SonosVolumeMixerModal } from "./SonosVolumeMixerModal";
import { SpeedDialFavoriteCard } from "./SpeedDialFavoriteCard";
import { VolumeEditorPopover } from "./VolumeEditorPopover";
import {
  loadSelectedSpeakerIds,
  reconcileSelectedSpeakerIds,
  saveSelectedSpeakerIds,
} from "./playToStorage";
import { favoriteMatchesSpeakerFilter, outputKindForPlayer, pioneerHostFromOutput, presetLabelForCode } from "./audioOutput";
import {
  buildInitialVolumes,
  DEFAULT_INITIAL_VOLUME,
  mergeSonosVolumes,
} from "./initialVolumes";
import { buildSpeedDialLabel, formatSpeedDialPlayTarget, speedDialDisplayLabel } from "./speedDialLabel";
import {
  isMobileAppClient,
  openPlexampApp,
  openSonosApp,
  plexampAppHref,
  sonosAppHref,
} from "./appLinks";
import {
  IconChevronDown,
  IconLaunchApp,
  IconList,
  IconPause,
  IconPlay,
  IconPowerOff,
  IconSkipNext,
  IconSkipPrevious,
  IconStop,
  IconVolumeDown,
  IconVolumeUp,
} from "./icons";
import { Toast } from "./Toast";
import { useToast } from "./useToast";

function routeFromHash(hash: string): "app" | "credits" {
  const path = hash.replace(/^#/, "");
  return path === "/credits" || path.startsWith("/credits?") ? "credits" : "app";
}

type ControlFramesetLegendProps = {
  title: string;
  appLink?: {
    href: string;
    label: string;
    icon: ReactNode;
    mobileOnly?: boolean;
    onOpen?: (event: { preventDefault: () => void }) => void;
  };
};

function ControlFramesetLegend({ title, appLink }: ControlFramesetLegendProps) {
  return (
    <legend className="controlFramesetLegend">
      <span>{title}</span>
      {appLink ? (
        <a
          href={appLink.href}
          className={`controlFramesetAppLink${appLink.mobileOnly ? " controlFramesetAppLink--mobileOnly" : ""}`}
          aria-label={appLink.label}
          title={appLink.label}
          onClick={(event) => appLink.onOpen?.(event)}
        >
          {appLink.icon}
        </a>
      ) : null}
    </legend>
  );
}

type ReceiverStatus = {
  power_on: boolean | null;
  input_code: string | null;
  volume_db: number | null;
  volume_muted: boolean;
};

function speedDialPlayTarget(favorite: SpeedDial, players: Player[], speakers: Speaker[]): string {
  const player = players.find((row) => row.id === favorite.player_id);
  const isPioneer = outputKindForPlayer(player) === "pioneer";
  const pioneerLabel = pioneerHostFromOutput(player?.audio_output ?? { kind: "none", config: {} }).trim() || "Pioneer AVR";
  return formatSpeedDialPlayTarget({
    speakerIds: favorite.speaker_ids,
    initialVolumes: favorite.initial_volumes,
    isPioneer,
    pioneerLabel,
    speakers,
  });
}

function App() {
  const [route, setRoute] = useState<"app" | "credits">(() => routeFromHash(window.location.hash));

  useEffect(() => {
    const sync = () => {
      const next = routeFromHash(window.location.hash);
      setRoute(next);
      document.title = next === "credits" ? "Credits — Plexamp Speed Dial" : "Plexamp Speed Dial";
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const [authConnected, setAuthConnected] = useState(false);
  const [pickTab, setPickTab] = useState<PickTab>("playlist");
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [selectedSpeakers, setSelectedSpeakers] = useState<string[]>(() => loadSelectedSpeakerIds());
  const [sonosVolumes, setSonosVolumes] = useState<Record<string, number>>({});
  const [pioneerVolume, setPioneerVolume] = useState(DEFAULT_INITIAL_VOLUME);
  const [setVolumesOnPlay, setSetVolumesOnPlay] = useState(false);
  const [volumeEditor, setVolumeEditor] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [speedDial, setSpeedDial] = useState<SpeedDial[]>([]);
  const [speedDialDeleteTarget, setSpeedDialDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [speedDialDeleteMode, setSpeedDialDeleteMode] = useState(false);
  const [dragFavoriteId, setDragFavoriteId] = useState<number | null>(null);
  const [dropFavoriteId, setDropFavoriteId] = useState<number | null>(null);
  const [speedDialPlayerFilter, setSpeedDialPlayerFilter] = useState<number | null>(null);
  const [speedDialSpeakerFilter, setSpeedDialSpeakerFilter] = useState<string | null>(null);
  const [speedDialFiltersOpen, setSpeedDialFiltersOpen] = useState(false);
  const { toast, showToast } = useToast();
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [webhookBaseUrl, setWebhookBaseUrl] = useState("");
  const [webhooksEnabled, setWebhooksEnabled] = useState(false);
  const [webhookLinksHidden, setWebhookLinksHidden] = useState(false);
  const [artistRadio, setArtistRadio] = useState(true);
  const [radioDegreesOfSeparation, setRadioDegreesOfSeparation] = useState(1);
  const [shufflePlaylist, setShufflePlaylist] = useState(true);
  const [shuffleArtist, setShuffleArtist] = useState(false);
  const [sonosPlaying, setSonosPlaying] = useState<boolean | null>(null);
  const [sonosVolumeMixerOpen, setSonosVolumeMixerOpen] = useState(false);
  const [plexampPlaying, setPlexampPlaying] = useState<boolean | null>(null);
  const [receiverPowerOn, setReceiverPowerOn] = useState(false);
  const [receiverStatus, setReceiverStatus] = useState<ReceiverStatus | null>(null);

  const selectedPlayerRow = useMemo(
    () => players.find((player) => player.id === selectedPlayer),
    [players, selectedPlayer],
  );

  const selectedPlayerName = selectedPlayerRow?.name ?? "No player selected";

  const outputKind = outputKindForPlayer(selectedPlayerRow);

  const pioneerAvrLabel = useMemo(() => {
    const host = pioneerHostFromOutput(selectedPlayerRow?.audio_output ?? { kind: "none", config: {} });
    return host.trim() || "Pioneer AVR";
  }, [selectedPlayerRow]);

  const filteredSpeedDial = useMemo(() => {
    return speedDial.filter((favorite) => {
      if (speedDialPlayerFilter !== null && favorite.player_id !== speedDialPlayerFilter) return false;
      if (
        speedDialSpeakerFilter !== null &&
        !favoriteMatchesSpeakerFilter(favorite, speedDialSpeakerFilter, players)
      ) {
        return false;
      }
      return true;
    });
  }, [speedDial, speedDialPlayerFilter, speedDialSpeakerFilter, players]);

  const canReorderSpeedDial = speedDialPlayerFilter === null && speedDialSpeakerFilter === null;

  const speedDialFilterSummary = useMemo(() => {
    if (speedDialPlayerFilter === null && speedDialSpeakerFilter === null) return "All favorites";
    const parts: string[] = [];
    if (speedDialPlayerFilter !== null) {
      parts.push(players.find((player) => player.id === speedDialPlayerFilter)?.name ?? "Player");
    }
    if (speedDialSpeakerFilter !== null) {
      parts.push(speakers.find((speaker) => speaker.id === speedDialSpeakerFilter)?.name ?? "Speaker");
    }
    return parts.join(" · ");
  }, [speedDialPlayerFilter, speedDialSpeakerFilter, players, speakers]);

  const applyReceiverSnapshot = useCallback((receiver: {
    ok?: boolean;
    power_on?: boolean | null;
    input_code?: string | null;
    volume_db?: number | null;
    volume_muted?: boolean;
  } | undefined) => {
    if (!receiver?.ok) {
      return;
    }
    const volumeMuted = receiver.volume_muted ?? false;
    setReceiverStatus((prev) => ({
      power_on: receiver.power_on ?? prev?.power_on ?? null,
      input_code: receiver.input_code ?? prev?.input_code ?? null,
      volume_muted: volumeMuted,
      volume_db: volumeMuted ? null : receiver.volume_db ?? prev?.volume_db ?? null,
    }));
    if (receiver.power_on !== null && receiver.power_on !== undefined) {
      setReceiverPowerOn(receiver.power_on);
    }
  }, []);

  const receiverStatusLine = useMemo(() => {
    const power =
      receiverStatus?.power_on === true
        ? "On"
        : receiverStatus?.power_on === false
          ? "Standby"
          : "—";
    const input = receiverStatus?.input_code
      ? presetLabelForCode(receiverStatus.input_code)
      : "—";
    const volume = receiverStatus?.volume_muted
      ? "−∞ dB"
      : receiverStatus?.volume_db != null
        ? `${receiverStatus.volume_db.toFixed(1)} dB`
        : "—";
    return `${power} · ${input} · ${volume}`;
  }, [receiverStatus, selectedPlayerRow]);

  const hasPlayTargetSelection = selectedSpeakers.length > 0 || selectedPlayer !== null;

  const playToSummary = useMemo(() => {
    if (!hasPlayTargetSelection) return "Nothing selected";
    const playerPart = selectedPlayer !== null ? selectedPlayerName : "No Plexamp player";
    if (outputKind === "pioneer") {
      return `Pioneer AVR · ${playerPart}`;
    }
    const names = speakers.filter((s) => selectedSpeakers.includes(s.id)).map((s) => s.name);
    const speakerPart = names.length > 0 ? names.join(", ") : "No speakers";
    return `${speakerPart} · ${playerPart}`;
  }, [hasPlayTargetSelection, speakers, selectedSpeakers, selectedPlayer, selectedPlayerName, outputKind]);

  const [playToDetailsOpen, setPlayToDetailsOpen] = useState(() => !hasPlayTargetSelection);

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
      showToast(`Collections failed: ${detail}`);
      setCollections([]);
      setSelectedCollectionId("");
    }
  }, []);

  const loadWebhookBaseUrl = useCallback(async () => {
    try {
      const settings = await api.runtimeSettings();
      setWebhookBaseUrl(settings.webhook_base_url ?? "");
      setWebhooksEnabled(Boolean(settings.webhooks_enabled));
      setWebhookLinksHidden(Boolean(settings.webhook_links_hidden));
    } catch {
      setWebhookBaseUrl("");
      setWebhooksEnabled(false);
      setWebhookLinksHidden(false);
    }
  }, []);

  const applySpeakerList = useCallback((speakerRows: Speaker[]) => {
    setSpeakers(speakerRows);
    setSelectedSpeakers((current) => reconcileSelectedSpeakerIds(current, speakerRows.map((s) => s.id)));
    setSonosVolumes((current) => mergeSonosVolumes(speakerRows.map((s) => s.id), current));
  }, []);

  const applyFavoriteToPlayTo = useCallback(
    (favorite: SpeedDial) => {
      const availableSpeakerIds = speakers.map((speaker) => speaker.id);
      setSelectedSpeakers(reconcileSelectedSpeakerIds(favorite.speaker_ids, availableSpeakerIds));

      if (players.some((player) => player.id === favorite.player_id)) {
        setSelectedPlayer(favorite.player_id);
      }

      const volumes = favorite.initial_volumes;
      if (volumes?.sonos) {
        setSonosVolumes((current) =>
          mergeSonosVolumes(availableSpeakerIds, { ...current, ...volumes.sonos }),
        );
      }
      if (volumes?.pioneer != null) {
        setPioneerVolume(volumes.pioneer);
      }
    },
    [speakers, players],
  );

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
    const [speakerRows, playerRows, speedDialRows] = await Promise.all([api.speakers(), api.players(), api.speedDial()]);
    applySpeakerList(speakerRows);
    await reloadPlayersSelection(playerRows);
    setSpeedDial(speedDialRows);
    await reloadCollections(authStatus.connected);
    await loadWebhookBaseUrl();
  };

  useEffect(() => {
    refreshAll().catch((error) => showToast(String(error)));
  }, []);

  useEffect(() => {
    saveSelectedSpeakerIds(selectedSpeakers);
  }, [selectedSpeakers]);

  useEffect(() => {
    if (speedDialPlayerFilter !== null && !players.some((player) => player.id === speedDialPlayerFilter)) {
      setSpeedDialPlayerFilter(null);
    }
  }, [players, speedDialPlayerFilter]);

  useEffect(() => {
    if (speedDialSpeakerFilter !== null && !speakers.some((speaker) => speaker.id === speedDialSpeakerFilter)) {
      setSpeedDialSpeakerFilter(null);
    }
  }, [speakers, speedDialSpeakerFilter]);

  useEffect(() => {
    reloadCollections(authConnected).catch(() => undefined);
  }, [authConnected, reloadCollections]);

  useEffect(() => {
    const wantSonos = outputKind === "sonos" && selectedSpeakers.length > 0;
    const wantPlex = selectedPlayer !== null;
    const wantReceiver = outputKind === "pioneer" && selectedPlayer !== null;
    if (!wantSonos && !wantPlex && !wantReceiver) {
      setSonosPlaying(null);
      setPlexampPlaying(null);
      setReceiverStatus(null);
      return;
    }
    const url = playbackStateWebSocketUrl();
    if (!url) return;
    let cancelled = false;
    const ws = new WebSocket(url);
    ws.onopen = () => {
      if (cancelled) return;
      ws.send(
        JSON.stringify({
          type: "subscribe",
          speaker_ids: selectedSpeakers,
          player_id: selectedPlayer,
        }),
      );
    };
    ws.onmessage = (ev) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(ev.data) as {
          sonos?: { ok?: boolean; playing?: boolean | null };
          plexamp?: { ok?: boolean; playing?: boolean | null };
          receiver?: {
            ok?: boolean;
            power_on?: boolean | null;
            input_code?: string | null;
            volume_db?: number | null;
            volume_muted?: boolean;
          };
        };
        const s = data.sonos;
        if (wantSonos) {
          if (s?.ok && typeof s.playing === "boolean") setSonosPlaying(s.playing);
          else setSonosPlaying(null);
        } else {
          setSonosPlaying(null);
        }
        const p = data.plexamp;
        if (wantPlex) {
          if (p?.ok) setPlexampPlaying(p.playing ?? null);
          else setPlexampPlaying(null);
        } else {
          setPlexampPlaying(null);
        }
        if (wantReceiver) {
          applyReceiverSnapshot(data.receiver);
        } else {
          setReceiverStatus(null);
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    ws.onerror = () => {
      if (cancelled) return;
      setSonosPlaying(null);
      setPlexampPlaying(null);
    };
    return () => {
      cancelled = true;
      ws.close();
    };
  }, [selectedSpeakers, authConnected, selectedPlayer, outputKind, applyReceiverSnapshot]);

  useEffect(() => {
    if (!volumeEditor) return;
    const close = () => setVolumeEditor(null);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [volumeEditor]);

  const toggleVolumeEditor = (key: string) => {
    setVolumeEditor((current) => (current === key ? null : key));
  };

  const toggleSpeaker = (speakerId: string) => {
    setSelectedSpeakers((current) =>
      current.includes(speakerId) ? current.filter((id) => id !== speakerId) : [...current, speakerId],
    );
    setSonosVolumes((current) =>
      current[speakerId] === undefined ? { ...current, [speakerId]: DEFAULT_INITIAL_VOLUME } : current,
    );
  };

  const setSonosSpeakerVolume = (speakerId: string, volume: number) => {
    setSonosVolumes((current) => ({ ...current, [speakerId]: volume }));
  };

  const initialVolumesForPlay = useCallback(
    (speakerIds: string[]) => {
      if (!setVolumesOnPlay) return undefined;
      return buildInitialVolumes({
        selectedSpeakerIds: speakerIds,
        sonosVolumes,
        pioneerVolume,
        includePioneer: outputKind === "pioneer",
      });
    },
    [setVolumesOnPlay, sonosVolumes, pioneerVolume, outputKind],
  );

  const togglePlayer = (playerId: number) => {
    setSelectedPlayer((current) => (current === playerId ? null : playerId));
  };

  const runPlay = async (payload?: Omit<SpeedDial, "id" | "label">) => {
    const mediaType = payload?.media_type ?? playMediaTypeForTab(pickTab);
    const mediaId = payload?.media_id ?? selectedMedia?.id;
    const playerId = payload?.player_id ?? selectedPlayer;
    const speakerIds = payload?.speaker_ids ?? selectedSpeakers;
    if (!mediaId || !playerId) {
      showToast("Select media and Plexamp player first.");
      return;
    }
    const shufflePlay =
      payload?.shuffle ??
      (mediaType === "playlist" ? shufflePlaylist : mediaType === "artist" ? shuffleArtist : false);
    const artistRadioPlay = mediaType === "artist" ? (payload?.artist_radio ?? artistRadio) : false;
    const isRadioPlay = mediaType === "track" || artistRadioPlay;
    const result = await api.play({
      media_type: mediaType,
      media_id: mediaId,
      player_id: playerId,
      speaker_ids: speakerIds,
      preset_id: payload?.preset_id ?? null,
      ...(mediaType === "artist" ? { artist_radio: artistRadioPlay } : {}),
      ...(isRadioPlay ? { radio_degrees_of_separation: radioDegreesOfSeparation } : {}),
      shuffle: shufflePlay,
      initial_volumes: payload?.initial_volumes ?? initialVolumesForPlay(speakerIds),
    });
    if (result.status === "error") {
      showToast(result.details);
      return;
    }
    const title = selectedMedia?.title.trim();
    showToast(title ? `Playing ${title}` : "Playing");
    if (outputKindForPlayer(players.find((p) => p.id === playerId)) === "pioneer") {
      setReceiverPowerOn(true);
    }
  };

  const saveSpeedDial = async () => {
    if (!selectedMedia || !selectedPlayer) {
      showToast("Select media and player before saving.");
      return;
    }
    const mt = playMediaTypeForTab(pickTab);
    const shuffle = mt === "playlist" ? shufflePlaylist : mt === "artist" ? shuffleArtist : false;
    await api.createSpeedDial({
      label: buildSpeedDialLabel(selectedMedia.title, {
        radio: mt === "artist" ? artistRadio : false,
        shuffle: mt === "playlist" || mt === "artist" ? shuffle : false,
      }),
      media_type: mt,
      media_id: selectedMedia.id,
      player_id: selectedPlayer,
      speaker_ids: selectedSpeakers,
      preset_id: null,
      initial_volumes: initialVolumesForPlay(selectedSpeakers),
      ...(mt === "artist" ? { artist_radio: artistRadio } : {}),
      ...(mt === "playlist" || mt === "artist" ? { shuffle: mt === "playlist" ? shufflePlaylist : shuffleArtist } : {}),
    });
    setSpeedDial(await api.speedDial());
    showToast("Saved to speed dial.");
  };

  const refreshPlexAuthFromApi = useCallback(async () => {
    const authStatus = await api.authStatus();
    setAuthConnected(authStatus.connected);
    await reloadCollections(authStatus.connected);
  }, [reloadCollections]);

  const handlePickTab = useCallback((tab: PickTab) => {
    setPickTab(tab);
    setSelectedMedia(null);
  }, []);

  const reloadSpeakersOnly = async () => {
    try {
      applySpeakerList(await api.speakers());
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleSonosLineInTransport = async () => {
    if (selectedSpeakers.length === 0) {
      showToast("Select at least one Sonos speaker to play line-in.");
      return;
    }
    try {
      if (sonosPlaying) {
        const result = await api.sonosStop(selectedSpeakers);
        showToast(result.details);
        setSonosPlaying(false);
      } else {
        if (!selectedPlayer) {
          showToast("Select a Plexamp player first (line-in is configured per player in Setup).");
          return;
        }
        const result = await api.sonosPlayLineIn(selectedSpeakers, selectedPlayer);
        showToast(result.details);
        setSonosPlaying(true);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const skipNextPlexamp = async () => {
    if (!selectedPlayer) {
      showToast("Select a Plexamp player first.");
      return;
    }
    const result = await api.plexampSkipNext(selectedPlayer);
    showToast(result.details);
  };

  const skipPreviousPlexamp = async () => {
    if (!selectedPlayer) {
      showToast("Select a Plexamp player first.");
      return;
    }
    const result = await api.plexampSkipPrevious(selectedPlayer);
    showToast(result.details);
  };

  const togglePlexampPlayPause = async () => {
    if (!selectedPlayer) {
      showToast("Select a Plexamp player first.");
      return;
    }
    try {
      if (plexampPlaying) {
        const result = await api.plexampPause(selectedPlayer);
        showToast(result.details);
        setPlexampPlaying(false);
      } else {
        const result = await api.plexampResume(selectedPlayer);
        showToast(result.details);
        setPlexampPlaying(true);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const adjustReceiverVolume = async (delta: number) => {
    if (!selectedPlayer) {
      showToast("Select a Plexamp player first.");
      return;
    }
    const result = await api.audioOutputVolume(selectedPlayer, delta);
    showToast(result.details);
  };

  const toggleReceiverPower = async () => {
    if (!selectedPlayer) {
      showToast("Select a Plexamp player first.");
      return;
    }
    const next = !receiverPowerOn;
    const result = await api.audioOutputPower(selectedPlayer, next);
    setReceiverPowerOn(next);
    showToast(result.details);
  };

  const adjustSonosVolume = async (delta: number) => {
    if (selectedSpeakers.length === 0) {
      showToast("Select at least one Sonos speaker to change volume.");
      return;
    }
    const result = await api.sonosVolumeAdjust(selectedSpeakers, delta);
    showToast(result.details);
  };

  const patchSpeedDialFavorite = async (
    id: number,
    patch: {
      label?: string;
      player_id?: number;
      speaker_ids?: string[];
      initial_volumes?: InitialVolumes | null;
    },
  ) => {
    const updated = await api.patchSpeedDial(id, patch);
    setSpeedDial((current) => current.map((row) => (row.id === id ? updated : row)));
  };

  const reorderSpeedDial = async (orderedIds: number[]) => {
    const byId = new Map(speedDial.map((row) => [row.id, row]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((row): row is SpeedDial => row != null);
    setSpeedDial(reordered);
    try {
      const rows = await api.reorderSpeedDial(orderedIds);
      setSpeedDial(rows);
    } catch (error) {
      const rows = await api.speedDial();
      setSpeedDial(rows);
      throw error;
    }
  };

  const handleFavoriteDragStart = (favoriteId: number, event: DragEvent) => {
    setDragFavoriteId(favoriteId);
    setDropFavoriteId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(favoriteId));
  };

  const handleFavoriteDragEnd = () => {
    setDragFavoriteId(null);
    setDropFavoriteId(null);
  };

  const handleFavoriteDragOver = (favoriteId: number, event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragFavoriteId !== null && dragFavoriteId !== favoriteId) {
      setDropFavoriteId(favoriteId);
    }
  };

  const handleFavoriteDrop = (favoriteId: number, event: DragEvent) => {
    event.preventDefault();
    if (dragFavoriteId === null || dragFavoriteId === favoriteId) {
      handleFavoriteDragEnd();
      return;
    }
    const ids = speedDial.map((row) => row.id);
    const fromIndex = ids.indexOf(dragFavoriteId);
    const toIndex = ids.indexOf(favoriteId);
    handleFavoriteDragEnd();
    if (fromIndex < 0 || toIndex < 0) return;
    const nextIds = [...ids];
    nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, dragFavoriteId);
    void reorderSpeedDial(nextIds).catch((error) =>
      showToast(error instanceof Error ? error.message : String(error)),
    );
  };

  const deleteSpeedDial = async (id: number) => {
    await api.deleteSpeedDial(id);
    const rows = await api.speedDial();
    setSpeedDial(rows);
    if (rows.length === 0) {
      setSpeedDialDeleteMode(false);
    }
    showToast("Removed from speed dial.");
  };

  const confirmDeleteSpeedDial = async () => {
    if (!speedDialDeleteTarget) return;
    const { id } = speedDialDeleteTarget;
    try {
      await deleteSpeedDial(id);
      setSpeedDialDeleteTarget(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  };

  const playSpeedDialFavorite = async (favorite: SpeedDial) => {
    applyFavoriteToPlayTo(favorite);
    const result = await api.speedDialPlay(favorite.id);
    showToast(result.details);
  };

  const toggleSpeedDialPlayerFilter = (playerId: number) => {
    setSpeedDialPlayerFilter((current) => (current === playerId ? null : playerId));
  };

  const toggleSpeedDialSpeakerFilter = (speakerId: string) => {
    setSpeedDialSpeakerFilter((current) => (current === speakerId ? null : speakerId));
  };

  if (route === "credits") {
    return <CreditsPage />;
  }

  return (
    <>
      <Toast toast={toast} />
      <div className="appShell">
        <div className="appMain">
        <header className="headerRow">
          <h1>Plexamp Speed Dial</h1>
          <button type="button" className="ghost" onClick={() => setSetupOpen(true)}>
            Setup
          </button>
        </header>

        <SetupModal
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          onPlayerPatched={async (player) => {
            setPlayers((current) => current.map((p) => (p.id === player.id ? player : p)));
          }}
          onPlayersUpdated={async () => {
            const plist = await api.players();
            await reloadPlayersSelection(plist);
          }}
          afterRuntimeSaved={async () => {
            await reloadSpeakersOnly();
            await loadWebhookBaseUrl();
          }}
          onPlexAuthRefresh={refreshPlexAuthFromApi}
          onToast={showToast}
        />

        <ConfirmDialog
          open={speedDialDeleteTarget !== null}
          title="Delete favorite?"
          message={
            speedDialDeleteTarget
              ? `Remove “${speedDialDeleteTarget.label}” from speed dial?`
              : ""
          }
          confirmLabel="Delete"
          destructive
          onCancel={() => setSpeedDialDeleteTarget(null)}
          onConfirm={() => confirmDeleteSpeedDial()}
        />

        <SonosVolumeMixerModal
          open={sonosVolumeMixerOpen}
          speakers={speakers}
          selectedSpeakerIds={selectedSpeakers}
          fallbackVolumes={sonosVolumes}
          onClose={() => setSonosVolumeMixerOpen(false)}
          onSpeakerVolumeChange={setSonosSpeakerVolume}
          onSpeakersRefreshed={applySpeakerList}
          onToast={showToast}
        />

        <PickMusicSection
          authConnected={authConnected}
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
          radioDegreesOfSeparation={radioDegreesOfSeparation}
          onRadioDegreesOfSeparationChange={setRadioDegreesOfSeparation}
          onToast={showToast}
        />

        <section className="card playToCard">
          <details
            className="playToDetails"
            open={playToDetailsOpen}
            onToggle={(e) => setPlayToDetailsOpen(e.currentTarget.open)}
          >
            <summary className="playToSummary">
              <span className="playToSummaryText">
                <span className="sectionTitle">Play to</span>
                <span className="playToSummarySelection">{playToSummary}</span>
              </span>
              <IconChevronDown />
            </summary>
            <div className="playToBody">
              <label className="playToVolumeToggle">
                <input
                  type="checkbox"
                  checked={setVolumesOnPlay}
                  onChange={(event) => setSetVolumesOnPlay(event.target.checked)}
                />
                <span>Set volume on play</span>
              </label>
              {outputKind === "pioneer" ? (
                <>
                  <h3>Pioneer AVR</h3>
                  <div
                    className={`pickGrid${setVolumesOnPlay ? " pickGrid--volumeOnPlay" : ""}`}
                    role="group"
                    aria-label="Pioneer AV receiver"
                  >
                    <div className="pickGridCell">
                      <button
                        type="button"
                        className="pickGridBtn pickGridBtn--selected pickGridBtn--pinned"
                        aria-pressed={true}
                        tabIndex={-1}
                      >
                        {pioneerAvrLabel}
                      </button>
                      {setVolumesOnPlay ? (
                        <>
                          <button
                            type="button"
                            className="pickGridVolumeBtn"
                            aria-expanded={volumeEditor === "pioneer"}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => toggleVolumeEditor("pioneer")}
                          >
                            {pioneerVolume}%
                          </button>
                          {volumeEditor === "pioneer" ? (
                            <VolumeEditorPopover
                              title={pioneerAvrLabel}
                              value={pioneerVolume}
                              onChange={setPioneerVolume}
                              onClose={() => setVolumeEditor(null)}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h3>Sonos Speakers</h3>
                  <p className="hint playToSpeakersHint">
                    Leave unchecked if you want Plexamp without Sonos.
                  </p>
                  {speakers.length === 0 ? (
                    <p className="hint">No speakers yet — enter seed IPs under Setup when using Docker/VLAN.</p>
                  ) : (
                    <div
                      className={`pickGrid${setVolumesOnPlay ? " pickGrid--volumeOnPlay" : ""}`}
                      role="group"
                      aria-label="Sonos speakers"
                    >
                      {speakers.map((speaker) => {
                        const selected = selectedSpeakers.includes(speaker.id);
                        const volume = sonosVolumes[speaker.id] ?? DEFAULT_INITIAL_VOLUME;
                        const editorOpen = volumeEditor === speaker.id;
                        return (
                          <div key={speaker.id} className="pickGridCell">
                            <button
                              type="button"
                              className={`pickGridBtn${selected ? " pickGridBtn--selected" : ""}`}
                              aria-pressed={selected}
                              onClick={() => toggleSpeaker(speaker.id)}
                            >
                              {speaker.name}
                            </button>
                            {setVolumesOnPlay ? (
                              <>
                                <button
                                  type="button"
                                  className="pickGridVolumeBtn"
                                  aria-expanded={editorOpen}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={() => toggleVolumeEditor(speaker.id)}
                                >
                                  {volume}%
                                </button>
                                {editorOpen ? (
                                  <VolumeEditorPopover
                                    title={speaker.name}
                                    value={volume}
                                    onChange={(next) => setSonosSpeakerVolume(speaker.id, next)}
                                    onClose={() => setVolumeEditor(null)}
                                  />
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              <h3 className="playToPlayerHeading">Plexamp Player</h3>
              <p className="hint playToPlayerHint">Choose which Plexamp player plays the music.</p>
              {players.length === 0 ? (
                <p className="hint">Add Plexamp player in Setup.</p>
              ) : (
                <div className="pickGrid" role="group" aria-label="Plexamp players">
                  {players.map((player) => {
                    const selected = selectedPlayer === player.id;
                    return (
                      <button
                        key={player.id}
                        type="button"
                        className={`pickGridBtn${selected ? " pickGridBtn--selected" : ""}`}
                        aria-pressed={selected}
                        onClick={() => togglePlayer(player.id)}
                      >
                        {player.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </details>
        </section>

        <section className="card sticky">
          <div className="stickyActions">
            <button type="button" className="primary" onClick={() => runPlay().catch((error) => showToast(error.message))}>
              Start
            </button>
            <button type="button" onClick={() => saveSpeedDial().catch((error) => showToast(error.message))}>
              Add to speed dial
            </button>
          </div>
        </section>

        <section className="card speedDialCard">
          <div className="speedDialHeader">
            <h2 className="sectionTitle">Speed Dial</h2>
            {speedDial.length > 0 ? (
              <button
                type="button"
                className="smallBtn"
                aria-pressed={speedDialDeleteMode}
                onClick={() => setSpeedDialDeleteMode((current) => !current)}
              >
                {speedDialDeleteMode ? "Done" : "Edit"}
              </button>
            ) : null}
          </div>
          {speedDial.length === 0 ? <p>No favorites yet.</p> : null}
          {speedDial.length > 0 && (players.length > 0 || speakers.length > 0) ? (
            <details
              className="playToDetails speedDialFiltersDetails"
              open={speedDialFiltersOpen}
              onToggle={(event) => setSpeedDialFiltersOpen(event.currentTarget.open)}
            >
              <summary className="playToSummary speedDialFiltersSummary">
                <span className="playToSummaryText">
                  <span className="sectionTitle">Filters</span>
                  <span className="playToSummarySelection">{speedDialFilterSummary}</span>
                </span>
                <IconChevronDown />
              </summary>
              <div className="playToBody speedDialFiltersBody">
                {players.length > 0 ? (
                  <div className="speedDialFilterGroup">
                    <div className="speedDialFilterLabel">Players</div>
                    <div className="speedDialFilters" role="group" aria-label="Filter favorites by Plexamp player">
                      {players.map((player) => {
                        const selected = speedDialPlayerFilter === player.id;
                        return (
                          <button
                            key={player.id}
                            type="button"
                            className={`speedDialFilterPill${selected ? " speedDialFilterPill--selected" : ""}`}
                            aria-pressed={selected}
                            onClick={() => toggleSpeedDialPlayerFilter(player.id)}
                          >
                            {player.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {speakers.length > 0 ? (
                  <div className="speedDialFilterGroup speedDialFilterGroupSpeakers">
                    <div className="speedDialFilterLabel">Speakers</div>
                    <div className="speedDialFilters" role="group" aria-label="Filter favorites by Sonos speaker">
                      {speakers.map((speaker) => {
                        const selected = speedDialSpeakerFilter === speaker.id;
                        return (
                          <button
                            key={speaker.id}
                            type="button"
                            className={`speedDialFilterPill${selected ? " speedDialFilterPill--selected" : ""}`}
                            aria-pressed={selected}
                            onClick={() => toggleSpeedDialSpeakerFilter(speaker.id)}
                          >
                            {speaker.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
          {speedDial.length > 0 ? (
            <div
              className={`speedDialResults${
                filteredSpeedDial.length === 0 ? " speedDialResults--emptyFiltered" : ""
              }`}
            >
              {filteredSpeedDial.length === 0 ? (
                <p className="hint speedDialEmptyFilters">No favorites match the current filters.</p>
              ) : null}
              {speedDialDeleteMode && speedDial.length > 1 ? (
                <p className="hint speedDialReorderHint">
                  {canReorderSpeedDial
                    ? "Drag favorites to change their order."
                    : "Clear filters to reorder favorites."}
                </p>
              ) : null}
              <div className={`speedDialGrid${speedDialDeleteMode ? " speedDialGrid--deleteMode" : ""}`}>
                {filteredSpeedDial.map((favorite) => (
                  <SpeedDialFavoriteCard
                    key={favorite.id}
                    favorite={favorite}
                    editMode={speedDialDeleteMode}
                    playTarget={speedDialPlayTarget(favorite, players, speakers)}
                    players={players}
                    speakers={speakers}
                    webhookBaseUrl={webhookBaseUrl}
                    showWebhookLink={webhooksEnabled && !webhookLinksHidden}
                    reorder={
                      speedDialDeleteMode && canReorderSpeedDial
                        ? {
                            enabled: true,
                            dragging: dragFavoriteId === favorite.id,
                            dropTarget: dropFavoriteId === favorite.id,
                            onDragStart: (event) => handleFavoriteDragStart(favorite.id, event),
                            onDragEnd: handleFavoriteDragEnd,
                            onDragOver: (event) => handleFavoriteDragOver(favorite.id, event),
                            onDrop: (event) => handleFavoriteDrop(favorite.id, event),
                          }
                        : undefined
                    }
                    onPlay={() => playSpeedDialFavorite(favorite).catch((error) => showToast(error.message))}
                    onDelete={() =>
                      setSpeedDialDeleteTarget({
                        id: favorite.id,
                        label: speedDialDisplayLabel(favorite.label),
                      })
                    }
                    onPatch={patchSpeedDialFavorite}
                    onToast={showToast}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>

        </div>
      </div>

      <div className="controlRailDock">
        <aside className="controlRail" aria-label="Playback controls">
        {outputKind === "pioneer" ? (
          <fieldset className="controlFrameset">
            <legend>Receiver</legend>
            <p className="receiverStatusRow" aria-live="polite">
              {receiverStatusLine}
            </p>
            <div className="mediaToolbar mediaToolbarStack" role="group" aria-label="Pioneer AV receiver">
              <button
                type="button"
                className={`iconBtn${receiverPowerOn ? "" : " iconBtn--active"}`}
                aria-label={receiverPowerOn ? "Standby" : "Power on"}
                title={receiverPowerOn ? "Standby" : "Power on"}
                onClick={() => toggleReceiverPower().catch((e) => showToast(e.message))}
              >
                <IconPowerOff />
              </button>
              <button
                type="button"
                className="iconBtn"
                aria-label="Lower receiver volume"
                title="Volume down"
                onClick={() => adjustReceiverVolume(-5).catch((e) => showToast(e.message))}
              >
                <IconVolumeDown />
              </button>
              <button
                type="button"
                className="iconBtn"
                aria-label="Raise receiver volume"
                title="Volume up"
                onClick={() => adjustReceiverVolume(5).catch((e) => showToast(e.message))}
              >
                <IconVolumeUp />
              </button>
            </div>
          </fieldset>
        ) : outputKind === "sonos" || selectedSpeakers.length > 0 ? (
          <fieldset className="controlFrameset">
            <ControlFramesetLegend
              title="Sonos"
              appLink={{
                href: sonosAppHref(),
                label: "Open Sonos app",
                icon: <IconLaunchApp />,
                mobileOnly: true,
                onOpen: openSonosApp,
              }}
            />
            <div className="mediaToolbar mediaToolbarStack" role="group" aria-label="Sonos selected speakers">
              <button
                type="button"
                className="iconBtn"
                aria-label={sonosPlaying ? "Stop selected Sonos speakers" : "Play line-in on selected Sonos speakers"}
                title={sonosPlaying ? "Stop selected speakers" : "Play line-in on selected speakers"}
                onClick={() => toggleSonosLineInTransport().catch((e) => showToast(e.message))}
              >
                {sonosPlaying ? <IconStop /> : <IconPlay />}
              </button>
              <button
                type="button"
                className="iconBtn"
                aria-label="Lower volume on selected Sonos speakers"
                title="Volume down (selected speakers)"
                onClick={() => adjustSonosVolume(-5).catch((e) => showToast(e.message))}
              >
                <IconVolumeDown />
              </button>
              <button
                type="button"
                className="iconBtn"
                aria-label="Raise volume on selected Sonos speakers"
                title="Volume up (selected speakers)"
                onClick={() => adjustSonosVolume(5).catch((e) => showToast(e.message))}
              >
                <IconVolumeUp />
              </button>
              <button
                type="button"
                className="iconBtn"
                aria-label="Adjust all Sonos speaker volumes"
                title="All speaker volumes"
                onClick={() => setSonosVolumeMixerOpen(true)}
              >
                <IconList />
              </button>
            </div>
          </fieldset>
        ) : null}

        <fieldset className="controlFrameset">
          <ControlFramesetLegend
            title="Plexamp"
            appLink={
              isMobileAppClient()
                ? {
                    href: plexampAppHref(),
                    label: "Open Plexamp app",
                    icon: <IconLaunchApp />,
                    onOpen: openPlexampApp,
                  }
                : undefined
            }
          />
          <div className="mediaToolbar mediaToolbarStack" role="group" aria-label="Plexamp transport">
            <button
              type="button"
              className="iconBtn"
              aria-label={plexampPlaying ? "Pause Plexamp playback" : "Resume Plexamp playback"}
              title={
                plexampPlaying
                  ? "Pause Plexamp playback"
                  : "Resume playback on Plexamp (current queue; does not start a new queue)"
              }
              onClick={() => togglePlexampPlayPause().catch((e) => showToast(e.message))}
            >
              {plexampPlaying ? <IconPause /> : <IconPlay />}
            </button>
            <button
              type="button"
              className="iconBtn"
              aria-label="Previous track"
              title="Previous track"
              onClick={() => skipPreviousPlexamp().catch((e) => showToast(e.message))}
            >
              <IconSkipPrevious />
            </button>
            <button type="button" className="iconBtn" aria-label="Next track" title="Next track" onClick={() => skipNextPlexamp().catch((e) => showToast(e.message))}>
              <IconSkipNext />
            </button>
          </div>
        </fieldset>
        </aside>
      </div>
    </>
  );
}

export default App;
