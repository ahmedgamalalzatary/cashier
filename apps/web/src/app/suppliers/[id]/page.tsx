"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { Table } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import type { Supplier } from "../supplier-modals";

import type { SupplierPayment as Payment } from "@cashier/shared";

export default function SupplierStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<{ supplier: Supplier; payments: Payment[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ supplier: Supplier; payments: Payment[] }>(`/api/suppliers/${id}/statement`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "تعذر تحميل كشف الحساب"));
  }, [id]);

  if (error) return <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-muted">جارِ التحميل…</p>;

  const { supplier, payments } = data;

  // running balance: starts at opening balance, each payment reduces it
  const rows = payments.reduce<Array<Payment & { running: number }>>((list, p) => {
    const prev = list.length > 0 ? list[list.length - 1].running : Number(supplier.openingBalance);
    return [...list, { ...p, running: prev - Number(p.amount) }];
  }, []);

  return (
    <div>
      <Link href="/suppliers" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowRight className="size-4" /> رجوع إلى الموردين
      </Link>
      <PageHeader title={`كشف حساب — ${supplier.name}`} />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="الرصيد الافتتاحي" value={formatMoney(supplier.openingBalance)} />
        <StatCard
          label="إجمالي المدفوعات"
          value={formatMoney(payments.reduce((sum, p) => sum + Number(p.amount), 0))}
        />
        <StatCard
          label="الرصيد المستحق"
          value={formatMoney(supplier.balance)}
          tone={Number(supplier.balance) > 0 ? "danger" : "success"}
        />
      </div>

      {payments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          لا توجد دفعات مسجلة لهذا المورد.
        </p>
      ) : (
        <Table headers={["التاريخ", "البيان", "المبلغ", "الرصيد بعد الحركة"]}>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 tnum">{p.paidAt}</td>
              <td className="px-4 py-3">{p.notes || "دفعة للمورد"}</td>
              <td className="px-4 py-3 tnum text-success">{formatMoney(p.amount)}</td>
              <td className="px-4 py-3 tnum font-medium">{formatMoney(p.running)}</td>
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
          tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
