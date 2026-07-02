import type { PickTab } from "./PickMusicSection";
import { parseArtistOrderMode, type ArtistOrderMode } from "./artistOrder";
import { RADIO_RANDOMNESS_STEPS } from "./radioRandomness";

const PICK_MUSIC_KEY = "plexamp-speed-dial.pickMusic";

const PICK_TABS: PickTab[] = ["playlist", "album", "artist", "track", "random_album"];

export type SavedMediaSelection = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
};

export type PickMusicState = {
  pickTab: PickTab;
  selectedMedia: SavedMediaSelection | null;
  selectedCollectionId: string;
  artistRadio: boolean;
  shufflePlaylist: boolean;
  artistOrderMode: ArtistOrderMode;
  radioDegreesOfSeparation: number;
};

const DEFAULT_PICK_MUSIC: PickMusicState = {
  pickTab: "playlist",
  selectedMedia: null,
  selectedCollectionId: "",
  artistRadio: true,
  shufflePlaylist: true,
  artistOrderMode: "album_order",
  radioDegreesOfSeparation: 1,
};

function parsePickTab(value: unknown): PickTab {
  if (typeof value === "string" && (PICK_TABS as string[]).includes(value)) {
    return value as PickTab;
  }
  return DEFAULT_PICK_MUSIC.pickTab;
}

function parseSelectedMedia(value: unknown): SavedMediaSelection | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  if (typeof record.type !== "string" || !record.type.trim()) return null;
  if (typeof record.title !== "string") return null;
  const subtitle = typeof record.subtitle === "string" ? record.subtitle : undefined;
  return { id: record.id, type: record.type, title: record.title, subtitle };
}

function parseRadioDegrees(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PICK_MUSIC.radioDegreesOfSeparation;
  }
  return (RADIO_RANDOMNESS_STEPS as readonly number[]).includes(value)
    ? value
    : DEFAULT_PICK_MUSIC.radioDegreesOfSeparation;
}

function parsePickMusicState(parsed: unknown): PickMusicState {
  if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PICK_MUSIC };
  const record = parsed as Record<string, unknown>;
  const selectedCollectionId =
    typeof record.selectedCollectionId === "string" ? record.selectedCollectionId : "";
  return {
    pickTab: parsePickTab(record.pickTab),
    selectedMedia: parseSelectedMedia(record.selectedMedia),
    selectedCollectionId,
    artistRadio: record.artistRadio !== false,
    shufflePlaylist: record.shufflePlaylist !== false,
    artistOrderMode: parseArtistOrderMode(record.artistOrderMode, record.shuffleArtist === true),
    radioDegreesOfSeparation: parseRadioDegrees(record.radioDegreesOfSeparation),
  };
}

export function loadPickMusicState(): PickMusicState {
  try {
    const raw = localStorage.getItem(PICK_MUSIC_KEY);
    if (!raw) return { ...DEFAULT_PICK_MUSIC };
    return parsePickMusicState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PICK_MUSIC };
  }
}

export function savePickMusicState(state: PickMusicState): void {
  try {
    localStorage.setItem(PICK_MUSIC_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

export function reconcileSelectedCollectionId(saved: string, collectionIds: Iterable<string>): string {
  if (!saved) return "";
  const allowed = new Set(collectionIds);
  return allowed.has(saved) ? saved : "";
}
