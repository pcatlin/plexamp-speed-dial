import type { Meta, StoryObj } from "@storybook/react-vite";

import { Toast } from "./Toast";

const meta = {
  title: "Feedback/Toast",
  component: Toast,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 120, position: "relative" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {
  args: {
    toast: { text: "Setup saved.", phase: "visible" },
  },
};

export const Entering: Story = {
  args: {
    toast: { text: "Playing Morning Mix…", phase: "enter" },
  },
};

export const Hidden: Story = {
  args: {
    toast: null,
  },
};
