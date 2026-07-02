const SPEED_DIAL_FILTERS_KEY = "plexamp-speed-dial.speedDialFilters";

export type SpeedDialFilters = {
  playerId: number | null;
  speakerId: string | null;
};

export function loadSpeedDialFilters(): SpeedDialFilters {
  try {
    const raw = localStorage.getItem(SPEED_DIAL_FILTERS_KEY);
    if (!raw) return { playerId: null, speakerId: null };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { playerId: null, speakerId: null };
    const record = parsed as { playerId?: unknown; speakerId?: unknown };
    const playerId =
      typeof record.playerId === "number" && Number.isFinite(record.playerId) ? record.playerId : null;
    const speakerId =
      typeof record.speakerId === "string" && record.speakerId.trim().length > 0 ? record.speakerId : null;
    return { playerId, speakerId };
  } catch {
    return { playerId: null, speakerId: null };
  }
}

export function saveSpeedDialFilters(filters: SpeedDialFilters): void {
  try {
    localStorage.setItem(SPEED_DIAL_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    /* storage unavailable */
  }
}

export function reconcileSpeedDialFilters(
  filters: SpeedDialFilters,
  playerIds: Iterable<number>,
  speakerIds: Iterable<string>,
): SpeedDialFilters {
  const allowedPlayers = new Set(playerIds);
  const allowedSpeakers = new Set(speakerIds);
  return {
    playerId: filters.playerId !== null && allowedPlayers.has(filters.playerId) ? filters.playerId : null,
    speakerId: filters.speakerId !== null && allowedSpeakers.has(filters.speakerId) ? filters.speakerId : null,
  };
}
