"use client";

import { useEffect, useState } from "react";
import type { WasteDetail, WasteSummary } from "@cashier/shared";
import { Trash2 } from "lucide-react";
import { WasteEntryForm, wasteReasonLabels } from "@/components/waste/waste-entry-form";
import { DataTable, type DataColumn } from "@cashier/web-core/components/ui/data-table";
import { Modal } from "@cashier/web-core/components/ui/modal";
import { PageHeader } from "@cashier/web-core/components/ui/page-header";
import { Section } from "@cashier/web-core/components/ui/section";
import { EmptyState, ErrorBanner } from "@cashier/web-core/components/ui/states";
import { formatMoney } from "@cashier/web-core/lib/format";
import { getWaste, listWaste } from "@/services/waste-service";

const reasonLabels = wasteReasonLabels;

export default function WastePage() {
  const [entries, setEntries] = useState<WasteSummary[]>([]);
  const [detail, setDetail] = useState<WasteDetail | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setEntries(await listWaste());
  }

  useEffect(() => {
    let cancelled = false;
    listWaste()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: DataColumn<WasteSummary>[] = [
    {
      key: "target",
      header: "الصنف / المنتج",
      mobile: "primary",
      cell: (entry) => (
        <button
          type="button"
          onClick={() =>
            getWaste(entry.id)
              .then(setDetail)
              .catch((cause: Error) => setError(cause.message))
          }
          className="text-start font-medium transition-colors hover:text-primary"
        >
          {entry.targetName}
          {entry.sizeName ? ` — ${entry.sizeName}` : ""}
        </button>
      ),
    },
    {
      key: "warehouse",
      header: "المخزن",
      cell: (entry) => (entry.warehouse === "cafe" ? "الكافيه" : "الرئيسي"),
    },
    {
      key: "quantity",
      header: "الكمية",
      numeric: true,
      cell: (entry) =>
        Number(entry.quantity).toLocaleString("ar-EG", {
          maximumFractionDigits: 3,
        }),
    },
    {
      key: "reason",
      header: "السبب",
      cell: (entry) => reasonLabels[entry.reason] ?? entry.note,
    },
    {
      key: "cost",
      header: "تكلفة FIFO",
      numeric: true,
      cell: (entry) => formatMoney(entry.totalCost),
    },
    { key: "by", header: "المسجل", cell: (entry) => entry.recordedByName },
    {
      key: "at",
      header: "التاريخ",
      cell: (entry) => (
        <span className="text-muted">
          {new Date(entry.occurredAt).toLocaleString("ar-EG")}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="الهالك"
        description="تسجيل التالف والمنتهي والمسكوب، وتكلفته FIFO من المخزون."
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Section title="تسجيل هالك جديد">
        <WasteEntryForm
          onSaved={(entry) => {
            setDetail(entry);
            void load().catch(() =>
              setError("تم تسجيل الهالك، لكن تعذر تحديث البيانات"),
            );
          }}
        />
      </Section>

      <section className="space-y-3">
        <h2 className="font-bold">سجل الهالك</h2>
        <DataTable
          caption="سجل الهالك"
          rows={entries}
          rowKey={(entry) => entry.id}
          columns={columns}
          empty={
            <EmptyState
              icon={<Trash2 className="size-8" />}
              title="لم يُسجَّل هالك بعد"
              description="سجّل أول تالف أو منتهي الصلاحية أعلاه."
            />
          }
        />
      </section>

      {detail && (
        <Modal
          title={`تفاصيل هالك ${detail.targetName}`}
          open
          onClose={() => setDetail(null)}
        >
          <dl className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-paper p-4">
            <div>
              <dt className="text-xs text-muted">الكمية</dt>
              <dd className="tnum font-bold">{detail.quantity}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">تكلفة FIFO</dt>
              <dd className="tnum font-bold">
                {formatMoney(detail.totalCost)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">السبب</dt>
              <dd>{reasonLabels[detail.reason]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">المسجل</dt>
              <dd>{detail.recordedByName}</dd>
            </div>
            {detail.note && (
              <div className="col-span-2">
                <dt className="text-xs text-muted">ملاحظات</dt>
                <dd>{detail.note}</dd>
              </div>
            )}
          </dl>
          <div className="space-y-2">
            {detail.allocations.map((allocation) => (
              <div
                key={allocation.id}
                className="flex justify-between rounded-lg border border-line p-3"
              >
                <span>
                  {allocation.itemName} ×{" "}
                  <b className="tnum">{allocation.quantity}</b>
                </span>
                <span className="tnum text-muted">
                  {formatMoney(allocation.unitCost)}
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
