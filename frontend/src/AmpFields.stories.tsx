import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";

import { AmpFields, type AmpDraft } from "./AmpFields";

function AmpFieldsDemo(props: { initial: AmpDraft; showName?: boolean }) {
  const [value, setValue] = useState(props.initial);
  return (
    <div style={{ maxWidth: 520 }}>
      <AmpFields
        idPrefix="story-amp"
        value={value}
        onChange={setValue}
        onCommit={fn()}
        showName={props.showName}
      />
      <pre style={{ marginTop: "1rem", fontSize: "0.8rem" }}>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

const meta = {
  title: "Forms/AmpFields",
  component: AmpFieldsDemo,
  args: {
    showName: true,
    initial: {
      name: "Living room AVR",
      host: "192.168.1.50",
      port: 60128,
      input_code: "02",
    },
  },
} satisfies Meta<typeof AmpFieldsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutName: Story = {
  args: { showName: false },
};

export const CustomInput: Story = {
  args: {
    initial: {
      name: "Workshop",
      host: "avr.local:60129",
      port: 60129,
      input_code: "55",
    },
  },
};
