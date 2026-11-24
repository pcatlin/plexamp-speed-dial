import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  IconChevronDown,
  IconGrip,
  IconLaunchApp,
  IconLink,
  IconList,
  IconPause,
  IconPlay,
  IconPowerOff,
  IconShuffle,
  IconSkipNext,
  IconSkipPrevious,
  IconStop,
  IconTrash,
  IconVolumeDown,
  IconVolumeUp,
} from "./icons";

const icons = [
  ["Play", IconPlay],
  ["Pause", IconPause],
  ["Stop", IconStop],
  ["SkipPrevious", IconSkipPrevious],
  ["SkipNext", IconSkipNext],
  ["VolumeDown", IconVolumeDown],
  ["VolumeUp", IconVolumeUp],
  ["List", IconList],
  ["ChevronDown", IconChevronDown],
  ["Shuffle", IconShuffle],
  ["PowerOff", IconPowerOff],
  ["LaunchApp", IconLaunchApp],
  ["Trash", IconTrash],
  ["Link", IconLink],
  ["Grip", IconGrip],
] as const;

function IconsGallery() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(7.5rem, 1fr))",
        gap: "1rem",
      }}
    >
      {icons.map(([name, Icon]) => (
        <div
          key={name}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.85rem",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            background: "#fff",
          }}
        >
          <span style={{ fontSize: "1.35rem", lineHeight: 1 }}>
            <Icon />
          </span>
          <code style={{ fontSize: "0.72rem" }}>{name}</code>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: "Primitives/Icons",
  component: IconsGallery,
} satisfies Meta<typeof IconsGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {};
