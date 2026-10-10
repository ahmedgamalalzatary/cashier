import type { StocktakeDetail } from "@cashier/shared";
import { itemLabel } from "@cashier/web-core/lib/format";
import { Slip, SlipFacts, slipQuantity } from "@/components/print/print-slip";

const dateTime = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** A sheet to count on by hand; counts already typed in are left blank. */
export function StocktakeCountSlip({
  stocktake,
}: {
  stocktake: StocktakeDetail;
}) {
  return (
    <Slip title="ورقة جرد" label={`ورقة جرد ${stocktake.id}`}>
      <SlipFacts
        facts={[
          [
            "المخزن",
            stocktake.warehouse === "main" ? "المخزن الرئيسي" : "مخزن الكافيه",
          ],
          ["بدأها", stocktake.createdByName],
          ["التاريخ", dateTime.format(new Date(stocktake.createdAt))],
          ["ملاحظة", stocktake.note],
          ["عدد الأصناف", stocktake.lines.length.toLocaleString("ar-EG")],
        ]}
      />
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-dotted border-ink/30 text-muted">
            <th className="py-2 text-right font-medium">الصنف</th>
            <th className="py-2 text-center font-medium">المسجل</th>
            <th className="py-2 text-left font-medium">الفعلي</th>
          </tr>
        </thead>
        <tbody>
          {stocktake.lines.map((line) => (
            <tr key={line.id} className="align-top">
              <td className="py-2 pe-2 font-medium">
                {itemLabel(line.itemCode, line.itemName)}
              </td>
              <td className="tnum py-2 text-center">
                {slipQuantity(line.recordedQuantity)} {line.stockUnit}
              </td>
              <td className="py-2">
                <span
                  aria-label={`الكمية الفعلية ${line.itemName}`}
                  className="mt-3 block border-b border-ink/60"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-6 grid grid-cols-2 gap-4 text-xs text-muted">
        {["اسم القائم بالعد", "التوقيع"].map((label) => (
          <p key={label}>
            {label}
            <span className="mt-6 block border-b border-ink/60" />
          </p>
        ))}
      </div>
    </Slip>
  );
}
