"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  Supplier,
  SupplierPayment,
  SupplierStatementMovement,
} from "@cashier/shared";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PaymentModal } from "@/components/suppliers/payment-modal";
import { Stat, StatStrip } from "@/components/ui/stat";
import { Table } from "@/components/ui/table";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui/states";
import { getSupplierStatement } from "@/services/suppliers-service";

export default function SupplierStatementPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SupplierStatementView />
    </Suspense>
  );
}

function SupplierStatementView() {
  const id = useSearchParams().get("id");
  const [data, setData] = useState<{
    supplier: Supplier;
    payments: SupplierPayment[];
    movements: SupplierStatementMovement[];
  } | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getSupplierStatement(Number(id)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل كشف الحساب");
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (!data) return <LoadingState />;

  const { supplier, payments, movements } = data;
  const purchasesTotal = movements
    .filter((movement) => movement.type === "purchase")
    .reduce((sum, movement) => sum + Number(movement.amount), 0);
  const paymentsTotal = payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );

  return (
    <div>
      <PageHeader
        back={{ href: "/suppliers", label: "رجوع إلى الموردين" }}
        title={`كشف حساب — ${supplier.name}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPaying(true)}>
              تسجيل دفعة
            </Button>
            <Link
              href={`/purchases/new?supplier=${supplier.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-strong"
            >
              فاتورة شراء جديدة
            </Link>
          </>
        }
      />

      {paying && (
        <PaymentModal
          supplier={supplier}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false);
            void load();
          }}
        />
      )}

      <StatStrip className="mb-6">
        <Stat
          label="الرصيد الافتتاحي"
          value={formatMoney(supplier.openingBalance)}
        />
        <Stat label="إجمالي المشتريات" value={formatMoney(purchasesTotal)} />
        <Stat label="إجمالي المدفوعات" value={formatMoney(paymentsTotal)} />
        <Stat
          label="الرصيد المستحق"
          value={formatMoney(supplier.balance)}
          tone={Number(supplier.balance) > 0 ? "danger" : "default"}
        />
      </StatStrip>

      {movements.length === 0 ? (
        <EmptyState
          title="لا توجد حركات"
          description="لا توجد مشتريات أو دفعات مسجلة لهذا المورد."
        />
      ) : (
        <Table
          headers={["التاريخ", "البيان", "المبلغ", "الرصيد بعد الحركة"]}
        >
          {movements.map((movement) => (
            <tr key={movement.id}>
              <td className="tnum px-4 py-3">{movement.date}</td>
              <td className="px-4 py-3">
                {movement.type === "purchase" ? (
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/purchases/detail?id=${movement.referenceId}`}
                  >
                    {movement.description}
                  </Link>
                ) : (
                  movement.description
                )}
              </td>
              <td
                className={`tnum px-4 py-3 ${movement.type === "payment" ? "text-success" : "text-danger"}`}
              >
                {movement.type === "payment" ? "−" : "+"}
                {formatMoney(Math.abs(Number(movement.amount)))}
              </td>
              <td className="tnum px-4 py-3 font-medium">
                {formatMoney(movement.balanceAfter)}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
