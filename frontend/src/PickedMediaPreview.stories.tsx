import type { Meta, StoryObj } from "@storybook/react-vite";

import { PickedMediaPreview } from "./PickedMediaPreview";
import { mockCoverArt, mockPlaylist } from "./stories/pickMusicFixtures";

const meta = {
  title: "PickMusic/PickedMediaPreview",
  component: PickedMediaPreview,
  args: {
    title: mockPlaylist.title,
    subtitle: mockPlaylist.subtitle,
    artUrl: mockCoverArt("♪", "#111827"),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PickedMediaPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playlist: Story = {};

export const Album: Story = {
  args: {
    title: "In Rainbows",
    subtitle: "Radiohead",
    artUrl: mockCoverArt("IR", "#0f766e"),
  },
};

export const TitleOnly: Story = {
  args: {
    title: "Untitled Playlist",
    subtitle: null,
    artUrl: mockCoverArt("?", "#6b7280"),
  },
};
