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
  const [speakerId, setSpeakerId] = useState<string | null>("s-kitchen");

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

function ClickedState() {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div>
        <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "#6b7280" }}>Unselected</div>
        <div className="speedDialFilters">
          <button type="button" className="speedDialFilterPill">
            Kitchen Plexamp
          </button>
          <button type="button" className="speedDialFilterPill">
            Bathroom
          </button>
        </div>
      </div>
      <div>
        <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "#6b7280" }}>Clicked</div>
        <div className="speedDialFilters">
          <button
            type="button"
            className="speedDialFilterPill speedDialFilterPill--selected"
            aria-pressed
          >
            Kitchen Plexamp
          </button>
          <button
            type="button"
            className="speedDialFilterPill speedDialFilterPill--selected"
            aria-pressed
          >
            Bathroom
          </button>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Primitives/Buttons/FilterPills",
  component: FilterPillsDemo,
} satisfies Meta<typeof FilterPillsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Clicked: Story = {
  render: () => <ClickedState />,
};

export const PlayersAndSpeakers: Story = {};
