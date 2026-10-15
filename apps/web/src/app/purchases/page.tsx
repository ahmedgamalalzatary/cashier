"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Eye, Plus, ShoppingCart } from "lucide-react";
import type { InventoryStockRow, PurchaseInvoiceSummary } from "@cashier/shared";
import { Badge } from "@cashier/web-core/components/ui/badge";
import { DataTable, type DataColumn } from "@cashier/web-core/components/ui/data-table";
import { IconButton } from "@cashier/web-core/components/ui/icon-button";
import { PageHeader } from "@cashier/web-core/components/ui/page-header";
import { Stat, StatStrip } from "@cashier/web-core/components/ui/stat";
import { EmptyState, ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { formatMoney, sumDecimalValues } from "@cashier/web-core/lib/format";
import { TransferFormModal } from "@/components/transfers/transfer-form-modal";
import { purchaseStatusLabel, purchaseStatusTone } from "@/models/purchase-model";
import {
  getCafeWarehouseStock,
  getMainWarehouseStock,
} from "@/services/inventory-service";
import { listPurchases } from "@/services/purchases-service";

export default function PurchasesPage() {
  const [invoices, setInvoices] = useState<PurchaseInvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stock, setStock] = useState<InventoryStockRow[]>([]);
  const [mainStock, setMainStock] = useState<InventoryStockRow[]>([]);
  const [transferringId, setTransferringId] = useState<string | null>(null);

  const load = async () => {
    try {
      setInvoices(await listPurchases());
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحميل فواتير الشراء",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      // the transfer modal needs both warehouses beside the capped invoice lines
      await Promise.all([
        load(),
        getCafeWarehouseStock().then(setStock).catch(() => undefined),
        getMainWarehouseStock().then(setMainStock).catch(() => undefined),
      ]);
    })();
  }, []);

  const totals = useMemo(
    () => ({
      total: sumDecimalValues(invoices.map((row) => row.totalAmount)),
      paid: sumDecimalValues(invoices.map((row) => row.paidAmount)),
      remaining: sumDecimalValues(invoices.map((row) => row.remainingAmount)),
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
      header: "المدفوع عند الشراء",
      numeric: true,
      cell: (invoice) => (
        <span className="text-success">{formatMoney(invoice.paidAmount)}</span>
      ),
    },
    {
      key: "coveredAmount",
      header: "مغطى بدفعات لاحقة",
      numeric: true,
      cell: (invoice) => formatMoney(invoice.coveredAmount),
    },
    {
      key: "remainingAmount",
      header: "المتبقي",
      numeric: true,
      cell: (invoice) => (
        <span
          className={Number(invoice.remainingAmount) > 0 ? "text-danger" : undefined}
        >
          {formatMoney(invoice.remainingAmount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "سداد الفاتورة",
      cell: (invoice) => (
        <Badge tone={purchaseStatusTone(invoice.status)}>
          {purchaseStatusLabel(invoice.status)}
        </Badge>
      ),
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
            label="المتبقي"
            value={formatMoney(totals.remaining)}
            tone={Number(totals.remaining) > 0 ? "danger" : "default"}
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
            <span className="flex items-center gap-1">
              <Link
                href={`/purchases/detail?id=${invoice.id}`}
                aria-label={`عرض فاتورة ${invoice.invoiceNumber || invoice.id}`}
                title="عرض الفاتورة"
                className="inline-flex rounded-lg p-2 text-muted transition-colors hover:bg-line/50 hover:text-ink"
              >
                <Eye className="size-4" />
              </Link>
              {invoice.hasStockToTransfer && (
                <IconButton
                  title={`تحويل رصيد فاتورة ${invoice.invoiceNumber || invoice.id} إلى الكافيه`}
                  onClick={() => setTransferringId(invoice.id)}
                >
                  <ArrowLeftRight className="size-4" />
                </IconButton>
              )}
            </span>
          )}
        />
      )}

      {transferringId && (
        <TransferFormModal
          mode="direct"
          items={stock}
          mainStock={mainStock}
          initialInvoiceId={transferringId}
          onClose={() => setTransferringId(null)}
          onSaved={() => {
            setTransferringId(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
