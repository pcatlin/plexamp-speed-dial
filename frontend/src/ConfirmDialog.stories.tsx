import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { ConfirmDialog } from "./ConfirmDialog";

const meta = {
  title: "Overlays/ConfirmDialog",
  component: ConfirmDialog,
  args: {
    open: true,
    title: "Are you sure?",
    message: "Remove player “Kitchen”? This cannot be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    destructive: true,
    onConfirm: fn(),
    onCancel: fn(),
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Destructive: Story = {};

export const Neutral: Story = {
  args: {
    title: "Save changes?",
    message: "Unsaved amp settings will be written to the server.",
    confirmLabel: "Save",
    destructive: false,
  },
};
