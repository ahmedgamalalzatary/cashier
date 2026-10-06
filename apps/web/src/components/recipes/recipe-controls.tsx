"use client";

import { ArrowLeft, Beaker, ChefHat, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/cn";

export function RecipeHeaderActions({
  onPrepared,
  onRefresh,
  refreshing,
}: {
  onPrepared: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <>
      <Button variant="ghost" onClick={onPrepared}>
        <Beaker className="size-4" /> إضافة وصفة تحضير
      </Button>
      <Button onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
        {refreshing ? "جارِ التحديث…" : "تحديث المنتجات"}
      </Button>
    </>
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
