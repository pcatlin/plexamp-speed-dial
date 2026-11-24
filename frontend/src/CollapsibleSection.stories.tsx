import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";

import { CollapsibleSection } from "./CollapsibleSection";
import { SpeedDialFilterPills } from "./SpeedDialFilterPills";

function CollapsibleDemo(props: {
  title: string;
  summary: string;
  initiallyOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(props.initiallyOpen ?? true);
  return (
    <section className="card" style={{ maxWidth: 520 }}>
      <CollapsibleSection
        title={props.title}
        summary={props.summary}
        open={open}
        onOpenChange={setOpen}
      >
        {props.children ?? (
          <p className="hint" style={{ margin: 0 }}>
            Section body content goes here.
          </p>
        )}
      </CollapsibleSection>
    </section>
  );
}

function MainPageSections() {
  const [pickOpen, setPickOpen] = useState(true);
  const [playToOpen, setPlayToOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [playerId, setPlayerId] = useState<number | null>(1);
  const [speakerId, setSpeakerId] = useState<string | null>(null);

  return (
    <div style={{ display: "grid", gap: "0.85rem", maxWidth: 520 }}>
      <section className="card">
        <CollapsibleSection
          title="Pick Music"
          summary="Playlists · Morning Mix"
          open={pickOpen}
          onOpenChange={setPickOpen}
        >
          <p className="hint" style={{ margin: 0 }}>
            Browse playlists, albums, artists, and tracks.
          </p>
        </CollapsibleSection>
      </section>

      <section className="card">
        <CollapsibleSection
          title="Play to"
          summary="Kitchen, Bathroom · Kitchen Plexamp"
          open={playToOpen}
          onOpenChange={setPlayToOpen}
        >
          <p className="hint" style={{ margin: 0 }}>
            Choose speakers or a Pioneer AVR and a Plexamp player.
          </p>
        </CollapsibleSection>
      </section>

      <section className="card">
        <h2 className="sectionTitle">Speed Dial</h2>
        <CollapsibleSection
          title="Filters"
          summary="Kitchen Plexamp"
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          className="speedDialFiltersDetails"
          summaryClassName="speedDialFiltersSummary"
          bodyClassName="speedDialFiltersBody"
        >
          <SpeedDialFilterPills
            groupLabel="Players"
            options={[
              { id: 1, label: "Kitchen Plexamp" },
              { id: 2, label: "Caldera" },
            ]}
            selectedId={playerId}
            ariaLabel="Filter favorites by Plexamp player"
            onToggle={(id) => setPlayerId((current) => (current === id ? null : id))}
          />
          <SpeedDialFilterPills
            groupLabel="Speakers"
            options={[
              { id: "s-kitchen", label: "Kitchen" },
              { id: "s-bath", label: "Bathroom" },
            ]}
            selectedId={speakerId}
            ariaLabel="Filter favorites by Sonos speaker"
            groupClassName="speedDialFilterGroupSpeakers"
            onToggle={(id) => setSpeakerId((current) => (current === id ? null : id))}
          />
        </CollapsibleSection>
      </section>
    </div>
  );
}

const meta = {
  title: "Primitives/CollapsibleSection",
  component: CollapsibleDemo,
  args: {
    title: "Play to",
    summary: "Kitchen · Kitchen Plexamp",
    initiallyOpen: true,
  },
} satisfies Meta<typeof CollapsibleDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Closed: Story = {
  args: { initiallyOpen: false },
};

/** Pick Music, Play to, and Speed Dial Filters as on the main page. */
export const MainPage: Story = {
  render: () => <MainPageSections />,
};
