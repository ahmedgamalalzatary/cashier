import { ArrowLeftRight, Plus } from "lucide-react";
import { Button } from "../ui/button";

export type CafeTab = "stock" | "requests" | "history";

const tabs: Array<{ id: CafeTab; label: string }> = [
  { id: "stock", label: "رصيد الكافيه" },
  { id: "requests", label: "طلبات التحويل" },
  { id: "history", label: "سجل التحويلات" },
];

export function CafeHeaderActions({
  isAdmin,
  onRequest,
  onDirect,
}: {
  isAdmin: boolean;
  onRequest: () => void;
  onDirect: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {isAdmin && (
        <Button variant="ghost" onClick={onDirect}>
          <ArrowLeftRight className="size-4" /> تحويل مباشر
        </Button>
      )}
      <Button onClick={onRequest}>
        <Plus className="size-4" /> طلب تحويل
      </Button>
    </div>
  );
}

export function CafeTabs({
  active,
  pendingRequests,
  onChange,
}: {
  active: CafeTab;
  pendingRequests: number;
  onChange: (tab: CafeTab) => void;
}) {
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    onChange(tabs[nextIndex].id);
    document.getElementById(`cafe-${tabs[nextIndex].id}-tab`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="أقسام مخزن الكافيه"
      className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`cafe-${tab.id}-tab`}
            aria-selected={selected}
            aria-controls={`cafe-${tab.id}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              selected
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.id === "requests" && pendingRequests > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-sidebar">
                {pendingRequests}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
