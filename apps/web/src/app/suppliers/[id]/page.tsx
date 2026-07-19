"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type {
  Supplier,
  SupplierPayment,
  SupplierStatementMovement,
} from "@cashier/shared";
import { formatMoney } from "@/lib/format";
import { Table } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { getSupplierStatement } from "@/services/suppliers-service";

export default function SupplierStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<{
    supplier: Supplier;
    payments: SupplierPayment[];
    movements: SupplierStatementMovement[];
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getSupplierStatement(Number(id))
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "تعذر تحميل كشف الحساب"),
      );
  }, [id]);

  if (error)
    return (
      <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>
    );
  if (!data) return <p className="text-muted">جارِ التحميل…</p>;

  const { supplier, payments, movements } = data;
  const purchasesTotal = movements
    .filter((movement) => movement.type === "purchase")
    .reduce((sum, movement) => sum + Number(movement.amount), 0);

  return (
    <div>
      <Link
        href="/suppliers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowRight className="size-4" /> رجوع إلى الموردين
      </Link>
      <PageHeader title={`كشف حساب — ${supplier.name}`} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="الرصيد الافتتاحي"
          value={formatMoney(supplier.openingBalance)}
        />
        <StatCard
          label="إجمالي المشتريات"
          value={formatMoney(purchasesTotal)}
        />
        <StatCard
          label="إجمالي المدفوعات"
          value={formatMoney(
            payments.reduce((sum, p) => sum + Number(p.amount), 0),
          )}
        />
        <StatCard
          label="الرصيد المستحق"
          value={formatMoney(supplier.balance)}
          tone={Number(supplier.balance) > 0 ? "danger" : "success"}
        />
      </div>

      {movements.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          لا توجد مشتريات أو دفعات مسجلة لهذا المورد.
        </p>
      ) : (
        <Table headers={["التاريخ", "البيان", "المبلغ", "الرصيد بعد الحركة"]}>
          {movements.map((movement) => (
            <tr key={movement.id}>
              <td className="px-4 py-3 tnum">{movement.date}</td>
              <td className="px-4 py-3">
                {movement.type === "purchase" ? (
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/purchases/${movement.referenceId}`}
                  >
                    {movement.description}
                  </Link>
                ) : (
                  movement.description
                )}
              </td>
              <td
                className={`px-4 py-3 tnum ${movement.type === "payment" ? "text-success" : "text-danger"}`}
              >
                {movement.type === "payment" ? "−" : "+"}
                {formatMoney(Math.abs(Number(movement.amount)))}
              </td>
              <td className="px-4 py-3 tnum font-medium">
                {formatMoney(movement.balanceAfter)}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 text-lg font-bold tnum ${
          tone === "danger"
            ? "text-danger"
            : tone === "success"
              ? "text-success"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
