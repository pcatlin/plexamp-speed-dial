const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export type MediaType = "playlist" | "album" | "artist" | "track" | "random_album";

export interface MediaItem {
  id: string;
  title: string;
  subtitle?: string;
  type: string;
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
}

export interface RuntimeSettings {
  plex_server_url: string;
  plex_ssl_verify: boolean;
  sonos_seed_ips: string;
  sonos_discover_timeout: number;
  sonos_allow_network_scan: boolean;
  sonos_interface_addr: string;
  sonos_demo_fallback: boolean;
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
  health: () => request<{ status: string }>("/health"),
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
  collections: () =>
    request<{ id: string; title: string }[]>(`/media/collections`),
  randomAlbum: (collectionId: string) => request<MediaItem>(`/media/random-album?collection_id=${encodeURIComponent(collectionId)}`),
  speakers: () => request<Speaker[]>("/sonos/speakers"),
  groupPresets: () => request<GroupPreset[]>("/sonos/group-presets"),
  createGroupPreset: (name: string, speakerIds: string[]) =>
    request<{ id: number }>("/sonos/group-presets", { method: "POST", body: JSON.stringify({ name, speaker_ids: speakerIds }) }),
  players: () => request<Player[]>("/players"),
  createPlayer: (payload: Omit<Player, "id">) => request<{ id: number }>("/players", { method: "POST", body: JSON.stringify(payload) }),
  deletePlayer: (id: number) => request<{ message: string }>(`/players/${id}`, { method: "DELETE" }),
  speedDial: () => request<SpeedDial[]>("/speed-dial"),
  createSpeedDial: (payload: Omit<SpeedDial, "id">) =>
    request<{ id: number }>("/speed-dial", { method: "POST", body: JSON.stringify(payload) }),
  deleteSpeedDial: (id: number) => request<{ message: string }>(`/speed-dial/${id}`, { method: "DELETE" }),
  play: (payload: {
    media_type: MediaType;
    media_id: string;
    player_id: number;
    speaker_ids: string[];
    preset_id?: number | null;
  }) => request<{ status: string; details: string }>("/play", { method: "POST", body: JSON.stringify(payload) }),
};
