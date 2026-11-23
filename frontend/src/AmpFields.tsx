import { useEffect, useState } from "react";
import type { Amp } from "./api";
import {
  PIONEER_INPUT_PRESETS,
  ampHostField,
  normalizePioneerInputCode,
  parsePioneerHostField,
} from "./audioOutput";

export type AmpDraft = {
  name: string;
  host: string;
  port: number;
  input_code: string;
};

export function ampDraftFromAmp(amp: Amp): AmpDraft {
  return {
    name: amp.name,
    host: amp.host,
    port: amp.port,
    input_code: normalizePioneerInputCode(amp.input_code),
  };
}

type Props = {
  value: AmpDraft;
  onChange: (next: AmpDraft) => void;
  onCommit?: (next: AmpDraft) => void;
  disabled?: boolean;
  idPrefix: string;
  /** Hide name field when parent already renders it. */
  showName?: boolean;
};

export function AmpFields({
  value,
  onChange,
  onCommit,
  disabled,
  idPrefix,
  showName = true,
}: Props) {
  const [hostInput, setHostInput] = useState(() => ampHostField(value));
  const [customInput, setCustomInput] = useState(false);
  const inputCode = normalizePioneerInputCode(value.input_code);
  const presetMatch = PIONEER_INPUT_PRESETS.some((p) => p.code === inputCode);
  const selectInputValue = customInput || !presetMatch ? "__custom__" : inputCode;

  useEffect(() => {
    setHostInput(ampHostField(value));
  }, [idPrefix, value.host, value.port]);

  const emit = (next: AmpDraft, commit = false) => {
    onChange(next);
    if (commit) onCommit?.(next);
  };

  const commitHost = () => {
    const { host, port } = parsePioneerHostField(hostInput);
    const next = { ...value, host, port };
    emit(next, true);
    setHostInput(ampHostField(next));
  };

  return (
    <div className="audioRoutePioneerFields">
      {showName ? (
        <label className="fieldLabel mb0 audioRoutePioneerDisplayName">
          Display name
          <input
            type="text"
            className="textInput"
            id={`${idPrefix}-name`}
            placeholder="Living room AVR"
            value={value.name}
            disabled={disabled}
            onChange={(e) => emit({ ...value, name: e.target.value })}
            onBlur={() => onCommit?.({ ...value, name: value.name.trim() })}
          />
        </label>
      ) : null}
      <label className="fieldLabel mb0 audioRoutePioneerHost">
        Receiver IP or hostname
        <input
          type="text"
          className="textInput"
          id={`${idPrefix}-host`}
          placeholder="192.168.1.50 or hostname:60128"
          value={hostInput}
          disabled={disabled}
          onChange={(e) => setHostInput(e.target.value)}
          onBlur={() => commitHost()}
        />
      </label>
      <label className="fieldLabel mb0 audioRoutePioneerInput">
        Input
        <select
          className="textInput"
          id={`${idPrefix}-input`}
          value={selectInputValue}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__custom__") {
              setCustomInput(true);
              return;
            }
            setCustomInput(false);
            emit({ ...value, input_code: v }, true);
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
            onChange={(e) => emit({ ...value, input_code: e.target.value.toUpperCase() })}
            onBlur={(e) =>
              onCommit?.({ ...value, input_code: normalizePioneerInputCode(e.target.value) })
            }
          />
        </label>
      ) : null}
    </div>
  );
}
