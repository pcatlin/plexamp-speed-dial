import type { Meta, StoryObj } from "@storybook/react-vite";

import { PickedMediaPreview } from "./PickedMediaPreview";
import { TrackPreviewList } from "./TrackPreviewList";
import { mockCoverArt, mockPlaylist, mockTracks } from "./stories/pickMusicFixtures";

function PlaylistPreview() {
  return (
    <div style={{ maxWidth: 420 }}>
      <PickedMediaPreview
        title={mockPlaylist.title}
        subtitle={`${mockTracks.length} tracks`}
        artUrl={mockCoverArt("♪", "#111827")}
      />
      <TrackPreviewList tracks={mockTracks} />
    </div>
  );
}

const meta = {
  title: "PickMusic/PlaylistPreview",
  component: PlaylistPreview,
} satisfies Meta<typeof PlaylistPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cover, name, track count, and track list as shown after picking a playlist. */
export const Default: Story = {};
