import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";

import { VolumeEditorPopover } from "./VolumeEditorPopover";

function VolumeEditorDemo(props: { title: string; initial: number }) {
  const [value, setValue] = useState(props.initial);
  return (
    <div style={{ position: "relative", minHeight: 160, padding: "2rem" }}>
      <VolumeEditorPopover
        title={props.title}
        value={value}
        onChange={setValue}
        onClose={fn()}
      />
    </div>
  );
}

const meta = {
  title: "Controls/VolumeEditorPopover",
  component: VolumeEditorDemo,
  args: {
    title: "Kitchen",
    initial: 24,
  },
} satisfies Meta<typeof VolumeEditorDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const HighVolume: Story = {
  args: { title: "Den", initial: 72 },
};
