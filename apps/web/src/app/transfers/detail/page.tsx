"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import type { TransferDetail } from "@cashier/shared";
import { useAuth } from "@cashier/web-core/components/auth/auth-provider";
import { PageHeader } from "@cashier/web-core/components/ui/page-header";
import { Button } from "@cashier/web-core/components/ui/button";
import { Stat, StatStrip } from "@cashier/web-core/components/ui/stat";
import { Table } from "@cashier/web-core/components/ui/table";
import { ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { formatOptionalMoney, itemLabel } from "@cashier/web-core/lib/format";
import { PrintSlip } from "@/components/print/print-slip";
import { TransferDocument } from "@/components/transfers/transfer-document";
import { getTransfer } from "@/services/transfers-service";

const cairoDateTime = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "Africa/Cairo",
  dateStyle: "medium",
  timeStyle: "short",
});

export default function TransferDetailPage() {
  return (
    <Suspense fallback={<LoadingState label="جارِ تحميل التحويل…" />}>
      <TransferDetailView />
    </Suspense>
  );
}

function TransferDetailView() {
  const id = useSearchParams().get("id");
  const isAdmin = useAuth().user?.role === "admin";
  const [transfer, setTransfer] = useState<TransferDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    getTransfer(id)
      .then(setTransfer)
      .catch((caught) =>
        setError(
          caught instanceof Error ? caught.message : "تعذر تحميل التحويل",
        ),
      );
  }, [id]);

  if (!id) return <ErrorBanner>لم يتم تحديد السجل</ErrorBanner>;
  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (!transfer) return <LoadingState label="جارِ تحميل التحويل…" />;

  return (
    <div>
      <PageHeader
        back={{ href: "/transfers", label: "رجوع إلى التحويلات" }}
        title={`تحويل مخزني #${transfer.id}`}
        actions={
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> طباعة المستند
          </Button>
        }
      />

      {transfer.isNegativeStock && (
        <ErrorBanner className="mb-4">
          رصيد سالب: تم تحويل كمية أكبر من المتاح في المخزن الرئيسي، وسُجِّلت
          الزيادة بتكلفة آخر دفعة معروفة.
        </ErrorBanner>
      )}

      <StatStrip className="mb-5">
        <Stat
          label="المصدر"
          value={
            transfer.requestId
              ? `طلب تحويل #${transfer.requestId}`
              : "تحويل مباشر"
          }
        />
        <Stat label="صاحب الطلب" value={transfer.createdByName} />
        <Stat label="اعتمد التحويل" value={transfer.approvedByName} />
        {transfer.requestCreatedAt && (
          <Stat
            label="وقت الطلب"
            value={cairoDateTime.format(new Date(transfer.requestCreatedAt))}
          />
        )}
        {transfer.requestReviewedAt && (
          <Stat
            label="وقت الاعتماد"
            value={cairoDateTime.format(new Date(transfer.requestReviewedAt))}
          />
        )}
        <Stat
          label="وقت التنفيذ"
          value={cairoDateTime.format(new Date(transfer.createdAt))}
        />
      </StatStrip>

      <Table
        headers={
          isAdmin
            ? [
                "الصنف",
                "الكمية",
                "تكلفة الوحدة",
                "تكلفة الدفعة",
                "دفعة الرئيسي",
                "دفعة الكافيه",
              ]
            : ["الصنف", "الكمية", "دفعة الرئيسي", "دفعة الكافيه"]
        }
      >
        {transfer.lines.map((line) => (
          <tr key={line.id}>
            <td className="px-4 py-3 font-medium">
              {itemLabel(line.itemCode, line.itemName)}
            </td>
            <td className="tnum px-4 py-3">
              {Number(line.quantity).toLocaleString("ar-EG", {
                maximumFractionDigits: 3,
              })}{" "}
              {line.stockUnit}
            </td>
            {isAdmin && (
              <>
                <td className="tnum px-4 py-3">
                  {formatOptionalMoney(line.unitCost)}
                </td>
                <td className="tnum px-4 py-3 font-medium">
                  {formatOptionalMoney(line.lineCost)}
                </td>
              </>
            )}
            <td className="tnum px-4 py-3 text-muted">
              {line.sourceBatchId ? `#${line.sourceBatchId}` : "—"}
            </td>
            <td className="tnum px-4 py-3 text-muted">#{line.cafeBatchId}</td>
          </tr>
        ))}
      </Table>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_20rem]">
        <div className="sheet p-4">
          <p className="text-xs text-muted">ملاحظات</p>
          <p className="mt-1 text-sm">{transfer.notes || "لا توجد ملاحظات"}</p>
        </div>
        {isAdmin && (
          <div className="rounded-xl bg-sidebar p-5 text-white">
            <p className="text-xs text-sidebar-ink">
              إجمالي تكلفة التحويل FIFO
            </p>
            <p className="tnum mt-2 text-3xl font-bold text-accent">
              {formatOptionalMoney(transfer.totalCost)}
            </p>
          </div>
        )}
      </div>

      <PrintSlip>
        <TransferDocument transfer={transfer} />
      </PrintSlip>
    </div>
  );
}
