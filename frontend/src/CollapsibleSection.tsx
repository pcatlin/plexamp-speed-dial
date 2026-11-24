import type { ReactNode } from "react";

import { IconChevronDown } from "./icons";

type Props = {
  title: string;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  bodyClassName?: string;
};

export function CollapsibleSection({
  title,
  summary,
  open,
  onOpenChange,
  children,
  className,
  summaryClassName,
  bodyClassName,
}: Props) {
  return (
    <details
      className={`playToDetails${className ? ` ${className}` : ""}`}
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary className={`playToSummary${summaryClassName ? ` ${summaryClassName}` : ""}`}>
        <span className="playToSummaryText">
          <span className="sectionTitle">{title}</span>
          {summary ? <span className="playToSummarySelection">{summary}</span> : null}
        </span>
        <IconChevronDown />
      </summary>
      <div className={`playToBody${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
    </details>
  );
}
