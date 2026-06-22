export const DEFAULT_INITIAL_VOLUME = 20;

export interface InitialVolumes {
  sonos?: Record<string, number>;
  pioneer?: number;
}

export function defaultSonosVolumes(speakerIds: string[]): Record<string, number> {
  return Object.fromEntries(speakerIds.map((id) => [id, DEFAULT_INITIAL_VOLUME]));
}

export function mergeSonosVolumes(
  speakerIds: string[],
  current: Record<string, number>,
): Record<string, number> {
  const next = { ...current };
  for (const id of speakerIds) {
    if (next[id] === undefined) next[id] = DEFAULT_INITIAL_VOLUME;
  }
  return next;
}

export function buildInitialVolumes(options: {
  selectedSpeakerIds: string[];
  sonosVolumes: Record<string, number>;
  pioneerVolume: number;
  includePioneer: boolean;
}): InitialVolumes | undefined {
  const sonos: Record<string, number> = {};
  for (const id of options.selectedSpeakerIds) {
    sonos[id] = options.sonosVolumes[id] ?? DEFAULT_INITIAL_VOLUME;
  }
  const volumes: InitialVolumes = {};
  if (Object.keys(sonos).length > 0) volumes.sonos = sonos;
  if (options.includePioneer) volumes.pioneer = options.pioneerVolume;
  if (!volumes.sonos && volumes.pioneer === undefined) return undefined;
  return volumes;
}
