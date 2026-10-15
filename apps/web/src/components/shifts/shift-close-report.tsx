import type { Shift } from "@cashier/shared";
import { formatMoney } from "@cashier/web-core/lib/format";
import { Slip, SlipFacts, SlipTotals } from "@/components/print/print-slip";

const dateTime = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** An auto-closed shift was never counted, so its cash is not a figure. */
const NOT_COUNTED = "لم يُعدّ";

/** The 80mm report a cashier keeps after closing the drawer (spec §2). */
export function ShiftCloseReport({ shift }: { shift: Shift }) {
  return (
    <Slip title="إغلاق وردية" label={`إغلاق وردية ${shift.cashierName}`}>
      <SlipFacts
        facts={[
          ["الكاشير", <b key="cashier">{shift.cashierName}</b>],
          [
            "فُتحت",
            <span key="opened" className="tnum">
              {dateTime.format(new Date(shift.openedAt))}
            </span>,
          ],
          [
            "أُغلقت",
            shift.closedAt && (
              <span key="closed" className="tnum">
                {dateTime.format(new Date(shift.closedAt))}
              </span>
            ),
          ],
        ]}
      />
      <SlipTotals
        totals={[
          ["العهدة الافتتاحية", formatMoney(shift.openingFloat)],
          ["المبيعات", formatMoney(shift.totals.sales)],
          ["المرتجعات", formatMoney(shift.totals.refunds)],
          ["مصروفات الدرج", formatMoney(shift.totals.expenses)],
          [
            "النقدية المتوقعة",
            shift.expectedCash === null ? "—" : formatMoney(shift.expectedCash),
            true,
          ],
          [
            "النقدية المعدودة",
            shift.actualCash === null
              ? NOT_COUNTED
              : formatMoney(shift.actualCash),
          ],
          [
            "العجز/الزيادة",
            shift.overShort === null ? NOT_COUNTED : formatMoney(shift.overShort),
            true,
          ],
        ]}
      />
    </Slip>
  );
}
