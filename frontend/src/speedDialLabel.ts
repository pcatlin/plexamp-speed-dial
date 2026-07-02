import type { InitialVolumes } from "./initialVolumes";

export function speedDialDisplayLabel(label: string): string {
  return label;
}

export function buildSpeedDialLabel(
  title: string,
  options: {
    radio?: boolean;
    shuffle?: boolean;
    artistOrderMode?: "shuffle" | "album_order" | "popular_order" | "popular_tracks_order";
  },
): string {
  let label = title.trim();
  if (options.radio) label += " (radio)";
  if (options.artistOrderMode === "album_order") label += " (album order)";
  else if (options.artistOrderMode === "popular_order") label += " (user ratings)";
  else if (options.artistOrderMode === "popular_tracks_order") label += " (popular tracks)";
  else if (options.shuffle) label += " (shuffle)";
  return label;
}

export function formatSpeedDialPlayTarget(options: {
  speakerIds: string[];
  initialVolumes?: InitialVolumes | null;
  isPioneer: boolean;
  pioneerLabel: string;
  speakers: Array<{ id: string; name: string }>;
}): string {
  const { speakerIds, initialVolumes, isPioneer, pioneerLabel, speakers } = options;

  if (isPioneer) {
    if (initialVolumes?.pioneer != null) {
      return `${pioneerLabel} (${initialVolumes.pioneer}%)`;
    }
    return pioneerLabel;
  }

  const selected = speakers.filter((speaker) => speakerIds.includes(speaker.id));
  if (selected.length === 0) return "No speakers";

  const sonosVolumes = initialVolumes?.sonos;
  if (sonosVolumes && Object.keys(sonosVolumes).length > 0) {
    return selected
      .map((speaker) => {
        const volume = sonosVolumes[speaker.id];
        return volume != null ? `${speaker.name} (${volume}%)` : speaker.name;
      })
      .join(", ");
  }

  return selected.map((speaker) => speaker.name).join(", ");
}
