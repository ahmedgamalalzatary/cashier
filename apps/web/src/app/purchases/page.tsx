"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Plus, ShoppingCart } from "lucide-react";
import type { PurchaseInvoiceSummary } from "@cashier/shared";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { listPurchases } from "@/services/purchases-service";

export default function PurchasesPage() {
  const [invoices, setInvoices] = useState<PurchaseInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listPurchases()
      .then(setInvoices)
      .catch((caught) =>
        setError(
          caught instanceof Error ? caught.message : "تعذر تحميل فواتير الشراء",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="المشتريات"
        actions={
          <Link
            href="/purchases/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-strong"
          >
            <Plus className="size-4" /> فاتورة شراء جديدة
          </Link>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-muted">جارِ تحميل فواتير الشراء…</p>
      ) : invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
          <ShoppingCart className="mx-auto mb-3 size-9 text-muted" />
          <p className="font-medium">لا توجد فواتير شراء بعد</p>
          <p className="mt-1 text-sm text-muted">
            سجّل أول فاتورة لإضافة الرصيد إلى المخزن الرئيسي وحساب المورد.
          </p>
        </div>
      ) : (
        <Table
          headers={[
            "التاريخ",
            "رقم الفاتورة",
            "المورد",
            "الإجمالي",
            "المدفوع",
            "الآجل عند التسجيل",
            "سداد الفاتورة",
            "",
          ]}
        >
          {invoices.map((invoice) => {
            const due = Number(invoice.dueAmount);
            const paid = Number(invoice.paidAmount);
            return (
              <tr key={invoice.id}>
                <td className="px-4 py-3 tnum">{invoice.purchasedAt}</td>
                <td className="px-4 py-3 font-medium">
                  {invoice.invoiceNumber || `#${invoice.id}`}
                </td>
                <td className="px-4 py-3">{invoice.supplierName}</td>
                <td className="px-4 py-3 tnum">
                  {formatMoney(invoice.totalAmount)}
                </td>
                <td className="px-4 py-3 tnum text-success">
                  {formatMoney(invoice.paidAmount)}
                </td>
                <td className="px-4 py-3 tnum text-danger">
                  {formatMoney(invoice.dueAmount)}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      due === 0 ? "success" : paid > 0 ? "neutral" : "danger"
                    }
                  >
                    {due === 0 ? "مدفوع" : paid > 0 ? "جزئي" : "آجل"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/purchases/${invoice.id}`}
                    aria-label={`عرض فاتورة ${invoice.invoiceNumber || invoice.id}`}
                    title="عرض الفاتورة"
                    className="inline-flex rounded-lg p-2 text-muted hover:bg-line/50 hover:text-ink"
                  >
                    <Eye className="size-4" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
