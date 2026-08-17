"use client";

import { useRef, type KeyboardEvent } from "react";

export type OrdersTab = "cashier" | "online";

const tabs: Array<{ id: OrdersTab; label: string }> = [
  { id: "cashier", label: "طلبات الكاشير" },
  { id: "online", label: "طلبات الأونلاين" },
];

export function OrdersTabs({
  active,
  onChange,
}: {
  active: OrdersTab;
  onChange: (tab: OrdersTab) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowLeft") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowRight")
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="مصدر الطلبات"
      className="mb-5 flex gap-1 rounded-xl border border-line bg-surface p-1"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={`orders-${tab.id}-tab`}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={`orders-${tab.id}-panel`}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-xs font-medium transition sm:px-4 sm:text-sm ${
            active === tab.id
              ? "bg-sidebar text-white shadow-sm"
              : "text-muted hover:bg-paper hover:text-ink"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
