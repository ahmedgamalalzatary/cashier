"use client";

import { useRef, type KeyboardEvent } from "react";
import { ArrowLeft, Beaker, ChefHat, Plus } from "lucide-react";
import { formatMoney } from "../../lib/format";
import { Button } from "../ui/button";

export type RecipeTab = "products" | "prepared" | "preparations";

const tabs: Array<{ id: RecipeTab; label: string }> = [
  { id: "products", label: "منتجات القائمة" },
  { id: "prepared", label: "الأصناف المُحضّرة" },
  { id: "preparations", label: "سجل التحضير" },
];

export function RecipeTabs({
  active,
  counts,
  onChange,
}: {
  active: RecipeTab;
  counts: Record<RecipeTab, number>;
  onChange: (tab: RecipeTab) => void;
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
      aria-label="أقسام الوصفات"
      className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={`recipes-${tab.id}-tab`}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={`recipes-${tab.id}-panel`}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={`flex min-w-fit flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            active === tab.id
              ? "bg-sidebar text-white shadow-sm"
              : "text-muted hover:bg-paper hover:text-ink"
          }`}
        >
          {tab.label}
          <span className="tnum rounded-full bg-current/10 px-1.5 text-xs">
            {counts[tab.id]}
          </span>
        </button>
      ))}
    </div>
  );
}

export function RecipeHeaderActions({
  onProduct,
  onPrepared,
}: {
  onProduct: () => void;
  onPrepared: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" onClick={onPrepared}>
        <Beaker className="size-4" /> إضافة وصفة تحضير
      </Button>
      <Button onClick={onProduct}>
        <Plus className="size-4" /> إضافة منتج وصفة
      </Button>
    </div>
  );
}

export function RecipeFlowRail({
  ingredientLabel,
  outputLabel,
  costLabel,
  available,
}: {
  ingredientLabel: string;
  outputLabel: string;
  costLabel: string;
  available: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 rounded-xl border border-line bg-paper/70 px-3 py-2 text-xs">
      <span className="text-center text-muted">{ingredientLabel}</span>
      <ArrowLeft aria-hidden="true" className="size-3.5 text-primary" />
      <span className="text-center font-medium">{outputLabel}</span>
      <ArrowLeft aria-hidden="true" className="size-3.5 text-primary" />
      <span className="text-center">
        <span className="tnum block font-semibold">{costLabel}</span>
        {!available && (
          <span className="block text-[10px] text-danger">رصيد غير كافٍ</span>
        )}
      </span>
    </div>
  );
}

export function PreparationMark() {
  return (
    <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
      <ChefHat className="size-4" />
    </span>
  );
}

export function RecipeMargin({
  marginAmount,
  marginPercentage,
  costPercentage,
}: {
  marginAmount: string;
  marginPercentage: string;
  costPercentage: string;
}) {
  const isLoss = Number(marginAmount) < 0;

  return (
    <span
      className={`tnum font-medium ${isLoss ? "text-danger" : "text-success"}`}
    >
      هامش {formatMoney(marginAmount)} · {marginPercentage}% · نسبة التكلفة{" "}
      {costPercentage}%
    </span>
  );
}
