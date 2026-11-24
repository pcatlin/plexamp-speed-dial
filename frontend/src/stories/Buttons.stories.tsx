import type { Meta, StoryObj } from "@storybook/react-vite";

function ButtonGallery() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
      <button type="button">Default</button>
      <button type="button" className="primary">
        Primary
      </button>
      <button type="button" className="ghost">
        Ghost
      </button>
      <button type="button" className="danger">
        Danger
      </button>
      <button type="button" className="active">
        Active
      </button>
      <button type="button" disabled>
        Disabled
      </button>
      <button type="button" className="nowrap">
        Nowrap
      </button>
    </div>
  );
}

const meta = {
  title: "Primitives/Buttons",
  component: ButtonGallery,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ButtonGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllVariants: Story = {};
