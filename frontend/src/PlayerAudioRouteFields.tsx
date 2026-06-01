import { useMemo, useState } from "react";
import type { AudioOutput, AudioOutputKind, Speaker } from "./api";
import {
  AUDIO_OUTPUT_KINDS,
  PIONEER_INPUT_PRESETS,
  buildAudioOutput,
  defaultAudioOutput,
  pioneerHostFromOutput,
  pioneerInputCodeFromOutput,
  pioneerPortFromOutput,
  presetLabelForCode,
  sonosSpeakerIdFromOutput,
} from "./audioOutput";

type Props = {
  value: AudioOutput;
  onChange: (next: AudioOutput) => void;
  sonosSpeakers: Speaker[];
  disabled?: boolean;
  idPrefix: string;
  onTest?: () => void | Promise<void>;
  testBusy?: boolean;
};

export function PlayerAudioRouteFields({
  value,
  onChange,
  sonosSpeakers,
  disabled,
  idPrefix,
  onTest,
  testBusy,
}: Props) {
  const kind = value.kind ?? "none";
  const [customInput, setCustomInput] = useState(false);

  const inputCode = pioneerInputCodeFromOutput(value);
  const presetMatch = PIONEER_INPUT_PRESETS.some((p) => p.code === inputCode);
  const selectInputValue = customInput || !presetMatch ? "__custom__" : inputCode;

  const emit = (
    nextKind: AudioOutputKind,
    sonosId: string,
    host: string,
    code: string,
    port: number,
  ) => {
    onChange(buildAudioOutput(nextKind, sonosId, host, code, port));
  };

  const sonosId = sonosSpeakerIdFromOutput(value);
  const host = pioneerHostFromOutput(value);
  const port = pioneerPortFromOutput(value);

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
              onChange={() => emit(opt.id, sonosId, host, inputCode, port)}
            />
            {opt.label}
          </label>
        ))}
      </fieldset>

      {kind === "sonos" ? (
        <label className="fieldLabel mb0 stretch">
          Line-in Sonos speaker
          <select
            className="textInput"
            value={sonosId}
            disabled={disabled}
            onChange={(e) => emit("sonos", e.target.value, host, inputCode, port)}
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
        <div className="audioRoutePioneerFields">
          <label className="fieldLabel mb0 stretch">
            Receiver IP or hostname
            <input
              type="text"
              className="textInput"
              placeholder="192.168.1.50"
              value={host}
              disabled={disabled}
              onChange={(e) => emit("pioneer", sonosId, e.target.value, inputCode, port)}
            />
          </label>
          <label className="fieldLabel mb0 stretch">
            Input
            <select
              className="textInput"
              value={selectInputValue}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") {
                  setCustomInput(true);
                  return;
                }
                setCustomInput(false);
                emit("pioneer", sonosId, host, v, port);
              }}
            >
              {PIONEER_INPUT_PRESETS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
              <option value="__custom__">Custom code…</option>
            </select>
          </label>
          {selectInputValue === "__custom__" ? (
            <label className="fieldLabel mb0 stretch">
              ISCP input code (2 chars, e.g. 22)
              <input
                type="text"
                className="textInput narrow"
                maxLength={2}
                value={inputCode}
                disabled={disabled}
                onChange={(e) => emit("pioneer", sonosId, host, e.target.value.toUpperCase(), port)}
              />
            </label>
          ) : (
            <p className="hint subtle">
              Selected: {presetLabelForCode(inputCode)} (SLI{inputCode}). HDMI 1–4 match VSX-LX505 factory Input
              Assign; change codes if you reassigned jacks on the receiver.
            </p>
          )}
          <label className="fieldLabel mb0 narrow">
            ISCP port
            <input
              type="number"
              className="textInput narrow"
              min={1}
              max={65535}
              value={port}
              disabled={disabled}
              onChange={(e) => emit("pioneer", sonosId, host, inputCode, Number(e.target.value) || 60128)}
            />
          </label>
          {onTest ? (
            <button type="button" className="nowrap" disabled={disabled || testBusy} onClick={() => void onTest()}>
              {testBusy ? "Testing…" : "Test receiver"}
            </button>
          ) : null}
        </div>
      ) : null}

      {kind === "none" ? <p className="hint subtle">Plexamp only — no Sonos or AVR routing on play.</p> : null}
    </div>
  );
}

export function audioOutputFromPlayer(player: { audio_output?: AudioOutput }): AudioOutput {
  return player.audio_output ?? defaultAudioOutput();
}
