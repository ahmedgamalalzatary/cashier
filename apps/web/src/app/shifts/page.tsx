"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  ArrowLeftRight,
  Clock3,
  History,
  LockKeyhole,
  PencilLine,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  Tag,
  Trash2,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import type { Shift } from "@cashier/shared";
import { useAuth } from "@/components/auth/auth-provider";
import {
  ShiftActionModal,
  type ShiftActionMode,
} from "@/components/shifts/shift-action-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { ShiftHistory } from "@/components/shifts/shift-history";
import { formatMoney } from "@/lib/format";
import {
  adminCloseShift,
  correctShift,
  listActiveShifts,
  reopenShift,
} from "@/services/shifts-service";

type Action = { mode: ShiftActionMode; shift?: Shift };

const dateTime = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
});

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} س ${rest} د` : `${rest} دقيقة`;
}

export default function ShiftsPage() {
  const { user } = useAuth();
  const [active, setActive] = useState<Shift[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<Action | null>(null);

  const load = useCallback(async () => {
    try {
      setActive(await listActiveShifts());
      setHistoryVersion((version) => version + 1);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الورديات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [load]);

  async function submit(values: {
    openingFloat?: number;
    actualCash?: number;
    note?: string;
  }) {
    if (!action) return;
    if (action.mode === "admin-close")
      await adminCloseShift(action.shift!.id, {
        actualCash: values.actualCash!,
        note: values.note!,
      });
    else if (action.mode === "reopen")
      await reopenShift(action.shift!.id, values.note!);
    else
      await correctShift(action.shift!.id, {
        openingFloat: values.openingFloat,
        actualCash: values.actualCash,
        note: values.note!,
      });
    setAction(null);
    await load();
  }

  return (
    <div>
      <PageHeader title="الورديات" />
      <p className="mb-5 max-w-3xl text-sm leading-6 text-muted">
        الوردية هي وقت عمل الكاشير وجلسة درج النقدية معاً. كل المبيعات
        والإجراءات ترتبط بالوردية المفتوحة، وتُحسب مدة العمل من الفتح حتى
        الإغلاق.
      </p>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-muted">جارِ تحميل الورديات…</p>
      ) : (
        <>
          {active.length > 0 ? (
            active.map((activeShift) => (
              <section
                key={activeShift.id}
                className="mb-7 overflow-hidden rounded-2xl border border-primary/25 bg-surface shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-primary/5 p-5">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Badge tone="success">وردية مفتوحة</Badge>
                      <span className="text-xs text-muted tnum">
                        #{activeShift.id}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold">
                      {activeShift.cashierName}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      بدأت {dateTime.format(new Date(activeShift.openedAt))} ·{" "}
                      {duration(activeShift.workedMinutes)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {user?.role === "admin" && (
                      <Button
                        variant="danger"
                        onClick={() =>
                          setAction({ mode: "admin-close", shift: activeShift })
                        }
                      >
                        <TriangleAlert className="size-4" /> إغلاق إداري
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    icon={Banknote}
                    label="العهدة الافتتاحية"
                    value={formatMoney(activeShift.openingFloat)}
                  />
                  <Metric
                    icon={ShoppingBag}
                    label={`المبيعات · ${activeShift.totals.ordersCount} طلب`}
                    value={formatMoney(activeShift.totals.sales)}
                  />
                  <Metric
                    icon={Tag}
                    label="الخصومات"
                    value={formatMoney(activeShift.totals.discounts)}
                  />
                  <Metric
                    icon={ArrowLeftRight}
                    label="طلبات التحويل"
                    value={String(activeShift.totals.transferRequests)}
                  />
                  <Metric
                    icon={ReceiptText}
                    label="المرتجعات"
                    value={formatMoney(activeShift.totals.refunds)}
                  />
                  <Metric
                    icon={WalletCards}
                    label="مصروفات الدرج"
                    value={formatMoney(activeShift.totals.expenses)}
                  />
                  <Metric
                    icon={Trash2}
                    label="عمليات الهالك"
                    value={String(activeShift.totals.wasteEntries)}
                  />
                  <Metric
                    icon={Clock3}
                    label="وقت العمل"
                    value={duration(activeShift.workedMinutes)}
                  />
                </div>
              </section>
            ))
          ) : (
            <section className="mb-7 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
              <LockKeyhole className="mx-auto mb-3 size-8 text-muted" />
              <h2 className="font-bold">لا توجد وردية مفتوحة</h2>
              <p className="mt-1 text-sm text-muted">
                يفتح الكاشير ورديته من الرئيسية أو نقطة البيع.
              </p>
            </section>
          )}

          <section>
            <div className="mb-3 flex items-center gap-2">
              <History className="size-5 text-primary" />
              <h2 className="text-lg font-bold">سجل الورديات</h2>
            </div>
            <ShiftHistory
              refreshKey={historyVersion}
              renderActions={(shift) =>
                shift.status === "closed" ? (
                  <div className="mt-2 flex gap-1">
                    <IconButton
                      title="إعادة فتح الوردية"
                      onClick={() => setAction({ mode: "reopen", shift })}
                      disabled={active.some(
                        (open) => open.cashierUserId === shift.cashierUserId,
                      )}
                    >
                      <RotateCcw className="size-4" />
                    </IconButton>
                    <IconButton
                      title="تصحيح النقدية"
                      onClick={() => setAction({ mode: "correction", shift })}
                    >
                      <PencilLine className="size-4" />
                    </IconButton>
                  </div>
                ) : undefined
              }
            />
          </section>
        </>
      )}

      {action && (
        <ShiftActionModal
          mode={action.mode}
          shift={action.shift}
          onClose={() => setAction(null)}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-surface p-5">
      <Icon className="mb-3 size-5 text-primary" />
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tnum">{value}</div>
    </div>
  );
}
