import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

function FormControlsDemo() {
  const [checked, setChecked] = useState(true);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 420 }}>
      <label className="fieldLabel">
        Text input
        <input className="textInput" type="text" defaultValue="kitchen.local" placeholder="Hostname" />
      </label>
      <label className="fieldLabel">
        Narrow number
        <input className="textInput narrow" type="number" defaultValue={32500} />
      </label>
      <label className="fieldLabel">
        Select
        <select className="textInput" defaultValue="a">
          <option value="a">Option A</option>
          <option value="b">Option B</option>
        </select>
      </label>
      <label className="checkboxRow slim">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        Checkbox row
      </label>
      <p className="hint">Hint text for secondary guidance.</p>
      <p className="hint subtle">Subtle hint</p>
    </div>
  );
}

const meta = {
  title: "Primitives/FormControls",
  component: FormControlsDemo,
} satisfies Meta<typeof FormControlsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
