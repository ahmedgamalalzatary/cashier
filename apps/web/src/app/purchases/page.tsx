"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Plus, ShoppingCart } from "lucide-react";
import type { PurchaseInvoiceSummary } from "@cashier/shared";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Stat, StatStrip } from "@/components/ui/stat";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui/states";
import { formatMoney, sumDecimalValues } from "@/lib/format";
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

  const totals = useMemo(
    () => ({
      total: sumDecimalValues(invoices.map((row) => row.totalAmount)),
      paid: sumDecimalValues(invoices.map((row) => row.paidAmount)),
      due: sumDecimalValues(invoices.map((row) => row.dueAmount)),
    }),
    [invoices],
  );

  const columns: DataColumn<PurchaseInvoiceSummary>[] = [
    {
      key: "invoiceNumber",
      header: "رقم الفاتورة",
      mobile: "primary",
      cell: (invoice) => (
        <Link
          href={`/purchases/detail?id=${invoice.id}`}
          className="block hover:text-primary"
        >
          <span className="block font-bold">
            {invoice.invoiceNumber || `#${invoice.id}`}
          </span>
          <span className="block text-xs text-muted">{invoice.supplierName}</span>
        </Link>
      ),
    },
    {
      key: "purchasedAt",
      header: "التاريخ",
      cell: (invoice) => <span className="tnum">{invoice.purchasedAt}</span>,
    },
    {
      key: "totalAmount",
      header: "الإجمالي",
      numeric: true,
      cell: (invoice) => formatMoney(invoice.totalAmount),
    },
    {
      key: "paidAmount",
      header: "المدفوع",
      numeric: true,
      cell: (invoice) => (
        <span className="text-success">{formatMoney(invoice.paidAmount)}</span>
      ),
    },
    {
      key: "dueAmount",
      header: "الآجل عند التسجيل",
      numeric: true,
      cell: (invoice) => (
        <span className={Number(invoice.dueAmount) > 0 ? "text-danger" : undefined}>
          {formatMoney(invoice.dueAmount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "سداد الفاتورة",
      cell: (invoice) => {
        const due = Number(invoice.dueAmount);
        const paid = Number(invoice.paidAmount);
        return (
          <Badge tone={due === 0 ? "success" : paid > 0 ? "neutral" : "danger"}>
            {due === 0 ? "مدفوع" : paid > 0 ? "جزئي" : "آجل"}
          </Badge>
        );
      },
    },
  ];

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

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      {!loading && invoices.length > 0 && (
        <StatStrip className="mb-5">
          <Stat label="عدد الفواتير" value={String(invoices.length)} />
          <Stat label="إجمالي المشتريات" value={formatMoney(totals.total)} />
          <Stat label="إجمالي المدفوع" value={formatMoney(totals.paid)} />
          <Stat
            label="الآجل عند التسجيل"
            value={formatMoney(totals.due)}
            tone={Number(totals.due) > 0 ? "danger" : "default"}
          />
        </StatStrip>
      )}

      {loading ? (
        <LoadingState label="جارِ تحميل فواتير الشراء…" />
      ) : (
        <DataTable
          caption="فواتير الشراء"
          rows={invoices}
          rowKey={(invoice) => invoice.id}
          columns={columns}
          empty={
            <EmptyState
              icon={<ShoppingCart className="size-8" />}
              title="لا توجد فواتير شراء بعد"
              description="سجّل أول فاتورة لإضافة الرصيد إلى المخزن الرئيسي وحساب المورد."
              action={
                <Link
                  href="/purchases/new"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-strong"
                >
                  <Plus className="size-4" /> فاتورة شراء جديدة
                </Link>
              }
            />
          }
          actions={(invoice) => (
            <Link
              href={`/purchases/detail?id=${invoice.id}`}
              aria-label={`عرض فاتورة ${invoice.invoiceNumber || invoice.id}`}
              title="عرض الفاتورة"
              className="inline-flex rounded-lg p-2 text-muted transition-colors hover:bg-line/50 hover:text-ink"
            >
              <Eye className="size-4" />
            </Link>
          )}
        />
      )}
    </div>
  );
}
