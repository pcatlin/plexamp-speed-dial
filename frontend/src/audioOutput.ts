import type { AudioOutput, AudioOutputKind, Player } from "./api";

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

export function pioneerHostFromOutput(output: AudioOutput): string {
  if (output.kind !== "pioneer") return "";
  return String(output.config.host ?? "").trim();
}

export function pioneerInputCodeFromOutput(output: AudioOutput): string {
  if (output.kind !== "pioneer") return PIONEER_INPUT_PRESETS[0]?.code ?? "10";
  const raw = String(output.config.input_code ?? "").trim().toUpperCase();
  const code = LEGACY_PIONEER_INPUT_CODES[raw] ?? raw;
  if (PIONEER_INPUT_PRESETS.some((p) => p.code === code)) return code;
  return code || "10";
}

export function pioneerPortFromOutput(output: AudioOutput): number {
  if (output.kind !== "pioneer") return PIONEER_DEFAULT_ISCP_PORT;
  const port = Number(output.config.port);
  return Number.isFinite(port) && port > 0 ? port : PIONEER_DEFAULT_ISCP_PORT;
}

/** Host field value — includes `:port` only when not the default ISCP port. */
export function pioneerHostFieldFromOutput(output: AudioOutput): string {
  const host = pioneerHostFromOutput(output);
  if (!host) return "";
  const port = pioneerPortFromOutput(output);
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
  const hit = PIONEER_INPUT_PRESETS.find((p) => p.code === code.toUpperCase());
  return hit?.label ?? `Custom (${code})`;
}

export function audioOutputsEqual(a: AudioOutput, b: AudioOutput): boolean {
  if (a.kind !== b.kind) return false;
  const aConfig = a.config ?? {};
  const bConfig = b.config ?? {};
  const keys = new Set([...Object.keys(aConfig), ...Object.keys(bConfig)]);
  for (const key of keys) {
    if (String(aConfig[key] ?? "") !== String(bConfig[key] ?? "")) return false;
  }
  return true;
}

export function buildAudioOutput(
  kind: AudioOutputKind,
  sonosSpeakerId: string,
  pioneerHost: string,
  pioneerInputCode: string,
  pioneerPort: number,
): AudioOutput {
  if (kind === "sonos") {
    return { kind, config: { speaker_id: sonosSpeakerId.trim() } };
  }
  if (kind === "pioneer") {
    return {
      kind,
      config: {
        host: pioneerHost.trim(),
        input_code: pioneerInputCode.trim().toUpperCase(),
        port: pioneerPort,
      },
    };
  }
  return { kind: "none", config: {} };
}
