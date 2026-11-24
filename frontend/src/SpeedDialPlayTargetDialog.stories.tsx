import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { SpeedDialPlayTargetDialog } from "./SpeedDialPlayTargetDialog";
import { mockSpeakers } from "./stories/fixtures";

const meta = {
  title: "Overlays/SpeedDialPlayTargetDialog",
  component: SpeedDialPlayTargetDialog,
  args: {
    open: true,
    favoriteLabel: "Morning Mix",
    speakers: mockSpeakers,
    speakerIds: ["s-kitchen", "s-bath"],
    sonosVolumes: { "s-kitchen": 22, "s-bath": 18 },
    setVolumesOnPlay: true,
    onClose: fn(),
    onSave: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SpeedDialPlayTargetDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithVolumes: Story = {};

export const NoVolumes: Story = {
  args: {
    setVolumesOnPlay: false,
    sonosVolumes: {},
  },
};
