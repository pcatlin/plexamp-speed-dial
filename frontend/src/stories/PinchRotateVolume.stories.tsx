import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useRef, useState } from "react";

import "./VolumeSliderExploration.css";

function clampVolume(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function angleBetween(a: Touch, b: Touch) {
  return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
}

function PinchRotatePad() {
  const [value, setValue] = useState(34);
  const [hint, setHint] = useState("Use two fingers and twist to change volume");
  const startAngleRef = useRef<number | null>(null);
  const startVolumeRef = useRef(34);
  const lastValueRef = useRef(34);

  const onTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) {
      startAngleRef.current = null;
      return;
    }
    event.preventDefault();
    startAngleRef.current = angleBetween(event.touches[0], event.touches[1]);
    startVolumeRef.current = lastValueRef.current;
    setHint("Twisting…");
  }, []);

  const onTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || startAngleRef.current == null) return;
    event.preventDefault();
    const angle = angleBetween(event.touches[0], event.touches[1]);
    let delta = angle - startAngleRef.current;
    // Normalize to [-π, π]
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    // Full twist (~180°) ≈ ±50 volume — tweakable
    const next = clampVolume(startVolumeRef.current + (delta / Math.PI) * 50);
    lastValueRef.current = next;
    setValue(next);
  }, []);

  const onTouchEnd = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      startAngleRef.current = null;
      setHint("Use two fingers and twist to change volume");
    }
  }, []);

  return (
    <div className="volExplore" style={{ maxWidth: 360 }}>
      <div className="volExploreCard">
        <h3>Pinch-rotate volume</h3>
        <p>
          Possible in a web app via Touch Events (two fingers). Needs{" "}
          <code>touch-action: none</code> so the browser doesn’t steal the gesture for zoom/scroll.
          Works best on a real phone — desktop multi-touch pads are inconsistent.
        </p>
        <div
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-label="Volume"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          style={{
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            display: "grid",
            placeItems: "center",
            gap: "0.5rem",
            minHeight: 220,
            borderRadius: 16,
            border: "1px dashed #9ca3af",
            background:
              "radial-gradient(circle at center, #eef2ff 0%, #f8fafc 55%, #f3f4f6 100%)",
          }}
        >
          <div className="volExploreVerticalValue">{value}%</div>
          <div style={{ fontSize: "0.85rem", color: "#4b5563", textAlign: "center", padding: "0 1rem" }}>
            {hint}
          </div>
        </div>
        <p style={{ marginTop: "0.85rem", marginBottom: 0 }}>
          Caveats: easy to conflict with page zoom; not discoverable without a hint; still provide ±
          buttons for accessibility. Sonos’s native app can own the gesture fully; the browser always
          shares it with system chrome.
        </p>
      </div>
    </div>
  );
}

const meta = {
  title: "Exploration/VolumeSliders",
  component: PinchRotatePad,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PinchRotatePad>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PinchRotate: Story = {};
