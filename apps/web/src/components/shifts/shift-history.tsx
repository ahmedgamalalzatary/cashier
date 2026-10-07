"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Shift, ShiftEventAction } from "@cashier/shared";
import { Button } from "@cashier/web-core/components/ui/button";
import { Table } from "@cashier/web-core/components/ui/table";
import { Badge } from "@cashier/web-core/components/ui/badge";
import { formatMoney } from "@cashier/web-core/lib/format";
import { listShifts } from "../../services/shifts-service";
import { workedLabel } from "../../models/home-model";

const PAGE_SIZE = 100;
const dateTime = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
});
const actions: Record<ShiftEventAction, string> = {
  open: "فتح",
  close: "إغلاق",
  admin_close: "إغلاق إداري",
  auto_close: "إغلاق تلقائي",
  reopen: "إعادة فتح",
  correction: "تصحيح",
};

export function ShiftHistory({
  refreshKey = 0,
  renderActions,
}: {
  refreshKey?: number;
  renderActions?: (shift: Shift) => ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    listShifts({ limit: PAGE_SIZE, offset })
      .then((shifts) => {
        if (!cancelled) {
          setRows(shifts);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error ? cause.message : "تعذر تحميل سجل الورديات",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offset, refreshKey, retryVersion]);

  function changePage(nextOffset: number) {
    setLoading(true);
    setRows([]);
    setError("");
    setOffset(nextOffset);
  }

  return (
    <section aria-label="سجل الورديات">
      {error && (
        <div className="mb-3">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setLoading(true);
              setRetryVersion((version) => version + 1);
            }}
          >
            إعادة المحاولة
          </Button>
        </div>
      )}
      {loading ? (
        <p className="text-muted">جارِ تحميل السجل…</p>
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="p-5 text-muted">لا توجد ورديات في هذه الصفحة.</p>
          ) : (
            <Table
              headers={[
                "الوردية",
                "الكاشير",
                "الوقت",
                "المبيعات",
                "المتوقع",
                "الفعلي",
                "العجز/الزيادة",
                "الحالة",
                "التفاصيل / إجراءات",
              ]}
            >
              {rows.map((shift) => (
                <tr key={shift.id}>
                  <td className="px-4 py-3 tnum">#{shift.id}</td>
                  <td className="px-4 py-3">{shift.cashierName}</td>
                  <td className="px-4 py-3 text-sm">
                    {dateTime.format(new Date(shift.openedAt))}
                    <div className="text-muted">
                      {workedLabel(shift.workedMinutes)}
                    </div>
                  </td>
                  <td className="px-4 py-3 tnum">
                    {formatMoney(shift.totals.sales)}
                  </td>
                  <td className="px-4 py-3 tnum">
                    {shift.expectedCash === null
                      ? "—"
                      : formatMoney(shift.expectedCash)}
                  </td>
                  <td className="px-4 py-3 tnum">
                    {shift.actualCash === null
                      ? "—"
                      : formatMoney(shift.actualCash)}
                  </td>
                  <td className="px-4 py-3 tnum">
                    {shift.overShort === null
                      ? "—"
                      : formatMoney(shift.overShort)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={shift.status === "open" ? "success" : "neutral"}
                    >
                      {shift.status === "open" ? "مفتوحة" : "مغلقة"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <details>
                      <summary className="cursor-pointer text-primary">
                        تفاصيل الوردية
                      </summary>
                      <dl className="my-2 space-y-1">
                        <dt>العهدة الافتتاحية</dt>
                        <dd>{formatMoney(shift.openingFloat)}</dd>
                        <dt>الخصومات</dt>
                        <dd>{formatMoney(shift.totals.discounts)}</dd>
                        <dt>المرتجعات</dt>
                        <dd>{formatMoney(shift.totals.refunds)}</dd>
                        <dt>المصروفات</dt>
                        <dd>{formatMoney(shift.totals.expenses)}</dd>
                        <dt>الطلبات / التحويلات / الهالك</dt>
                        <dd>
                          {shift.totals.ordersCount} /{" "}
                          {shift.totals.transferRequests} /{" "}
                          {shift.totals.wasteEntries}
                        </dd>
                        <dt>الإغلاق</dt>
                        <dd>
                          {shift.closedAt
                            ? dateTime.format(new Date(shift.closedAt))
                            : "—"}
                        </dd>
                      </dl>
                      <ol className="space-y-2">
                        {shift.events.map((event) => (
                          <li key={event.id}>
                            <b>{actions[event.action]}</b> ·{" "}
                            {dateTime.format(new Date(event.occurredAt))} ·
                            المستخدم #{event.actorUserId}
                            {event.note && <p>{event.note}</p>}
                            {event.openingFloat !== null && (
                              <p>العهدة: {formatMoney(event.openingFloat)}</p>
                            )}
                            {event.actualCash !== null && (
                              <p>
                                الفعلي: {formatMoney(event.actualCash)} ·
                                المتوقع: {formatMoney(event.expectedCash ?? 0)}{" "}
                                · العجز/الزيادة:{" "}
                                {formatMoney(event.overShort ?? 0)}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    </details>
                    {renderActions?.(shift)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          disabled={loading || offset === 0}
          onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}
        >
          السابق
        </Button>
        <span className="text-sm text-muted">
          صفحة {Math.floor(offset / PAGE_SIZE) + 1}
        </span>
        <Button
          variant="ghost"
          disabled={loading || Boolean(error) || rows.length < PAGE_SIZE}
          onClick={() => changePage(offset + PAGE_SIZE)}
        >
          التالي
        </Button>
      </div>
    </section>
  );
}
