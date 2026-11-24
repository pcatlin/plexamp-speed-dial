import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { SpeedDialFilterPills } from "../SpeedDialFilterPills";

function ButtonGallery() {
  const [pillId, setPillId] = useState<string | null>("kitchen");

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <div>
        <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "#6b7280" }}>Default</div>
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
          <button type="button" disabled>
            Disabled
          </button>
          <button type="button" className="nowrap">
            Nowrap
          </button>
        </div>
      </div>
      <div>
        <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "#6b7280" }}>
          Clicked / active
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <button type="button" className="active">
            Default clicked
          </button>
          <button type="button" className="primary active">
            Primary clicked
          </button>
          <button type="button" className="ghost active">
            Ghost clicked
          </button>
          <button type="button" className="danger active">
            Danger clicked
          </button>
        </div>
      </div>
      <div>
        <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "#6b7280" }}>Pills</div>
        <SpeedDialFilterPills
          options={[
            { id: "kitchen", label: "Kitchen" },
            { id: "bath", label: "Bathroom" },
            { id: "den", label: "Den" },
          ]}
          selectedId={pillId}
          ariaLabel="Example filter pills"
          onToggle={(id) => setPillId((current) => (current === id ? null : id))}
        />
      </div>
      <div>
        <div style={{ marginBottom: "0.5rem", fontSize: "0.8rem", color: "#6b7280" }}>
          Start / Add to speed dial
        </div>
        <div className="stickyActions">
          <button type="button" className="primary">
            Start
          </button>
          <button type="button">Add to speed dial</button>
        </div>
      </div>
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

export const All: Story = {};
