import { useEffect, useMemo, useState } from "react";
import type { AudioOutput, AudioOutputKind, Speaker } from "./api";
import {
  AUDIO_OUTPUT_KINDS,
  PIONEER_INPUT_PRESETS,
  buildAudioOutput,
  defaultAudioOutput,
  parsePioneerHostField,
  pioneerHostFieldFromOutput,
  pioneerInputCodeFromOutput,
  pioneerPortFromOutput,
  sonosSpeakerIdFromOutput,
} from "./audioOutput";

type Props = {
  value: AudioOutput;
  /** Update local draft (e.g. while typing). */
  onChange: (next: AudioOutput) => void;
  /** Persist draft to server; omit for forms that save on explicit action. */
  onCommit?: (next: AudioOutput) => void;
  sonosSpeakers: Speaker[];
  disabled?: boolean;
  idPrefix: string;
  onTest?: () => void | Promise<void>;
  testBusy?: boolean;
};

export function PlayerAudioRouteFields({
  value,
  onChange,
  onCommit,
  sonosSpeakers,
  disabled,
  idPrefix,
  onTest,
  testBusy,
}: Props) {
  const kind = value.kind ?? "none";
  const [customInput, setCustomInput] = useState(false);
  const [hostInput, setHostInput] = useState(() => pioneerHostFieldFromOutput(value));

  const inputCode = pioneerInputCodeFromOutput(value);
  const presetMatch = PIONEER_INPUT_PRESETS.some((p) => p.code === inputCode);
  const selectInputValue = customInput || !presetMatch ? "__custom__" : inputCode;

  useEffect(() => {
    if (value.kind === "pioneer") {
      setHostInput(pioneerHostFieldFromOutput(value));
    }
  }, [idPrefix, value.kind, value.config?.host, value.config?.port, value.config?.input_code]);

  const build = (
    nextKind: AudioOutputKind,
    sonosId: string,
    host: string,
    code: string,
    port: number,
  ) => buildAudioOutput(nextKind, sonosId, host, code, port);

  const pioneerConnection = useMemo(() => parsePioneerHostField(hostInput), [hostInput]);

  const commitPioneerHost = () => {
    const { host, port } = parsePioneerHostField(hostInput);
    const next = build("pioneer", sonosId, host, inputCode, port);
    onChange(next);
    onCommit?.(next);
    setHostInput(pioneerHostFieldFromOutput(next));
  };

  const emitDraft = (
    nextKind: AudioOutputKind,
    sonosId: string,
    host: string,
    code: string,
    port: number,
  ) => {
    onChange(build(nextKind, sonosId, host, code, port));
  };

  const emitCommit = (
    nextKind: AudioOutputKind,
    sonosId: string,
    host: string,
    code: string,
    port: number,
  ) => {
    const next = build(nextKind, sonosId, host, code, port);
    onChange(next);
    onCommit?.(next);
  };

  const sonosId = sonosSpeakerIdFromOutput(value);
  const storedHost = pioneerConnection.host;
  const storedPort = kind === "pioneer" ? pioneerConnection.port : pioneerPortFromOutput(value);

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
              onChange={() => emitCommit(opt.id, sonosId, storedHost, inputCode, storedPort)}
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
            onChange={(e) => emitCommit("sonos", e.target.value, storedHost, inputCode, storedPort)}
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
          <label className="fieldLabel mb0 audioRoutePioneerHost">
            Receiver IP or hostname
            <input
              type="text"
              className="textInput"
              placeholder="192.168.1.50 or hostname:60128"
              value={hostInput}
              disabled={disabled}
              onChange={(e) => setHostInput(e.target.value)}
              onBlur={() => commitPioneerHost()}
            />
          </label>
          <label className="fieldLabel mb0 audioRoutePioneerInput">
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
                emitCommit("pioneer", sonosId, storedHost, v, storedPort);
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
            <label className="fieldLabel mb0 audioRoutePioneerCustom">
              ISCP input code (2 chars, e.g. 22)
              <input
                type="text"
                className="textInput narrow"
                maxLength={2}
                value={inputCode}
                disabled={disabled}
                onChange={(e) => emitDraft("pioneer", sonosId, storedHost, e.target.value.toUpperCase(), storedPort)}
                onBlur={(e) =>
                  onCommit?.(build("pioneer", sonosId, storedHost, e.target.value.toUpperCase(), storedPort))
                }
              />
            </label>
          ) : null}
          {onTest ? (
            <button
              type="button"
              className="nowrap audioRoutePioneerTest"
              disabled={disabled || testBusy}
              onClick={() => void onTest()}
            >
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
