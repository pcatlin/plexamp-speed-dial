import type { Meta, StoryObj } from "@storybook/react-vite";

import { Toast } from "./Toast";

const EXAMPLE_MESSAGES = [
  "Playing Morning Mix",
  "Playing playlist: 'Morning Mix' via Kitchen Plexamp. Sonos: grouped [Bathroom, Hallway] → line-in from Kitchen. Sonos: volume set on Bathroom → 40%, Hallway → 50%.",
  "Playing album (shuffled): 'In Rainbows' via Caldera. Pioneer AVR powered on · input BD/DVD.",
  "Sonos: volume +5% on Bathroom, Hallway.",
  "Sonos: volume set on Bathroom → 40%, Hallway → 50%.",
  "Paused playback (Kitchen Plexamp).",
  "Resumed playback (Kitchen Plexamp).",
  "Skipped to next track (Kitchen Plexamp).",
  "Saved to speed dial.",
  "Setup saved.",
  "Removed from speed dial.",
  "Webhook URL copied",
  "Added player Kitchen Plexamp (kitchen.local:32500).",
  "Added amp Living room AVR.",
  "Plex linked. Loading your library…",
  "Opening Plex sign-in — approve this app in the browser window…",
  "Select media and Plexamp player first.",
  "Select at least one Sonos speaker to change volume.",
  "Already playing.",
  "Random: In Rainbows",
  "Added Kitchen to the group",
];

function ToastGallery() {
  return (
    <div style={{ display: "grid", gap: "0.65rem", maxWidth: 520 }}>
      {EXAMPLE_MESSAGES.map((text) => (
        <div
          key={text}
          className="appToast appToast--visible"
          style={{ position: "relative", top: "auto", left: "auto", right: "auto", transform: "none" }}
          role="status"
        >
          {text}
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: "Feedback/Toast",
  component: Toast,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {
  args: {
    toast: {
      text: "Playing playlist: 'Morning Mix' via Kitchen Plexamp. Sonos: grouped [Bathroom, Hallway] → line-in from Kitchen. Sonos: volume set on Bathroom → 40%, Hallway → 50%.",
      phase: "visible",
    },
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 80, position: "relative" }}>
        <Story />
      </div>
    ),
  ],
};

/** Common success, progress, and validation toasts from the app. */
export const Examples: Story = {
  render: () => <ToastGallery />,
};
