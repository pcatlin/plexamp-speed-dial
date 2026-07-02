import { DEFAULT_INITIAL_VOLUME } from "./initialVolumes";

const PLAY_TO_KEY = "plexamp-speed-dial.playTo";
const LEGACY_SPEAKERS_KEY = "plexamp-speed-dial.selectedSpeakerIds";

export type PlayToState = {
  speakerIds: string[];
  playerId: number | null;
  setVolumesOnPlay: boolean;
  sonosVolumes: Record<string, number>;
  pioneerVolume: number;
};

const DEFAULT_PLAY_TO: PlayToState = {
  speakerIds: [],
  playerId: null,
  setVolumesOnPlay: false,
  sonosVolumes: {},
  pioneerVolume: DEFAULT_INITIAL_VOLUME,
};

function clampVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_INITIAL_VOLUME;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseSpeakerIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function parseSonosVolumes(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const volumes: Record<string, number> = {};
  for (const [key, vol] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== "string" || !key.trim()) continue;
    volumes[key] = clampVolume(vol);
  }
  return volumes;
}

function parsePlayToState(parsed: unknown): PlayToState {
  if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PLAY_TO };
  const record = parsed as Record<string, unknown>;
  const playerId =
    typeof record.playerId === "number" && Number.isFinite(record.playerId) ? record.playerId : null;
  return {
    speakerIds: parseSpeakerIds(record.speakerIds),
    playerId,
    setVolumesOnPlay: record.setVolumesOnPlay === true,
    sonosVolumes: parseSonosVolumes(record.sonosVolumes),
    pioneerVolume: clampVolume(record.pioneerVolume),
  };
}

export function loadPlayToState(): PlayToState {
  try {
    const raw = localStorage.getItem(PLAY_TO_KEY);
    if (raw) return parsePlayToState(JSON.parse(raw));

    const legacyRaw = localStorage.getItem(LEGACY_SPEAKERS_KEY);
    if (!legacyRaw) return { ...DEFAULT_PLAY_TO };
    const legacyIds = parseSpeakerIds(JSON.parse(legacyRaw));
    return { ...DEFAULT_PLAY_TO, speakerIds: legacyIds };
  } catch {
    return { ...DEFAULT_PLAY_TO };
  }
}

export function savePlayToState(state: PlayToState): void {
  try {
    localStorage.setItem(PLAY_TO_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

/** @deprecated Use loadPlayToState().speakerIds */
export function loadSelectedSpeakerIds(): string[] {
  return loadPlayToState().speakerIds;
}

/** @deprecated Use savePlayToState */
export function saveSelectedSpeakerIds(ids: string[]): void {
  savePlayToState({ ...loadPlayToState(), speakerIds: ids });
}

/** Keep only ids that still exist in the latest Sonos discovery list. */
export function reconcileSelectedSpeakerIds(saved: string[], availableIds: Iterable<string>): string[] {
  const allowed = new Set(availableIds);
  return saved.filter((id) => allowed.has(id));
}

export function reconcilePlayToState(
  state: PlayToState,
  playerIds: Iterable<number>,
  speakerIds: Iterable<string>,
): PlayToState {
  const allowedPlayers = new Set(playerIds);
  const allowedSpeakers = new Set(speakerIds);
  const reconciledSpeakerIds = reconcileSelectedSpeakerIds(state.speakerIds, allowedSpeakers);
  const sonosVolumes: Record<string, number> = {};
  for (const id of reconciledSpeakerIds) {
    if (state.sonosVolumes[id] !== undefined) {
      sonosVolumes[id] = state.sonosVolumes[id];
    }
  }
  return {
    ...state,
    speakerIds: reconciledSpeakerIds,
    playerId: state.playerId !== null && allowedPlayers.has(state.playerId) ? state.playerId : null,
    sonosVolumes,
  };
}
