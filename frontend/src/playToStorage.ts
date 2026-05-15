const SELECTED_SPEAKERS_KEY = "plexamp-speed-dial.selectedSpeakerIds";

export function loadSelectedSpeakerIds(): string[] {
  try {
    const raw = localStorage.getItem(SELECTED_SPEAKERS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveSelectedSpeakerIds(ids: string[]): void {
  try {
    localStorage.setItem(SELECTED_SPEAKERS_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

/** Keep only ids that still exist in the latest Sonos discovery list. */
export function reconcileSelectedSpeakerIds(saved: string[], availableIds: Iterable<string>): string[] {
  const allowed = new Set(availableIds);
  return saved.filter((id) => allowed.has(id));
}
