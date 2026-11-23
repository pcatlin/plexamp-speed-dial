import type { Amp, AudioOutput, AudioOutputKind, Player } from "./api";

/** VSX-LX505 factory Input Assign: BD/DVD→HDMI1, GAME→HDMI2, CBL/SAT→HDMI3, STRM BOX→HDMI4. */
export const PIONEER_INPUT_PRESETS: { label: string; code: string }[] = [
  { label: "HDMI 1 (BD/DVD)", code: "10" },
  { label: "HDMI 2 (GAME)", code: "02" },
  { label: "HDMI 3 (CBL/SAT)", code: "01" },
  { label: "HDMI 4 (STRM BOX)", code: "11" },
  { label: "HDMI 5", code: "55" },
  { label: "HDMI 6", code: "56" },
  { label: "Network / NET", code: "2B" },
  { label: "TV", code: "12" },
  { label: "CD", code: "23" },
  { label: "Phono", code: "22" },
];

/** Earlier builds used incorrect ISCP codes for HDMI presets; remap saved configs. "23" is CD — do not remap. */
const LEGACY_PIONEER_INPUT_CODES: Record<string, string> = {
  "12": "10",
  "22": "02",
  "24": "11",
  "42": "22",
  "44": "23",
};

export const AUDIO_OUTPUT_KINDS: { id: AudioOutputKind; label: string }[] = [
  { id: "none", label: "None" },
  { id: "sonos", label: "Sonos line-in" },
  { id: "pioneer", label: "Pioneer AVR" },
];

export const PIONEER_DEFAULT_ISCP_PORT = 60128;

export function defaultAudioOutput(): AudioOutput {
  return { kind: "none", config: {} };
}

export function outputKindForPlayer(player: Player | undefined): AudioOutputKind {
  return player?.audio_output?.kind ?? "none";
}

export function favoriteMatchesSpeakerFilter(
  favorite: { player_id: number; speaker_ids: string[] },
  speakerId: string,
  players: Player[],
): boolean {
  const player = players.find((row) => row.id === favorite.player_id);
  if (outputKindForPlayer(player) === "pioneer") return false;
  return favorite.speaker_ids.includes(speakerId);
}

export function sonosSpeakerIdFromOutput(output: AudioOutput): string {
  if (output.kind !== "sonos") return "";
  return String(output.config.speaker_id ?? "").trim();
}

export function pioneerAmpIdFromOutput(output: AudioOutput): number | null {
  if (output.kind !== "pioneer") return null;
  const raw = output.config.amp_id;
  const id = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(id) && id >= 1 ? id : null;
}

/** Prefer linked amp name, else player display name, else generic AVR label. */
export function pioneerLabelForPlayer(player: Player | undefined, amps: Amp[] = []): string {
  const ampId = pioneerAmpIdFromOutput(player?.audio_output ?? { kind: "none", config: {} });
  if (ampId != null) {
    const amp = amps.find((row) => row.id === ampId);
    const ampName = (amp?.name ?? "").trim();
    if (ampName) return ampName;
    const host = ampHostField(amp).trim();
    if (host) return host;
  }
  const name = (player?.name ?? "").trim();
  if (name) return name;
  return "Pioneer AVR";
}

export function normalizePioneerInputCode(raw: string): string {
  const code = (LEGACY_PIONEER_INPUT_CODES[raw.trim().toUpperCase()] ?? raw.trim().toUpperCase()) || "10";
  return code;
}

export function ampHostField(amp: { host?: string; port?: number } | null | undefined): string {
  const host = (amp?.host ?? "").trim();
  if (!host) return "";
  const port = amp?.port ?? PIONEER_DEFAULT_ISCP_PORT;
  if (port !== PIONEER_DEFAULT_ISCP_PORT) return `${host}:${port}`;
  return host;
}

export function parsePioneerHostField(raw: string): { host: string; port: number } {
  const s = raw.trim();
  if (!s) return { host: "", port: PIONEER_DEFAULT_ISCP_PORT };

  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      const host = url.hostname;
      if (!host) return { host: "", port: PIONEER_DEFAULT_ISCP_PORT };
      const port = url.port ? Number.parseInt(url.port, 10) : PIONEER_DEFAULT_ISCP_PORT;
      return {
        host,
        port: Number.isFinite(port) && port > 0 ? port : PIONEER_DEFAULT_ISCP_PORT,
      };
    } catch {
      return { host: s, port: PIONEER_DEFAULT_ISCP_PORT };
    }
  }

  const first = s.split(/[/\s]/)[0] ?? "";
  if (first.includes(":")) {
    const colon = first.lastIndexOf(":");
    const maybeHost = first.slice(0, colon).trim();
    const portStr = first.slice(colon + 1);
    if (!portStr) {
      return { host: maybeHost, port: PIONEER_DEFAULT_ISCP_PORT };
    }
    const port = Number.parseInt(portStr, 10);
    if (maybeHost && Number.isFinite(port) && port > 0 && port < 65536) {
      return { host: maybeHost, port };
    }
  }

  return { host: first, port: PIONEER_DEFAULT_ISCP_PORT };
}

export function presetLabelForCode(code: string): string {
  const normalized = normalizePioneerInputCode(code);
  const hit = PIONEER_INPUT_PRESETS.find((p) => p.code === normalized);
  return hit?.label ?? `Custom (${normalized})`;
}

export function audioOutputsEqual(a: AudioOutput, b: AudioOutput): boolean {
  if (a.kind !== b.kind) return false;
  const aConfig = a.config ?? {};
  const bConfig = b.config ?? {};
  const keys = new Set([...Object.keys(aConfig), ...Object.keys(bConfig)]);
  for (const key of keys) {
    // Ignore legacy pioneer fields — amp_id is the source of truth.
    if (key === "display_name" || key === "host" || key === "port" || key === "input_code") continue;
    if (String(aConfig[key] ?? "") !== String(bConfig[key] ?? "")) return false;
  }
  return true;
}

export function buildAudioOutput(
  kind: AudioOutputKind,
  sonosSpeakerId: string,
  pioneerAmpId: number | null = null,
): AudioOutput {
  if (kind === "sonos") {
    return { kind, config: { speaker_id: sonosSpeakerId.trim() } };
  }
  if (kind === "pioneer") {
    if (pioneerAmpId == null || pioneerAmpId < 1) {
      return { kind, config: {} };
    }
    return { kind, config: { amp_id: pioneerAmpId } };
  }
  return { kind: "none", config: {} };
}
