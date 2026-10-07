"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Box, CalendarClock, ChefHat, User } from "lucide-react";
import type { PreparationDetail } from "@cashier/shared";
import { Badge } from "@cashier/web-core/components/ui/badge";
import { PageHeader } from "@cashier/web-core/components/ui/page-header";
import { PreparationMark } from "@/components/recipes/recipe-controls";
import { Stat, StatStrip } from "@cashier/web-core/components/ui/stat";
import { Table } from "@cashier/web-core/components/ui/table";
import { ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { formatMoney, itemLabel } from "@cashier/web-core/lib/format";
import { getPreparation } from "@/services/recipes-service";

export default function PreparationDetailPage() {
  return (
    <Suspense fallback={<LoadingState label="جارِ تحميل وثيقة التحضير…" />}>
      <PreparationDetailView />
    </Suspense>
  );
}

function PreparationDetailView() {
  const id = useSearchParams().get("id");
  const [preparation, setPreparation] = useState<PreparationDetail | null>(
    null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getPreparation(Number(id))
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
  }, [id]);

  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (!preparation)
    return <LoadingState label="جارِ تحميل وثيقة التحضير…" />;

  return (
    <div>
      <PageHeader
        back={{ href: "/recipes", label: "العودة للوصفات" }}
        title={`عملية التحضير #${preparation.id}`}
        actions={<Badge tone="success">وثيقة ثابتة</Badge>}
      />

      <StatStrip className="mb-5" tone="dark">
        <Stat
          icon={<ChefHat className="size-4" />}
          label="الوصفة"
          value={preparation.recipeName}
        />
        <Stat
          icon={<Box className="size-4" />}
          label="الناتج"
          value={`${preparation.outputItemName} · ${Number(
            preparation.producedQuantity,
          ).toLocaleString("ar-EG", {
            maximumFractionDigits: 3,
          })} ${preparation.outputStockUnit}`}
        />
        <Stat
          label="التكلفة"
          value={formatMoney(preparation.totalCost)}
        />
        <Stat
          icon={<User className="size-4" />}
          label="نفذها"
          value={preparation.preparedByName}
        />
        <Stat
          icon={<CalendarClock className="size-4" />}
          label="وقت التنفيذ"
          value={new Date(preparation.occurredAt).toLocaleString("ar-EG")}
        />
      </StatStrip>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
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

      <h2 className="mb-3 flex items-center gap-2 font-bold">
        <PreparationMark />
        دفعات المكونات المستهلكة
      </h2>
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
              {itemLabel(
                allocation.ingredientItemCode,
                allocation.ingredientItemName,
              )}
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

      {preparation.notes && (
        <section className="sheet mt-5 p-4">
          <h2 className="mb-1 text-sm font-bold">ملاحظات</h2>
          <p className="text-sm text-muted">{preparation.notes}</p>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="sheet p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="tnum mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
