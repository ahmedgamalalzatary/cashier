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
import { Section } from "@/components/ui/section";
import { Stat, StatStrip } from "@/components/ui/stat";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui/states";
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
      <PageHeader
        title="الورديات"
        description="الوردية هي وقت عمل الكاشير وجلسة درج النقدية معاً. كل المبيعات والإجراءات ترتبط بالوردية المفتوحة، وتُحسب مدة العمل من الفتح حتى الإغلاق."
      />

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}
      {loading ? (
        <LoadingState label="جارِ تحميل الورديات…" />
      ) : (
        <>
          {active.length > 0 ? (
            active.map((activeShift) => (
              <Section
                key={activeShift.id}
                className="mb-7"
                bodyClassName="p-0"
                title={
                  <span className="flex items-center gap-2">
                    <Badge tone="success">وردية مفتوحة</Badge>
                    {activeShift.cashierName}
                    <span className="tnum text-xs font-normal text-muted">
                      #{activeShift.id}
                    </span>
                  </span>
                }
                description={`بدأت ${dateTime.format(new Date(activeShift.openedAt))} · ${duration(activeShift.workedMinutes)}`}
                action={
                  user?.role === "admin" ? (
                    <Button
                      variant="danger"
                      onClick={() =>
                        setAction({ mode: "admin-close", shift: activeShift })
                      }
                    >
                      <TriangleAlert className="size-4" /> إغلاق إداري
                    </Button>
                  ) : undefined
                }
              >
                <StatStrip className="statline-flush">
                  <Stat
                    icon={<Banknote className="size-4" />}
                    label="العهدة الافتتاحية"
                    value={formatMoney(activeShift.openingFloat)}
                  />
                  <Stat
                    icon={<ShoppingBag className="size-4" />}
                    label={`المبيعات · ${activeShift.totals.ordersCount} طلب`}
                    value={formatMoney(activeShift.totals.sales)}
                  />
                  <Stat
                    icon={<Tag className="size-4" />}
                    label="الخصومات"
                    value={formatMoney(activeShift.totals.discounts)}
                  />
                  <Stat
                    icon={<ArrowLeftRight className="size-4" />}
                    label="طلبات التحويل"
                    value={String(activeShift.totals.transferRequests)}
                  />
                  <Stat
                    icon={<ReceiptText className="size-4" />}
                    label="المرتجعات"
                    value={formatMoney(activeShift.totals.refunds)}
                  />
                  <Stat
                    icon={<WalletCards className="size-4" />}
                    label="مصروفات الدرج"
                    value={formatMoney(activeShift.totals.expenses)}
                  />
                  <Stat
                    icon={<Trash2 className="size-4" />}
                    label="عمليات الهالك"
                    value={String(activeShift.totals.wasteEntries)}
                  />
                  <Stat
                    icon={<Clock3 className="size-4" />}
                    label="وقت العمل"
                    value={duration(activeShift.workedMinutes)}
                  />
                </StatStrip>
              </Section>
            ))
          ) : (
            <EmptyState
              className="mb-7"
              icon={<LockKeyhole className="size-8" />}
              title="لا توجد وردية مفتوحة"
              description="يفتح الكاشير ورديته من الرئيسية أو نقطة البيع."
            />
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
