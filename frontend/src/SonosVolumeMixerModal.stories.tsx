import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";

import type { Speaker } from "./api";
import { SonosVolumeMixerModal } from "./SonosVolumeMixerModal";

const storySpeakers: Speaker[] = [
  { id: "s-kitchen", name: "Kitchen", ip: "192.168.1.20", volume: 22, playing: false },
  { id: "s-bath", name: "Bathroom", ip: "192.168.1.21", volume: 18, playing: false },
  { id: "s-den", name: "Den", ip: "192.168.1.22", volume: 30, playing: true, source: "Spotify" },
  { id: "s-patio", name: "Patio", ip: "192.168.1.23", volume: 25, playing: false },
];

function volumesFromSpeakers(speakers: Speaker[]): Record<string, number> {
  return Object.fromEntries(speakers.map((speaker) => [speaker.id, speaker.volume ?? 20]));
}

const onClose = fn();
const onSpeakersRefreshed = fn();
const onToast = fn();

function SonosVolumeMixerDemo(props: { initialSelectedIds: string[] }) {
  const [selectedIds, setSelectedIds] = useState(props.initialSelectedIds);
  const [fallbackVolumes, setFallbackVolumes] = useState(() => volumesFromSpeakers(storySpeakers));

  return (
    <SonosVolumeMixerModal
      open
      refreshOnOpen={false}
      speakers={storySpeakers}
      selectedSpeakerIds={selectedIds}
      fallbackVolumes={fallbackVolumes}
      onClose={onClose}
      onSpeakerVolumeChange={(speakerId, volume) => {
        setFallbackVolumes((current) => ({ ...current, [speakerId]: volume }));
      }}
      onSelectedSpeakerIdsChange={setSelectedIds}
      onSpeakersRefreshed={onSpeakersRefreshed}
      onToast={onToast}
    />
  );
}

const meta = {
  title: "Overlays/SonosVolumeMixerModal",
  component: SonosVolumeMixerDemo,
  args: {
    initialSelectedIds: ["s-kitchen", "s-bath"],
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SonosVolumeMixerDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Group membership and volumes update locally (no API). */
export const GroupAndVolumes: Story = {};

/** Den is playing — checking it prompts the interrupt confirm dialog. */
export const AddPlayingSpeaker: Story = {
  args: {
    initialSelectedIds: ["s-kitchen"],
  },
};

export const NoSelection: Story = {
  args: {
    initialSelectedIds: [],
  },
};
