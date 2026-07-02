const SECTION_EXPANDED_KEY = "plexamp-speed-dial.sectionExpanded";

export type SectionExpandedState = {
  pickMusic: boolean;
  playTo: boolean;
  speedDialFilters: boolean;
};

function parseSectionExpanded(parsed: unknown): Partial<SectionExpandedState> {
  if (!parsed || typeof parsed !== "object") return {};
  const record = parsed as Record<string, unknown>;
  const result: Partial<SectionExpandedState> = {};
  if (typeof record.pickMusic === "boolean") result.pickMusic = record.pickMusic;
  if (typeof record.playTo === "boolean") result.playTo = record.playTo;
  if (typeof record.speedDialFilters === "boolean") result.speedDialFilters = record.speedDialFilters;
  return result;
}

export function loadSectionExpanded(): Partial<SectionExpandedState> {
  try {
    const raw = localStorage.getItem(SECTION_EXPANDED_KEY);
    if (!raw) return {};
    return parseSectionExpanded(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveSectionExpanded(state: SectionExpandedState): void {
  try {
    localStorage.setItem(SECTION_EXPANDED_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}
