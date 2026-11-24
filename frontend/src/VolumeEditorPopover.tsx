import { useLayoutEffect, useRef } from "react";

import { VolumeStepperSlider } from "./VolumeStepperSlider";

type VolumeEditorPopoverProps = {
  title: string;
  value: number;
  onChange: (value: number) => void;
  onClose: () => void;
};

const MOBILE_MQ = "(max-width: 768px)";
const MOBILE_GUTTER_PX = 8;

export function VolumeEditorPopover({ title, value, onChange, onClose }: VolumeEditorPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const syncHorizontal = () => {
      const mobile = window.matchMedia(MOBILE_MQ).matches;
      if (!mobile) {
        el.style.left = "";
        el.style.width = "";
        return;
      }
      const containing = el.offsetParent as HTMLElement | null;
      if (!containing) return;
      const rect = containing.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      el.style.left = `${MOBILE_GUTTER_PX - rect.left}px`;
      el.style.width = `${viewportWidth - MOBILE_GUTTER_PX * 2}px`;
    };

    syncHorizontal();
    window.addEventListener("resize", syncHorizontal);
    window.addEventListener("scroll", syncHorizontal, true);
    const mq = window.matchMedia(MOBILE_MQ);
    mq.addEventListener("change", syncHorizontal);
    return () => {
      window.removeEventListener("resize", syncHorizontal);
      window.removeEventListener("scroll", syncHorizontal, true);
      mq.removeEventListener("change", syncHorizontal);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="volumePopover"
      role="dialog"
      aria-label={`${title} volume`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="volumePopoverHeader">
        <span className="volumePopoverTitle">{title}</span>
        <button type="button" className="volumePopoverClose" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <VolumeStepperSlider value={value} onChange={onChange} ariaLabel={`${title} volume`} />
    </div>
  );
}
