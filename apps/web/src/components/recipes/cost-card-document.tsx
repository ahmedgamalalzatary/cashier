import type { PreparedRecipe } from "@cashier/shared";
import { costSourceLabel } from "@/models/recipe-model";
import { A4Document } from "@/components/print/a4-document";
import { formatOptionalMoney, itemLabel } from "@cashier/web-core/lib/format";

const quantity = (value: string) =>
  Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

/** The A4 cost card (spec §2): same layout as every other filed document. */
export function CostCardDocument({ recipe }: { recipe: PreparedRecipe }) {
  const usesMain = recipe.ingredients.some(
    (ingredient) =>
      ingredient.costSource === "main" || ingredient.costSource === "mixed",
  );
  return (
    <A4Document
      title="بطاقة التكلفة"
      label={`بطاقة تكلفة ${recipe.name}`}
      facts={[
        ["الوصفة", <b key="name">{recipe.name}</b>],
        ["الناتج", recipe.outputItemName],
        [
          "كمية الوصفة",
          <span key="yield" className="tnum">
            {quantity(recipe.baseYield)} {recipe.outputStockUnit}
          </span>,
        ],
        ["التصنيف", recipe.categoryName],
      ]}
      totals={[
        ["إجمالي التكلفة", formatOptionalMoney(recipe.currentCost), true],
        [
          `تكلفة الوحدة (${recipe.outputStockUnit})`,
          formatOptionalMoney(recipe.estimatedUnitCost),
          true,
        ],
      ]}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-ink/40 text-muted">
            <th className="py-2 text-right font-medium">المكوّن</th>
            <th className="py-2 text-center font-medium">الكمية</th>
            <th className="py-2 text-center font-medium">التكلفة</th>
            <th className="py-2 text-left font-medium">مصدر التكلفة</th>
          </tr>
        </thead>
        <tbody>
          {recipe.ingredients.map((ingredient) => (
            <tr key={ingredient.id}>
              <td className="py-2 pe-2 font-medium">
                {itemLabel(ingredient.itemCode, ingredient.itemName)}
              </td>
              <td className="tnum py-2 text-center">
                {quantity(ingredient.requiredQuantity)} {ingredient.stockUnit}
              </td>
              <td className="tnum py-2 text-center">
                {formatOptionalMoney(ingredient.currentCost)}
              </td>
              <td className="py-2 text-left">
                {costSourceLabel(ingredient.costSource)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {recipe.currentCost === null && (
        <p className="mt-3 text-xs text-danger">
          لا يكفي رصيد الكافيه والمخزن الرئيسي معاً لحساب تكلفة كل المكونات.
        </p>
      )}
      {usesMain && (
        <p className="mt-2 text-xs text-muted">
          جزء من التكلفة محسوب من رصيد المخزن الرئيسي لأن رصيد الكافيه لا يكفي.
        </p>
      )}
    </A4Document>
  );
}
