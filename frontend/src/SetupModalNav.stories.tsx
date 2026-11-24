import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { SETUP_SECTIONS, SetupModalNav, type SetupSectionId } from "./SetupModalNav";

const SECTION_BLURBS: Record<SetupSectionId, { title: string; body: string }> = {
  plex: {
    title: "Plex Media Server",
    body: "Link your Plex account and point the app at your Plex Media Server on the LAN.",
  },
  sonos: {
    title: "Sonos discovery",
    body: "Help the app find speakers on your network. Use seed IPs when SSDP discovery is unreliable.",
  },
  amps: {
    title: "Amps",
    body: "Configure Pioneer AV receivers used as audio outputs for Plexamp players.",
  },
  plexamp: {
    title: "Players",
    body: "Add and edit Plexamp players and choose how each one routes audio.",
  },
  webhooks: {
    title: "Webhooks",
    body: "Enable speed-dial webhook URLs for home automation and remote triggers.",
  },
};

function SetupTabsDemo(props: { initialSection?: SetupSectionId; disabled?: boolean }) {
  const [activeSection, setActiveSection] = useState<SetupSectionId>(props.initialSection ?? "plex");
  const page = SECTION_BLURBS[activeSection];

  return (
    <div className="modalPanel setupModalPanel" style={{ position: "relative", maxWidth: 720, margin: "1rem auto" }}>
      <div className="modalHeader">
        <h2 id="setup-title">Setup</h2>
        <div className="setupModalHeaderActions">
          <button type="button" className="primary">
            Save
          </button>
          <button type="button" className="ghost">
            Close
          </button>
        </div>
      </div>
      <div className="setupModalBody">
        <SetupModalNav
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          disabled={props.disabled}
        />
        <div className="setupModalContent">
          <section className="setupModalPage" aria-labelledby="setup-story-title">
            <h3 id="setup-story-title">{page.title}</h3>
            <p className="hint setupModalIntro">{page.body}</p>
            <p className="hint subtle" style={{ margin: 0 }}>
              Active tab: {SETUP_SECTIONS.find((section) => section.id === activeSection)?.label}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Overlays/SetupModalNav",
  component: SetupTabsDemo,
  args: {
    initialSection: "plex" as SetupSectionId,
    disabled: false,
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SetupTabsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TabLayout: Story = {};

export const PlayersSelected: Story = {
  args: { initialSection: "plexamp" },
};

export const Disabled: Story = {
  args: { disabled: true },
};
