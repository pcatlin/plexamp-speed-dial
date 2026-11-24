import type { CSSProperties } from "react";

import { hapticForVolumeChange } from "./volumeHaptics";

type Props = {
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  step?: number;
  disabled?: boolean;
};

function clampVolume(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function VolumeStepperSlider({
  value,
  onChange,
  ariaLabel = "Volume",
  step = 1,
  disabled = false,
}: Props) {
  const setVolume = (next: number) => {
    const clamped = clampVolume(next);
    if (clamped === value) return;
    hapticForVolumeChange(value, clamped);
    onChange(clamped);
  };

  return (
    <div className="volumeStepperSlider" onContextMenu={(event) => event.preventDefault()}>
      <button
        type="button"
        className="volumeStepperBtn"
        aria-label="Volume down"
        disabled={disabled || value <= 0}
        onClick={() => setVolume(value - step)}
      >
        −
      </button>
      <div className="volumeStepperTrackWrap" style={{ ["--vol-t"]: value / 100 } as CSSProperties}>
        <span className="volumeStepperBubble" aria-hidden>
          {value}%
        </span>
        <input
          type="range"
          className="volumeStepperRange"
          min={0}
          max={100}
          value={value}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-valuetext={`${value}%`}
          onChange={(event) => setVolume(Number(event.target.value))}
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
      <button
        type="button"
        className="volumeStepperBtn"
        aria-label="Volume up"
        disabled={disabled || value >= 100}
        onClick={() => setVolume(value + step)}
      >
        +
      </button>
    </div>
  );
}
