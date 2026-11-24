import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { PlaybackTransport } from "./PlaybackTransport";

const SAMPLE_ART =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1f2937"/>
          <stop offset="100%" stop-color="#2563eb"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" fill="url(#g)"/>
      <text x="40" y="46" text-anchor="middle" fill="#fff" font-size="22" font-family="system-ui">♪</text>
    </svg>`,
  );

const track = {
  title: "Pyramid Song",
  artist: "Radiohead",
  album: "Amnesiac",
  artUrl: SAMPLE_ART,
};

const actions = {
  onPlayPause: fn(),
  onSkipPrevious: fn(),
  onSkipNext: fn(),
  onToggleReceiverPower: fn(),
  onVolumeDown: fn(),
  onVolumeUp: fn(),
  onOpenSonosMixer: fn(),
};

const meta = {
  title: "Controls/PlaybackTransport",
  component: PlaybackTransport,
  args: {
    ...actions,
    playbackActive: false,
    showPioneerControls: false,
    showSonosControls: false,
    receiverPowerOn: true,
    nowPlaying: null,
    sonosVolumePercent: null,
    receiverStatusLine: null,
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof PlaybackTransport>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const PlayingWithTrack: Story = {
  args: {
    playbackActive: true,
    nowPlaying: track,
  },
};

export const PlayingWithoutArt: Story = {
  args: {
    playbackActive: true,
    nowPlaying: {
      title: "Weird Fishes/Arpeggi",
      artist: "Radiohead",
      album: "In Rainbows",
      artUrl: null,
    },
  },
};

export const PlayingTitleOnly: Story = {
  args: {
    playbackActive: true,
    nowPlaying: { title: "Untitled Track" },
  },
};

export const SonosIdle: Story = {
  args: {
    showSonosControls: true,
    sonosVolumePercent: 28,
  },
};

export const SonosPlaying: Story = {
  args: {
    playbackActive: true,
    showSonosControls: true,
    sonosVolumePercent: 34,
    nowPlaying: track,
  },
};

export const PioneerOn: Story = {
  args: {
    showPioneerControls: true,
    receiverPowerOn: true,
    receiverStatusLine: "On · BD/DVD · −22.5 dB",
  },
};

export const PioneerStandby: Story = {
  args: {
    showPioneerControls: true,
    receiverPowerOn: false,
    receiverStatusLine: "Standby · — · —",
  },
};

export const PioneerPlaying: Story = {
  args: {
    playbackActive: true,
    showPioneerControls: true,
    receiverPowerOn: true,
    receiverStatusLine: "On · BD/DVD · −18.0 dB",
    nowPlaying: track,
  },
};

export const PioneerMuted: Story = {
  args: {
    playbackActive: true,
    showPioneerControls: true,
    receiverPowerOn: true,
    receiverStatusLine: "On · BD/DVD · −∞ dB",
    nowPlaying: track,
  },
};
