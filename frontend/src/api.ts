/** Same-origin `/api/v1` — Vite dev server proxies `/api` to uvicorn; Docker nginx proxies to the API service. */
export const API_BASE = "/api/v1";

export type MediaType = "playlist" | "album" | "artist" | "track" | "random_album";

export interface MediaItem {
  id: string;
  title: string;
  subtitle?: string;
  type: string;
}

export interface MediaSuggestions {
  most_played: MediaItem[];
  unplayed: MediaItem[];
  random: MediaItem[];
}

export interface Speaker {
  id: string;
  name: string;
  ip: string;
}

export interface GroupPreset {
  id: number;
  name: string;
  speaker_ids: string[];
}

export interface Player {
  id: number;
  name: string;
  host: string;
  port: number;
  is_active: boolean;
  /** Sonos speaker id from /sonos/speakers; empty = no line-in routing for this Plexamp. */
  sonos_line_in_speaker_id: string;
}

export interface RuntimeSettings {
  plex_server_url: string;
  plex_ssl_verify: boolean;
  sonos_seed_ips: string;
  sonos_discover_timeout: number;
  sonos_allow_network_scan: boolean;
  sonos_interface_addr: string;
  plex_server_url_effective: string;
}

/** Same fields as persisted to the API — omit computed effective URL when saving. */
export type RuntimeSettingsPayload = Omit<RuntimeSettings, "plex_server_url_effective">;

export interface SpeedDial {
  id: number;
  label: string;
  media_type: MediaType;
  media_id: string;
  player_id: number;
  speaker_ids: string[];
  preset_id?: number | null;
  /** Artist favorites only: true = radio, false = library only; omitted/null = radio when playing. */
  artist_radio?: boolean | null;
  /** Playlist / artist favorites: shuffle on play; omitted/null = false. */
  shuffle?: boolean | null;
  has_cover_art?: boolean;
}

/** Snapshot from ``/sonos/playback-state``, ``/plexamp/playback-state``, or the playback WebSocket. */
export interface PlaybackState {
  ok: boolean;
  playing: boolean | null;
  state?: string | null;
  error?: string | null;
}

/** Combined snapshot pushed by ``/playback-state/ws``. */
export interface PlaybackSnapshotMessage {
  sonos: PlaybackState;
  plexamp: PlaybackState;
}

