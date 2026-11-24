import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { SpeedDialFilterPills, type SpeedDialFilterOption } from "./SpeedDialFilterPills";
import { mockPlayers, mockSpeakers } from "./stories/fixtures";

const playerOptions: SpeedDialFilterOption<number>[] = mockPlayers.map((player) => ({
  id: player.id,
  label: player.name,
}));

const speakerOptions: SpeedDialFilterOption<string>[] = mockSpeakers.map((speaker) => ({
  id: speaker.id,
  label: speaker.name,
}));

function FilterPillsDemo() {
  const [playerId, setPlayerId] = useState<number | null>(1);
  const [speakerId, setSpeakerId] = useState<string | null>(null);

  return (
    <div className="speedDialFiltersBody" style={{ maxWidth: 420 }}>
      <SpeedDialFilterPills
        groupLabel="Players"
        options={playerOptions}
        selectedId={playerId}
        ariaLabel="Filter favorites by Plexamp player"
        onToggle={(id) => setPlayerId((current) => (current === id ? null : id))}
      />
      <SpeedDialFilterPills
        groupLabel="Speakers"
        options={speakerOptions}
        selectedId={speakerId}
        ariaLabel="Filter favorites by Sonos speaker"
        groupClassName="speedDialFilterGroupSpeakers"
        onToggle={(id) => setSpeakerId((current) => (current === id ? null : id))}
      />
    </div>
  );
}

function PillStates() {
  return (
    <div className="speedDialFilters">
      <button type="button" className="speedDialFilterPill">
        Unselected
      </button>
      <button type="button" className="speedDialFilterPill speedDialFilterPill--selected" aria-pressed>
        Selected
      </button>
    </div>
  );
}

const meta = {
  title: "SpeedDial/FilterPills",
  component: FilterPillsDemo,
} satisfies Meta<typeof FilterPillsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlayersAndSpeakers: Story = {};

export const PillStatesOnly: Story = {
  render: () => <PillStates />,
};
