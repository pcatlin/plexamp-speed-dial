type VolumeEditorPopoverProps = {
  title: string;
  value: number;
  onChange: (value: number) => void;
  onClose: () => void;
};

export function VolumeEditorPopover({ title, value, onChange, onClose }: VolumeEditorPopoverProps) {
  return (
    <div
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
      <label className="volumePopoverSlider">
        <span className="volumePopoverValue">Volume {value}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}
