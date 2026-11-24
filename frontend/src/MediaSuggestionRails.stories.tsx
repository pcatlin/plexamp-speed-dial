import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";

import type { MediaItem } from "./api";
import { MediaSuggestionRails } from "./MediaSuggestionRails";
import { mockSuggestionRails, suggestionArtSrc } from "./stories/pickMusicFixtures";

function SuggestionsDemo(props: {
  rails?: typeof mockSuggestionRails;
  loading?: boolean;
  initialSelectedId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(props.initialSelectedId ?? "a1");

  return (
    <div style={{ maxWidth: 520 }}>
      <MediaSuggestionRails
        rails={props.rails ?? mockSuggestionRails}
        selectedId={selectedId}
        loading={props.loading}
        loadingMessage="Loading album suggestions…"
        emptyMessage="No album suggestions from Plex yet."
        artSrc={suggestionArtSrc}
        onSelect={(item: MediaItem) => setSelectedId(item.id)}
      />
    </div>
  );
}

const meta = {
  title: "PickMusic/MediaSuggestionRails",
  component: SuggestionsDemo,
  args: {
    loading: false,
    initialSelectedId: "a1",
  },
} satisfies Meta<typeof SuggestionsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AlbumRails: Story = {};

export const Loading: Story = {
  args: { loading: true },
};

export const Empty: Story = {
  args: {
    rails: mockSuggestionRails.map((rail) => ({ ...rail, items: [] })),
  },
};

export const SingleRail: Story = {
  render: () => (
    <div style={{ maxWidth: 520 }}>
      <MediaSuggestionRails
        rails={[mockSuggestionRails[0]]}
        selectedId="a2"
        artSrc={suggestionArtSrc}
        onSelect={fn()}
      />
    </div>
  ),
};
