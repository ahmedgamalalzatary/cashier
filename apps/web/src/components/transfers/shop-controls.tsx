import { ArrowLeftRight, Plus } from "lucide-react";
import { Button } from "../ui/button";

export type ShopTab = "stock" | "requests" | "history";

const tabs: Array<{ id: ShopTab; label: string }> = [
  { id: "stock", label: "رصيد المحل" },
  { id: "requests", label: "طلبات التحويل" },
  { id: "history", label: "سجل التحويلات" },
];

export function ShopHeaderActions({
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

export function ShopTabs({
  active,
  pendingRequests,
  onChange,
}: {
  active: ShopTab;
  pendingRequests: number;
  onChange: (tab: ShopTab) => void;
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
    document.getElementById(`shop-${tabs[nextIndex].id}-tab`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="أقسام مخزن المحل"
      className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`shop-${tab.id}-tab`}
            aria-selected={selected}
            aria-controls={`shop-${tab.id}-panel`}
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
