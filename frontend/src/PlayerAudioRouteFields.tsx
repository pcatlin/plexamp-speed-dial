import { useMemo } from "react";
import type { Amp, AudioOutput, AudioOutputKind, Speaker } from "./api";
import {
  AUDIO_OUTPUT_KINDS,
  buildAudioOutput,
  defaultAudioOutput,
  pioneerAmpIdFromOutput,
  sonosSpeakerIdFromOutput,
} from "./audioOutput";

type Props = {
  value: AudioOutput;
  /** Update local draft (e.g. while typing). */
  onChange: (next: AudioOutput) => void;
  /** Persist draft to server; omit for forms that save on explicit action. */
  onCommit?: (next: AudioOutput) => void;
  sonosSpeakers: Speaker[];
  amps: Amp[];
  disabled?: boolean;
  idPrefix: string;
};

export function PlayerAudioRouteFields({
  value,
  onChange,
  onCommit,
  sonosSpeakers,
  amps,
  disabled,
  idPrefix,
}: Props) {
  const kind = value.kind ?? "none";
  const sonosId = sonosSpeakerIdFromOutput(value);
  const ampId = pioneerAmpIdFromOutput(value);

  const emitCommit = (nextKind: AudioOutputKind, nextSonosId: string, nextAmpId: number | null) => {
    const next = buildAudioOutput(nextKind, nextSonosId, nextAmpId);
    onChange(next);
    onCommit?.(next);
  };

  const kindName = useMemo(() => `${idPrefix}-route`, [idPrefix]);

  return (
    <div className="audioRouteBlock">
      <fieldset className="audioRouteKinds" disabled={disabled}>
        <legend className="srOnly">Audio output route</legend>
        {AUDIO_OUTPUT_KINDS.map((opt) => (
          <label key={opt.id} className="audioRouteKindOption">
            <input
              type="radio"
              name={kindName}
              value={opt.id}
              checked={kind === opt.id}
              onChange={() => emitCommit(opt.id, sonosId, ampId)}
            />
            {opt.label}
          </label>
        ))}
      </fieldset>

      {kind === "sonos" ? (
        <label className="fieldLabel mb0">
          Line-in Sonos speaker
          <select
            className="textInput"
            value={sonosId}
            disabled={disabled}
            onChange={(e) => emitCommit("sonos", e.target.value, ampId)}
          >
            <option value="">Select speaker…</option>
            {sonosSpeakers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {kind === "pioneer" ? (
        <label className="fieldLabel mb0">
          Amp
          <select
            className="textInput"
            value={ampId != null ? String(ampId) : ""}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value;
              const nextId = raw ? Number.parseInt(raw, 10) : null;
              emitCommit("pioneer", sonosId, Number.isFinite(nextId) ? nextId : null);
            }}
          >
            <option value="">Select amp…</option>
            {amps.map((amp) => (
              <option key={amp.id} value={amp.id}>
                {amp.name}
              </option>
            ))}
          </select>
          {amps.length === 0 ? (
            <span className="hint subtle">Add an amp under Setup → Amps first.</span>
          ) : null}
        </label>
      ) : null}

      {kind === "none" ? <p className="hint subtle">Player only — no Sonos or AVR routing on play.</p> : null}
    </div>
  );
}

export function audioOutputFromPlayer(player: { audio_output?: AudioOutput }): AudioOutput {
  return player.audio_output ?? defaultAudioOutput();
}
