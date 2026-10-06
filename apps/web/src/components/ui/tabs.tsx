"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  badge?: number;
};

const tabId = (idPrefix: string, id: string) => `${idPrefix}-${id}-tab`;
const panelId = (idPrefix: string) => `${idPrefix}-panel`;

/**
 * The single tab pattern: a segmented control. Arrow keys are RTL-aware.
 * Pair it with a <TabPanel> using the same idPrefix (unique per page).
 */
export function Tabs<T extends string>({
  idPrefix,
  items,
  active,
  onChange,
  ariaLabel,
  className,
}: {
  idPrefix: string;
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onChange: (tab: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowLeft") next = (index + 1) % items.length;
    else if (event.key === "ArrowRight")
      next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("segmented", className)}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={tabId(idPrefix, item.id)}
          type="button"
          role="tab"
          aria-selected={active === item.id}
          aria-controls={active === item.id ? panelId(idPrefix) : undefined}
          tabIndex={active === item.id ? 0 : -1}
          data-active={active === item.id}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className="segmented-item"
        >
          {item.label}
          {item.badge !== undefined && item.badge > 0 && (
            <span className="tnum rounded-full bg-accent px-1.5 text-xs text-sidebar">
              {item.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** The content area for the selected tab of the <Tabs> with the same idPrefix. */
export function TabPanel({
  idPrefix,
  active,
  children,
  className,
}: {
  idPrefix: string;
  active: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={panelId(idPrefix)}
      aria-labelledby={tabId(idPrefix, active)}
      className={className}
    >
      {children}
    </div>
  );
}
