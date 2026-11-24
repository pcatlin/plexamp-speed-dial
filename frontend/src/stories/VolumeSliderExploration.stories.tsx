import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { VolumeStepperSlider } from "../VolumeStepperSlider";
import "./VolumeSliderExploration.css";

const PRESETS = [0, 15, 25, 40, 50, 65, 80, 100];

function clampVolume(value: number) {
  return Math.max(0, Math.min(100, value));
}

function VolumeControl(props: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  withSteppers?: boolean;
}) {
  if (props.withSteppers) {
    return (
      <VolumeStepperSlider
        value={props.value}
        onChange={props.onChange}
        ariaLabel={props.ariaLabel}
      />
    );
  }

  return (
    <div className="volExploreRow volExploreCurrent">
      <input
        type="range"
        min={0}
        max={100}
        value={props.value}
        aria-label={props.ariaLabel ?? "Volume"}
        onChange={(event) => props.onChange(Number(event.target.value))}
        style={{ flex: 1, minWidth: 0, margin: 0 }}
      />
      <span className="volExploreValue">{props.value}%</span>
    </div>
  );
}

function CurrentSlider() {
  const [value, setValue] = useState(34);
  return (
    <div className="volExploreCard">
      <h3>Current</h3>
      <p>Native range as used in the Sonos mixer / volume popover. Thin thumb, easy to miss on phones.</p>
      <VolumeControl value={value} onChange={setValue} />
    </div>
  );
}

function PreferredSlider() {
  const [value, setValue] = useState(34);
  return (
    <div className="volExploreCard volExplorePreferred">
      <span className="volExplorePreferredBadge">Preferred</span>
      <h3>Current slider + ± steppers</h3>
      <p>
        Keep today’s native range for drag; add ±1 buttons for precise taps. Same layout as the mixer
        row, with compact step buttons.
      </p>
      <VolumeControl value={value} onChange={setValue} withSteppers />
    </div>
  );
}

function PreferredInMixer() {
  const [volumes, setVolumes] = useState({
    kitchen: 22,
    bath: 40,
    hallway: 50,
  });

  const setSpeaker = (id: keyof typeof volumes, value: number) => {
    setVolumes((current) => ({ ...current, [id]: value }));
  };

  return (
    <div className="volExploreCard volExplorePreferred">
      <span className="volExplorePreferredBadge">Preferred · mixer</span>
      <h3>Sonos volumes list</h3>
      <p>How the hybrid would feel with multiple speakers (Storybook only).</p>
      <div className="volExploreMixerList">
        {(
          [
            ["kitchen", "Kitchen"],
            ["bath", "Bathroom"],
            ["hallway", "Hallway"],
          ] as const
        ).map(([id, name]) => (
          <div key={id} className="volExploreMixerRow">
            <div className="volExploreMixerName">{name}</div>
            <VolumeControl
              value={volumes[id]}
              ariaLabel={`${name} volume`}
              onChange={(value) => setSpeaker(id, value)}
              withSteppers
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function LargeThumbSlider() {
  const [value, setValue] = useState(34);
  return (
    <div className="volExploreCard">
      <h3>A — Larger touch target</h3>
      <p>Same slider, but taller hit area and a ~28px thumb. Lowest-risk CSS-only upgrade.</p>
      <div className="volExploreRow">
        <input
          className="volExploreLargeRange"
          type="range"
          min={0}
          max={100}
          value={value}
          aria-label="Volume"
          onChange={(event) => setValue(Number(event.target.value))}
        />
        <span className="volExploreValue">{value}%</span>
      </div>
    </div>
  );
}

function StepperSlider() {
  const [value, setValue] = useState(34);
  const nudge = (delta: number) => setValue((current) => clampVolume(current + delta));

  return (
    <div className="volExploreCard">
      <h3>B — Slider + step buttons</h3>
      <p>
        Keep the slider for coarse moves; ±5 buttons for precise taps (matches transport volume up/down).
      </p>
      <div className="volExploreRow">
        <button type="button" className="volExploreStepBtn" aria-label="Volume down" onClick={() => nudge(-5)}>
          −
        </button>
        <input
          className="volExploreLargeRange"
          type="range"
          min={0}
          max={100}
          value={value}
          aria-label="Volume"
          onChange={(event) => setValue(Number(event.target.value))}
        />
        <button type="button" className="volExploreStepBtn" aria-label="Volume up" onClick={() => nudge(5)}>
          +
        </button>
        <span className="volExploreValue">{value}%</span>
      </div>
    </div>
  );
}

function PresetPills() {
  const [value, setValue] = useState(40);
  return (
    <div className="volExploreCard">
      <h3>C — Preset levels</h3>
      <p>
        Big tappable levels for “set volume on play” / mixer defaults. Can sit above a fine slider.
      </p>
      <div className="volExplorePresets" role="group" aria-label="Volume presets">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={value === preset ? "primary" : undefined}
            aria-pressed={value === preset}
            onClick={() => setValue(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <div className="volExploreRow" style={{ marginTop: "0.75rem" }}>
        <input
          className="volExploreLargeRange"
          type="range"
          min={0}
          max={100}
          value={value}
          aria-label="Volume"
          onChange={(event) => setValue(Number(event.target.value))}
        />
        <span className="volExploreValue">{value}%</span>
      </div>
    </div>
  );
}

function VerticalSheet() {
  const [value, setValue] = useState(34);
  const nudge = (delta: number) => setValue((current) => clampVolume(current + delta));

  return (
    <div className="volExploreCard">
      <h3>D — Vertical large control</h3>
      <p>
        Full-thumb vertical drag (popover / bottom sheet). Best for one speaker at a time; less dense than a list of horizontal sliders.
      </p>
      <div className="volExploreVertical">
        <div className="volExploreVerticalValue">{value}%</div>
        <input
          className="volExploreVerticalRange"
          type="range"
          min={0}
          max={100}
          value={value}
          aria-label="Volume"
          onChange={(event) => setValue(Number(event.target.value))}
        />
        <div className="volExploreVerticalActions">
          <button type="button" aria-label="Volume down" onClick={() => nudge(-5)}>
            −
          </button>
          <button type="button" aria-label="Volume up" onClick={() => nudge(5)}>
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function Comparison() {
  return (
    <div className="volExplore">
      <PreferredSlider />
      <PreferredInMixer />
      <CurrentSlider />
      <LargeThumbSlider />
      <StepperSlider />
      <PresetPills />
      <VerticalSheet />
    </div>
  );
}

const meta = {
  title: "Exploration/VolumeSliders",
  component: Comparison,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Comparison>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Side-by-side options for mobile-friendlier volume controls (Storybook only). */
export const Compare: Story = {};

/** Current native range + ±5 steppers — chosen direction. */
export const Preferred: Story = { render: () => <PreferredSlider /> };

export const PreferredMixer: Story = { render: () => <PreferredInMixer /> };

export const Current: Story = { render: () => <CurrentSlider /> };
export const LargerTouchTarget: Story = { render: () => <LargeThumbSlider /> };
export const SliderWithSteppers: Story = { render: () => <StepperSlider /> };
export const PresetLevels: Story = { render: () => <PresetPills /> };
export const VerticalLarge: Story = { render: () => <VerticalSheet /> };
