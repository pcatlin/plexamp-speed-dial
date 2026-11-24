export type SpeedDialFilterOption<T extends string | number = string | number> = {
  id: T;
  label: string;
};

type Props<T extends string | number> = {
  groupLabel?: string;
  options: SpeedDialFilterOption<T>[];
  selectedId: T | null;
  onToggle: (id: T) => void;
  ariaLabel: string;
  groupClassName?: string;
};

export function SpeedDialFilterPills<T extends string | number>({
  groupLabel,
  options,
  selectedId,
  onToggle,
  ariaLabel,
  groupClassName,
}: Props<T>) {
  return (
    <div className={`speedDialFilterGroup${groupClassName ? ` ${groupClassName}` : ""}`}>
      {groupLabel ? <div className="speedDialFilterLabel">{groupLabel}</div> : null}
      <div className="speedDialFilters" role="group" aria-label={ariaLabel}>
        {options.map((option) => {
          const selected = selectedId === option.id;
          return (
            <button
              key={String(option.id)}
              type="button"
              className={`speedDialFilterPill${selected ? " speedDialFilterPill--selected" : ""}`}
              aria-pressed={selected}
              onClick={() => onToggle(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