/** WebSocket URL for combined Sonos + Plexamp playback snapshots (same host as REST). */
export function playbackStateWebSocketUrl(): string {
  if (typeof window === "undefined") return "";
  const { protocol, host } = window.location;
  const wsProto = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${host}${API_BASE}/playback-state/ws`;
}

function extractApiErrorDetail(bodyText: string, status: number): string {
  const raw = bodyText.trim();
  if (!raw) return `Request failed (${status})`;
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    const detail = parsed.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .filter((entry): entry is { msg?: string } => typeof entry === "object" && entry !== null && "msg" in entry)
        .map((entry) => entry.msg ?? "");
      const joined = msgs.filter(Boolean).join("; ");
      if (joined) return joined;
    }
  } catch {
    /* plain text response */
  }
  return raw;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(extractApiErrorDetail(errorText, response.status));
  }
  return response.json() as Promise<T>;
}

export const api = {
  runtimeSettings: () => request<RuntimeSettings>("/settings/runtime"),
  saveRuntimeSettings: (payload: RuntimeSettingsPayload) =>
    request<RuntimeSettings>("/settings/runtime", { method: "PUT", body: JSON.stringify(payload) }),
  authStatus: () => request<{ connected: boolean; username?: string }>("/auth/plex/status"),
  startAuth: () => request<{ pin_id: string; code: string; auth_url: string }>("/auth/plex/start", { method: "POST" }),
  pollPlexPin: (pinId: string) =>
    request<{ status: "pending" | "connected"; username?: string | null }>(`/auth/plex/pin/${encodeURIComponent(pinId)}`),
  plexServerTest: () =>
    request<{
      ok: boolean;
      configured_url: string;
      friendly_name?: string | null;
      music_library_sections: string[];
      ssl_verify_enabled: boolean;
      error_detail?: string | null;
    }>("/auth/plex/server-test"),
  completeAuth: (username = "owner") =>
    request<{ connected: boolean; username?: string }>("/auth/plex/complete", {
      method: "POST",
      body: JSON.stringify({ pin_id: "demo-pin-id", code: "1234", username }),
    }),
  media: (kind: "playlists" | "albums" | "artists" | "tracks") => request<MediaItem[]>(`/media/${kind}`),
  mediaSearch: (family: "album" | "artist" | "track", query: string) =>
    request<MediaItem[]>(
      `/media/search?family=${encodeURIComponent(family)}&query=${encodeURIComponent(query)}`,
    ),
  mediaSuggestions: (family: "album" | "artist" | "track") =>
    request<MediaSuggestions>(`/media/suggestions?family=${encodeURIComponent(family)}`),
  collections: () =>
    request<{ id: string; title: string }[]>(`/media/collections`),
  randomAlbum: (collectionId: string) => request<MediaItem>(`/media/random-album?collection_id=${encodeURIComponent(collectionId)}`),
  mediaTracksForParent: (family: "playlist" | "album" | "artist", parentId: string, limit = 50) =>
    request<MediaItem[]>(
      `/media/tracks-for-parent?family=${encodeURIComponent(family)}&parent_id=${encodeURIComponent(parentId)}&limit=${encodeURIComponent(String(limit))}`,
    ),
  speakers: () => request<Speaker[]>("/sonos/speakers"),
  groupPresets: () => request<GroupPreset[]>("/sonos/group-presets"),
  createGroupPreset: (name: string, speakerIds: string[]) =>
    request<{ id: number }>("/sonos/group-presets", { method: "POST", body: JSON.stringify({ name, speaker_ids: speakerIds }) }),
  players: () => request<Player[]>("/players"),
  createPlayer: (payload: Omit<Player, "id">) => request<{ id: number }>("/players", { method: "POST", body: JSON.stringify(payload) }),
  patchPlayer: (id: number, payload: { sonos_line_in_speaker_id: string }) =>
    request<Player>(`/players/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deletePlayer: (id: number) => request<{ message: string }>(`/players/${id}`, { method: "DELETE" }),
  speedDial: () => request<SpeedDial[]>("/speed-dial"),
  createSpeedDial: (payload: Omit<SpeedDial, "id" | "has_cover_art">) =>
    request<{ id: number }>("/speed-dial", { method: "POST", body: JSON.stringify(payload) }),
  deleteSpeedDial: (id: number) => request<{ message: string }>(`/speed-dial/${id}`, { method: "DELETE" }),
  speedDialPlay: (id: number) =>
    request<{ status: string; details: string }>(`/speed-dial/${id}/play`, { method: "POST" }),
  play: (payload: {
    media_type: MediaType;
    media_id: string;
    player_id: number;
    speaker_ids: string[];
    preset_id?: number | null;
    artist_radio?: boolean;
    shuffle?: boolean;
  }) => request<{ status: string; details: string }>("/play", { method: "POST", body: JSON.stringify(payload) }),
  plexampSkipNext: (playerId: number) =>
    request<{ status: string; details: string }>("/plexamp/skip-next", {
      method: "POST",
      body: JSON.stringify({ player_id: playerId }),
    }),
  plexampSkipPrevious: (playerId: number) =>
    request<{ status: string; details: string }>("/plexamp/skip-previous", {
      method: "POST",
      body: JSON.stringify({ player_id: playerId }),
    }),
  plexampPause: (playerId: number) =>
    request<{ status: string; details: string }>("/plexamp/pause", {
      method: "POST",
      body: JSON.stringify({ player_id: playerId }),
    }),
  plexampResume: (playerId: number) =>
    request<{ status: string; details: string }>("/plexamp/resume", {
      method: "POST",
      body: JSON.stringify({ player_id: playerId }),
    }),
  sonosStop: (speakerIds: string[]) =>
    request<{ status: string; details: string }>("/sonos/stop", {
      method: "POST",
      body: JSON.stringify({ speaker_ids: speakerIds }),
    }),
  sonosPlayLineIn: (speakerIds: string[], playerId: number) =>
    request<{ status: string; details: string }>("/sonos/play-line-in", {
      method: "POST",
      body: JSON.stringify({ speaker_ids: speakerIds, player_id: playerId }),
    }),
  sonosVolumeAdjust: (speakerIds: string[], delta: number) =>
    request<{ status: string; details: string }>("/sonos/volume", {
      method: "POST",
      body: JSON.stringify({ speaker_ids: speakerIds, delta }),
    }),
};
