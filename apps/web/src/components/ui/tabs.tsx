"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  badge?: number;
};

/** The single tab pattern: a segmented control. Arrow keys are RTL-aware. */
export function Tabs<T extends string>({
  items,
  active,
  onChange,
  ariaLabel,
  className,
}: {
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
          id={`tab-${item.id}`}
          type="button"
          role="tab"
          aria-selected={active === item.id}
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
