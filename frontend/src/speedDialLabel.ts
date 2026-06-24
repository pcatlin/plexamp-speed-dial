import type { InitialVolumes } from "./initialVolumes";

export function speedDialDisplayLabel(label: string): string {
  return label;
}

export function buildSpeedDialLabel(
  title: string,
  options: { radio?: boolean; shuffle?: boolean },
): string {
  let label = title.trim();
  if (options.radio) label += " (radio)";
  if (options.shuffle) label += " (shuffle)";
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
