"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PurchaseInvoiceDetail } from "@cashier/shared";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { getPurchase } from "@/services/purchases-service";

export default function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
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

  if (error)
    return (
      <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>
    );
  if (!invoice) return <p className="text-muted">جارِ تحميل الفاتورة…</p>;

  const due = Number(invoice.dueAmount);
  return (
    <div>
      <Link
        href="/purchases"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowRight className="size-4" /> رجوع إلى المشتريات
      </Link>
      <PageHeader
        title={`فاتورة شراء ${invoice.invoiceNumber || `#${invoice.id}`}`}
      />

      <section className="mb-5 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          <Info label="المورد" value={invoice.supplierName} />
          <Info label="تاريخ الشراء" value={invoice.purchasedAt} numeric />
          <Info label="سجلها" value={invoice.createdByName} />
          <div className="bg-surface p-4">
            <p className="text-xs text-muted">السداد عند التسجيل</p>
            <div className="mt-2">
              <Badge
                tone={
                  due === 0
                    ? "success"
                    : Number(invoice.paidAmount) > 0
                      ? "neutral"
                      : "danger"
                }
              >
                {due === 0
                  ? "مدفوع بالكامل"
                  : Number(invoice.paidAmount) > 0
                    ? "دفعة جزئية"
                    : "آجل بالكامل"}
              </Badge>
            </div>
          </div>
        </div>
      </section>

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
            <td className="px-4 py-3 font-medium">{line.itemName}</td>
            <td className="px-4 py-3 tnum">
              {Number(line.quantity).toLocaleString("ar-EG", {
                maximumFractionDigits: 3,
              })}{" "}
              {line.unitName}
            </td>
            <td className="px-4 py-3 tnum">{formatMoney(line.unitPrice)}</td>
            <td className="px-4 py-3 tnum">
              {Number(line.stockQuantity).toLocaleString("ar-EG", {
                maximumFractionDigits: 3,
              })}{" "}
              {line.stockUnit}
            </td>
            <td className="px-4 py-3 tnum text-muted">
              {formatMoney(line.unitCost)}
            </td>
            <td className="px-4 py-3 tnum font-medium">
              {formatMoney(line.lineTotal)}
            </td>
          </tr>
        ))}
      </Table>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_20rem]">
        <div className="rounded-xl border border-line bg-surface p-4">
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
    </div>
  );
}

function Info({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-medium ${numeric ? "tnum" : ""}`}>{value}</p>
    </div>
  );
}
