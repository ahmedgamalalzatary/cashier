"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PurchaseInvoiceDetail } from "@cashier/shared";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Stat, StatStrip } from "@/components/ui/stat";
import { Table } from "@/components/ui/table";
import { ErrorBanner, LoadingState } from "@/components/ui/states";
import { formatMoney, itemLabel } from "@/lib/format";
import { getPurchase } from "@/services/purchases-service";

export default function PurchaseDetailPage() {
  return (
    <Suspense fallback={<LoadingState label="جارِ تحميل الفاتورة…" />}>
      <PurchaseDetailView />
    </Suspense>
  );
}

function PurchaseDetailView() {
  const id = useSearchParams().get("id");
  const [invoice, setInvoice] = useState<PurchaseInvoiceDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getPurchase(Number(id))
      .then(setInvoice)
      .catch((caught) =>
        setError(
          caught instanceof Error ? caught.message : "تعذر تحميل فاتورة الشراء",
        ),
      );
  }, [id]);

  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (!invoice) return <LoadingState label="جارِ تحميل الفاتورة…" />;

  const due = Number(invoice.dueAmount);
  const paid = Number(invoice.paidAmount);

  return (
    <div>
      <PageHeader
        back={{ href: "/purchases", label: "رجوع إلى المشتريات" }}
        title={`فاتورة شراء ${invoice.invoiceNumber || `#${invoice.id}`}`}
        actions={
          <Badge tone={due === 0 ? "success" : paid > 0 ? "neutral" : "danger"}>
            {due === 0
              ? "مدفوع بالكامل"
              : paid > 0
                ? "دفعة جزئية"
                : "آجل بالكامل"}
          </Badge>
        }
      />

      <StatStrip className="mb-5">
        <Stat label="المورد" value={invoice.supplierName} />
        <Stat label="تاريخ الشراء" value={invoice.purchasedAt} />
        <Stat label="سجلها" value={invoice.createdByName} />
        <Stat
          label="الإجمالي"
          value={formatMoney(invoice.totalAmount)}
        />
      </StatStrip>

      <Table
        headers={[
          "الصنف",
          "كمية الفاتورة",
          "سعر الوحدة",
          "الكمية بالمخزون",
          "تكلفة وحدة المخزون",
          "الإجمالي",
        ]}
      >
        {invoice.lines.map((line) => (
          <tr key={line.id}>
            <td className="px-4 py-3 font-medium">
              {itemLabel(line.itemCode, line.itemName)}
            </td>
            <td className="tnum px-4 py-3">
              {Number(line.quantity).toLocaleString("ar-EG", {
                maximumFractionDigits: 3,
              })}{" "}
              {line.unitName}
            </td>
            <td className="tnum px-4 py-3">{formatMoney(line.unitPrice)}</td>
            <td className="tnum px-4 py-3">
              {Number(line.stockQuantity).toLocaleString("ar-EG", {
                maximumFractionDigits: 3,
              })}{" "}
              {line.stockUnit}
            </td>
            <td className="tnum px-4 py-3 text-muted">
              {formatMoney(line.unitCost)}
            </td>
            <td className="tnum px-4 py-3 font-medium">
              {formatMoney(line.lineTotal)}
            </td>
          </tr>
        ))}
      </Table>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_20rem]">
        <div className="sheet p-4">
          <p className="text-xs text-muted">ملاحظات</p>
          <p className="mt-1 text-sm">{invoice.notes || "لا توجد ملاحظات"}</p>
        </div>
        <dl className="space-y-2 rounded-xl bg-sidebar p-5 text-sm text-white">
          <div className="flex justify-between">
            <dt className="text-sidebar-ink">الإجمالي</dt>
            <dd className="tnum font-medium">
              {formatMoney(invoice.totalAmount)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sidebar-ink">المدفوع</dt>
            <dd className="tnum text-success">
              {formatMoney(invoice.paidAmount)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-3 text-base">
            <dt className="font-medium">الآجل عند التسجيل</dt>
            <dd className="tnum font-bold text-accent">
              {formatMoney(invoice.dueAmount)}
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-4 text-sm text-muted">
        لإضافة هذه الكميات إلى مخزن الكافيه،{" "}
        <Link href="/transfers" className="font-medium text-primary hover:underline">
          أنشئ طلب تحويل
        </Link>
        .
      </p>
    </div>
  );
}
