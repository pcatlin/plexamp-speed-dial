import type { Meta, StoryObj } from "@storybook/react-vite";

import { TrackPreviewList } from "./TrackPreviewList";
import { mockTracks } from "./stories/pickMusicFixtures";

const meta = {
  title: "PickMusic/TrackPreviewList",
  component: TrackPreviewList,
  args: {
    tracks: mockTracks,
    loading: false,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrackPreviewList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTracks: Story = {};

export const Loading: Story = {
  args: { tracks: [], loading: true },
};

export const Empty: Story = {
  args: { tracks: [] },
};
