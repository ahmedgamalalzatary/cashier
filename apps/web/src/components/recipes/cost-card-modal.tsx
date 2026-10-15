"use client";

import { Printer } from "lucide-react";
import type { PreparedRecipe } from "@cashier/shared";
import { costSourceLabel } from "@/models/recipe-model";
import { CostCardDocument } from "@/components/recipes/cost-card-document";
import { PrintSlip } from "@/components/print/print-slip";
import { Badge } from "@cashier/web-core/components/ui/badge";
import { Button } from "@cashier/web-core/components/ui/button";
import { Modal } from "@cashier/web-core/components/ui/modal";
import { formatMoney, itemLabel } from "@cashier/web-core/lib/format";

const quantity = (value: string) =>
  Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

export function CostCardModal({
  recipe,
  onClose,
}: {
  recipe: PreparedRecipe;
  onClose: () => void;
}) {
  return (
    <Modal open size="xl" title={`بطاقة التكلفة — ${recipe.name}`} onClose={onClose}>
      <div className="space-y-4">
        <CostCard recipe={recipe} />
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            إغلاق
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> طباعة
          </Button>
        </div>
      </div>
      <PrintSlip>
        <CostCardDocument recipe={recipe} />
      </PrintSlip>
    </Modal>
  );
}

function CostCard({ recipe }: { recipe: PreparedRecipe }) {
  const usesMain = recipe.ingredients.some(
    (ingredient) =>
      ingredient.costSource === "main" || ingredient.costSource === "mixed",
  );
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">الناتج</dt>
          <dd className="font-medium">{recipe.outputItemName}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">كمية الوصفة</dt>
          <dd className="tnum font-medium">
            {quantity(recipe.baseYield)} {recipe.outputStockUnit}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">التصنيف</dt>
          <dd className="font-medium">{recipe.categoryName}</dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <caption className="sr-only">مكونات الوصفة وتكلفتها</caption>
          <thead>
            <tr className="border-b border-line bg-paper/50">
              {["المكوّن", "الكمية", "التكلفة", "مصدر التكلفة"].map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="px-3 py-2 text-start text-xs font-semibold text-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {recipe.ingredients.map((ingredient) => (
              <tr key={ingredient.id}>
                <td className="px-3 py-2 font-medium">
                  {itemLabel(ingredient.itemCode, ingredient.itemName)}
                </td>
                <td className="tnum px-3 py-2">
                  {quantity(ingredient.requiredQuantity)} {ingredient.stockUnit}
                </td>
                <td className="tnum px-3 py-2">
                  {ingredient.currentCost === null
                    ? "—"
                    : formatMoney(ingredient.currentCost)}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    tone={
                      ingredient.costSource === null
                        ? "danger"
                        : ingredient.costSource === "cafe"
                          ? "success"
                          : "neutral"
                    }
                  >
                    {costSourceLabel(ingredient.costSource)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ms-auto max-w-xs space-y-1.5 rounded-xl bg-paper p-4">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">إجمالي التكلفة</dt>
          <dd className="tnum font-bold">
            {recipe.currentCost === null ? "—" : formatMoney(recipe.currentCost)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">
            تكلفة الوحدة ({recipe.outputStockUnit})
          </dt>
          <dd className="tnum font-bold">
            {recipe.estimatedUnitCost === null
              ? "—"
              : formatMoney(recipe.estimatedUnitCost)}
          </dd>
        </div>
      </dl>

      {recipe.currentCost === null && (
        <p className="text-xs text-danger">
          لا يكفي رصيد الكافيه والمخزن الرئيسي معاً لحساب تكلفة كل المكونات.
        </p>
      )}
      {usesMain && (
        <p className="text-xs text-muted">
          جزء من التكلفة محسوب من رصيد المخزن الرئيسي لأن رصيد الكافيه لا يكفي.
        </p>
      )}
    </div>
  );
}
