import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { SpeedDialPlayerDialog } from "./SpeedDialPlayerDialog";
import { mockPlayers } from "./stories/fixtures";

const meta = {
  title: "Overlays/SpeedDialPlayerDialog",
  component: SpeedDialPlayerDialog,
  args: {
    open: true,
    favoriteLabel: "Morning Mix",
    players: mockPlayers,
    playerId: 1,
    onClose: fn(),
    onSave: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SpeedDialPlayerDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
