import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { SpeedDialFavoriteCard } from "./SpeedDialFavoriteCard";
import { mockAmps, mockFavorite, mockPlayers, mockSpeakers } from "./stories/fixtures";

const meta = {
  title: "SpeedDial/FavoriteCard",
  component: SpeedDialFavoriteCard,
  args: {
    favorite: mockFavorite,
    editMode: false,
    playTarget: "Kitchen (22%), Bathroom (18%)",
    players: mockPlayers,
    amps: mockAmps,
    speakers: mockSpeakers,
    webhookBaseUrl: "http://192.168.1.10:5173",
    showWebhookLink: true,
    onPlay: fn(),
    onDelete: fn(),
    onPatch: fn(async () => undefined),
    onToast: fn(),
  },
  decorators: [
    (Story) => (
      <div className="speedDialList" style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpeedDialFavoriteCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const View: Story = {};

export const EditMode: Story = {
  args: {
    editMode: true,
  },
};

export const PioneerPlayer: Story = {
  args: {
    favorite: {
      ...mockFavorite,
      id: 11,
      label: "Evening Jazz",
      player_id: 2,
      speaker_ids: [],
      initial_volumes: { pioneer: 35 },
      description: "Caldera · Living room AVR (35%)",
    },
    playTarget: "35%",
  },
};
