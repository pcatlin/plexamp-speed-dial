import type { CSSProperties } from "react";

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
  step = 2,
  disabled = false,
}: Props) {
  const nudge = (delta: number) => onChange(clampVolume(value + delta));

  return (
    <div className="volumeStepperSlider">
      <button
        type="button"
        className="volumeStepperBtn"
        aria-label="Volume down"
        disabled={disabled || value <= 0}
        onClick={() => nudge(-step)}
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
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <button
        type="button"
        className="volumeStepperBtn"
        aria-label="Volume up"
        disabled={disabled || value >= 100}
        onClick={() => nudge(step)}
      >
        +
      </button>
    </div>
  );
}
