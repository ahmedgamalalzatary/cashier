"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { TransferDetail } from "@cashier/shared";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { getTransfer } from "@/services/transfers-service";

export default function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [transfer, setTransfer] = useState<TransferDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getTransfer(Number(id))
      .then(setTransfer)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "تعذر تحميل التحويل"),
      );
  }, [id]);

  if (error) return <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>;
  if (!transfer) return <p className="text-muted">جارِ تحميل التحويل…</p>;

  return (
    <div>
      <Link href="/cafe" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowRight className="size-4" /> رجوع إلى مخزن الكافيه
      </Link>
      <PageHeader title={`تحويل مخزني #${transfer.id}`} />

      <section className="mb-5 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          <Info label="المصدر" value={transfer.requestId ? `طلب تحويل #${transfer.requestId}` : "تحويل مباشر"} />
          <Info label="صاحب الطلب" value={transfer.createdByName} />
          <Info label="اعتمد التحويل" value={transfer.approvedByName} />
          <Info label="وقت التنفيذ" value={new Date(transfer.createdAt).toLocaleString("ar-EG")} />
        </div>
      </section>

      <Table headers={["الصنف", "الكمية", "تكلفة الوحدة", "تكلفة الدفعة", "دفعة الرئيسي", "دفعة الكافيه"]}>
        {transfer.lines.map((line) => (
          <tr key={line.id}>
            <td className="px-4 py-3 font-medium">{line.itemName}</td>
            <td className="px-4 py-3 tnum">{Number(line.quantity).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} {line.stockUnit}</td>
            <td className="px-4 py-3 tnum">{formatMoney(line.unitCost)}</td>
            <td className="px-4 py-3 tnum font-medium">{formatMoney(line.lineCost)}</td>
            <td className="px-4 py-3 tnum text-muted">#{line.sourceBatchId}</td>
            <td className="px-4 py-3 tnum text-muted">#{line.cafeBatchId}</td>
          </tr>
        ))}
      </Table>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_20rem]">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">ملاحظات</p>
          <p className="mt-1 text-sm">{transfer.notes || "لا توجد ملاحظات"}</p>
        </div>
        <div className="rounded-xl bg-sidebar p-5 text-white">
          <p className="text-xs text-sidebar-ink">إجمالي تكلفة التحويل FIFO</p>
          <p className="tnum mt-2 text-3xl font-bold text-accent">{formatMoney(transfer.totalCost)}</p>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}
