"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PurchaseInvoiceDetail, Supplier } from "@cashier/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PaymentModal } from "@/components/suppliers/payment-modal";
import { Stat, StatStrip } from "@/components/ui/stat";
import { Table } from "@/components/ui/table";
import { ErrorBanner, LoadingState } from "@/components/ui/states";
import { formatMoney, itemLabel } from "@/lib/format";
import { getPurchase } from "@/services/purchases-service";
import { getSupplierStatement } from "@/services/suppliers-service";

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
  const [paying, setPaying] = useState<Supplier | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setInvoice(await getPurchase(Number(id)));
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحميل فاتورة الشراء",
      );
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (!invoice) return <LoadingState label="جارِ تحميل الفاتورة…" />;

  async function openPayment() {
    if (!invoice) return;
    try {
      const statement = await getSupplierStatement(invoice.supplierId);
      setPaymentError("");
      setPaying(statement.supplier);
    } catch (caught) {
      setPaymentError(
        caught instanceof Error ? caught.message : "تعذر تحميل بيانات المورد",
      );
    }
  }

  const due = Number(invoice.dueAmount);
  const paid = Number(invoice.paidAmount);

  return (
    <div>
      <PageHeader
        back={{ href: "/purchases", label: "رجوع إلى المشتريات" }}
        title={`فاتورة شراء ${invoice.invoiceNumber || `#${invoice.id}`}`}
        actions={
          <>
            <Link
              href={`/transfers?direct=1&invoice=${invoice.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-strong"
            >
              تحويل إلى الكافيه
            </Link>
            <Button variant="secondary" onClick={() => void openPayment()}>
              دفعة على حساب المورد
            </Button>
            <Badge tone={due === 0 ? "success" : paid > 0 ? "neutral" : "danger"}>
              {due === 0
                ? "مدفوعة بالكامل عند الشراء"
                : paid > 0
                  ? "دفعة جزئية عند الشراء"
                  : "آجلة بالكامل عند الشراء"}
            </Badge>
          </>
        }
      />

      {paymentError && <ErrorBanner className="mb-4">{paymentError}</ErrorBanner>}
      {paying && (
        <PaymentModal
          key={paying.id}
          supplier={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            setPaymentSaved(true);
          }}
        />
      )}
      {paymentSaved && (
        <p className="mb-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm">
          سُجّلت الدفعة على حساب المورد، ولا تغيّر بيانات هذه الفاتورة.{" "}
          <Link
            href={`/suppliers/statement?id=${invoice.supplierId}`}
            className="font-medium text-primary underline"
          >
            عرض كشف حساب المورد
          </Link>
        </p>
      )}

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
            <dt className="text-sidebar-ink">المدفوع عند الشراء</dt>
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
