"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Box, CalendarClock, ChefHat, User } from "lucide-react";
import type { PreparationDetail } from "@cashier/shared";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { getPreparation } from "@/services/recipes-service";

export default function PreparationDetailPage() {
  const params = useParams<{ id: string }>();
  const [preparation, setPreparation] = useState<PreparationDetail | null>(
    null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getPreparation(Number(params.id))
      .then((row) => {
        if (!cancelled) setPreparation(row);
      })
      .catch((caught) => {
        if (!cancelled)
          setError(
            caught instanceof Error
              ? caught.message
              : "تعذر تحميل عملية التحضير",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (error)
    return <p className="rounded-lg bg-danger/10 p-4 text-danger">{error}</p>;
  if (!preparation)
    return <p className="text-muted">جارِ تحميل وثيقة التحضير…</p>;

  return (
    <div>
      <PageHeader
        title={`عملية التحضير #${preparation.id}`}
        actions={
          <Link
            href="/recipes"
            className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-line/50"
          >
            <ArrowRight className="size-4" /> العودة للوصفات
          </Link>
        }
      />

      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-sidebar text-white">
        <div className="border-b border-white/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-accent/15 text-accent">
                <ChefHat className="size-5" />
              </span>
              <div>
                <p className="text-xs text-sidebar-ink">الوصفة</p>
                <h1 className="text-xl font-bold">{preparation.recipeName}</h1>
              </div>
            </div>
            <Badge tone="success">وثيقة ثابتة</Badge>
          </div>
        </div>
        <div className="grid divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-y-0 lg:grid-cols-4">
          <Fact
            icon={<Box className="size-4" />}
            label="الناتج"
            value={`${preparation.outputItemName} · ${Number(preparation.producedQuantity).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} ${preparation.outputStockUnit}`}
          />
          <Fact
            icon={<ChefHat className="size-4" />}
            label="التكلفة"
            value={formatMoney(preparation.totalCost)}
          />
          <Fact
            icon={<User className="size-4" />}
            label="نفذها"
            value={preparation.preparedByName}
          />
          <Fact
            icon={<CalendarClock className="size-4" />}
            label="وقت التنفيذ"
            value={new Date(preparation.occurredAt).toLocaleString("ar-EG")}
          />
        </div>
      </section>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Metric
          label="تكلفة وحدة الناتج"
          value={formatMoney(preparation.unitCost)}
        />
        <Metric label="دفعة الناتج" value={`#${preparation.outputBatchId}`} />
        <Metric
          label="عدد تخصيصات FIFO"
          value={String(preparation.allocations.length)}
        />
      </div>

      <section>
        <h2 className="mb-3 font-bold">دفعات المكونات المستهلكة</h2>
        <Table
          headers={[
            "المكوّن",
            "الكمية",
            "تكلفة الوحدة",
            "تكلفة التخصيص",
            "دفعة المصدر",
          ]}
        >
          {preparation.allocations.map((allocation) => (
            <tr key={allocation.id}>
              <td className="px-4 py-3 font-medium">
                {allocation.ingredientItemName}
              </td>
              <td className="tnum px-4 py-3">
                {Number(allocation.quantity).toLocaleString("ar-EG", {
                  maximumFractionDigits: 3,
                })}{" "}
                {allocation.stockUnit}
              </td>
              <td className="tnum px-4 py-3">
                {formatMoney(allocation.unitCost)}
              </td>
              <td className="tnum px-4 py-3 font-medium">
                {formatMoney(allocation.lineCost)}
              </td>
              <td className="tnum px-4 py-3 text-muted">
                #{allocation.sourceBatchId}
              </td>
            </tr>
          ))}
        </Table>
      </section>

      {preparation.notes && (
        <section className="mt-5 rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-1 text-sm font-bold">ملاحظات</h2>
          <p className="text-sm text-muted">{preparation.notes}</p>
        </section>
      )}
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <span className="mt-0.5 text-accent">{icon}</span>
      <div>
        <p className="text-xs text-sidebar-ink">{label}</p>
        <p className="mt-1 text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="tnum mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
