import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";

import type { AudioOutput } from "./api";
import { PlayerAudioRouteFields } from "./PlayerAudioRouteFields";
import { mockAmps, mockSpeakers } from "./stories/fixtures";

function RouteFieldsDemo(props: { initial: AudioOutput }) {
  const [value, setValue] = useState(props.initial);
  return (
    <div style={{ maxWidth: 520 }}>
      <PlayerAudioRouteFields
        idPrefix="story-route"
        value={value}
        onChange={setValue}
        onCommit={fn()}
        sonosSpeakers={mockSpeakers}
        amps={mockAmps}
      />
      <pre style={{ marginTop: "1rem", fontSize: "0.8rem" }}>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

const meta = {
  title: "Forms/PlayerAudioRouteFields",
  component: RouteFieldsDemo,
  args: {
    initial: { kind: "none" as const, config: {} },
  },
} satisfies Meta<typeof RouteFieldsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const None: Story = {};

export const Sonos: Story = {
  args: {
    initial: { kind: "sonos", config: { speaker_id: "s-kitchen" } },
  },
};

export const Pioneer: Story = {
  args: {
    initial: { kind: "pioneer", config: { amp_id: 1 } },
  },
};
