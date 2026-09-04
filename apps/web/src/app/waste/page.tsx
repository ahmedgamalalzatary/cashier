"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  WasteCatalog,
  WasteDetail,
  WasteReason,
  WasteSummary,
} from "@cashier/shared";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import {
  createWaste,
  getWaste,
  getWasteCatalog,
  listWaste,
  type CreateWasteBody,
} from "@/services/waste-service";

const reasonLabels: Record<WasteReason, string> = {
  expired: "منتهي الصلاحية",
  damaged: "تالف",
  preparation_mistake: "خطأ تحضير",
  spill: "انسكاب",
  other: "سبب آخر",
};

export default function WastePage() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<WasteCatalog>({
    items: [],
    products: [],
  });
  const [entries, setEntries] = useState<WasteSummary[]>([]);
  const [targetKey, setTargetKey] = useState("");
  const [warehouse, setWarehouse] = useState<"main" | "cafe">("cafe");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<WasteReason>("damaged");
  const [note, setNote] = useState("");
  const [clientRequestId, setClientRequestId] = useState(() =>
    crypto.randomUUID(),
  );
  const [detail, setDetail] = useState<WasteDetail | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [nextCatalog, nextEntries] = await Promise.all([
      getWasteCatalog(),
      listWaste(),
    ]);
    setCatalog(nextCatalog);
    setEntries(nextEntries);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([getWasteCatalog(), listWaste()])
      .then(([nextCatalog, nextEntries]) => {
        if (cancelled) return;
        setCatalog(nextCatalog);
        setEntries(nextEntries);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const targets = useMemo(
    () => [
      ...catalog.items.map((item) => ({
        key: `item:${item.id}`,
        label: `${item.name} — ${item.stockUnit}`,
      })),
      ...catalog.products.map((product) => ({
        key: `product:${product.externalProductId}:${product.externalSizeId ?? 0}`,
        label: `${product.productName}${product.sizeName ? ` — ${product.sizeName}` : ""}`,
      })),
    ],
    [catalog],
  );

  async function submit() {
    const [type, idText, sizeText] = targetKey.split(":");
    if (!idText) return;
    const target: CreateWasteBody["target"] =
      type === "product"
        ? {
            type: "external_product",
            externalProductId: Number(idText),
            externalSizeId: Number(sizeText) || null,
          }
        : { type: "item", itemId: Number(idText) };
    setSaving(true);
    setError("");
    try {
      const created = await createWaste({
        clientRequestId,
        warehouse,
        target,
        quantity: Number(quantity),
        reason,
        note: note.trim() || null,
      });
      setDetail(created);
      setTargetKey("");
      setQuantity("");
      setNote("");
      setClientRequestId(crypto.randomUUID());
      try {
        await load();
      } catch {
        setError("تم تسجيل الهالك، لكن تعذر تحديث البيانات");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الهالك");
    } finally {
      setSaving(false);
    }
  }

  const selectedProduct = targetKey.startsWith("product:");
  const valid =
    targetKey &&
    Number(quantity) > 0 &&
    (!selectedProduct || Number.isInteger(Number(quantity))) &&
    (reason !== "other" || note.trim().length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="الهالك" />
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-4 font-bold">تسجيل هالك جديد</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {user?.role === "admin" && (
            <select
              aria-label="المخزن"
              disabled={saving}
              value={warehouse}
              onChange={(event) => {
                setWarehouse(event.target.value as "main" | "cafe");
                setClientRequestId(crypto.randomUUID());
              }}
              className="h-11 rounded-xl border border-line bg-paper px-3"
            >
              <option value="cafe">مخزن الكافيه</option>
              <option value="main">المخزن الرئيسي</option>
            </select>
          )}
          <select
            aria-label="الصنف أو المنتج"
            disabled={saving}
            value={targetKey}
            onChange={(event) => {
              setTargetKey(event.target.value);
              setClientRequestId(crypto.randomUUID());
              if (event.target.value.startsWith("product:"))
                setWarehouse("cafe");
            }}
            className="h-11 rounded-xl border border-line bg-paper px-3"
          >
            <option value="">اختر الصنف أو منتج الوصفة</option>
            {targets.map((target) => (
              <option key={target.key} value={target.key}>
                {target.label}
              </option>
            ))}
          </select>
          <input
            aria-label="الكمية"
            disabled={saving}
            type="number"
            min="0"
            step={selectedProduct ? 1 : 0.001}
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              setClientRequestId(crypto.randomUUID());
            }}
            placeholder="الكمية"
            className="h-11 rounded-xl border border-line bg-paper px-3 tnum"
          />
          <select
            aria-label="سبب الهالك"
            disabled={saving}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value as WasteReason);
              setClientRequestId(crypto.randomUUID());
            }}
            className="h-11 rounded-xl border border-line bg-paper px-3"
          >
            {Object.entries(reasonLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <textarea
            aria-label="ملاحظات الهالك"
            disabled={saving}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setClientRequestId(crypto.randomUUID());
            }}
            placeholder={
              reason === "other" ? "اكتب السبب (مطلوب)" : "ملاحظات اختيارية"
            }
            maxLength={500}
            className="min-h-24 rounded-xl border border-line bg-paper p-3 md:col-span-2"
          />
        </div>
        <Button
          onClick={submit}
          disabled={saving || !valid}
          className="mt-4 justify-center"
        >
          <Trash2 className="size-4" />
          {saving ? "جارِ التسجيل…" : "تسجيل الهالك"}
        </Button>
      </section>

      <section className="rounded-2xl border border-line bg-surface">
        <h2 className="border-b border-line p-4 font-bold">سجل الهالك</h2>
        <Table
          headers={[
            "الصنف / المنتج",
            "المخزن",
            "الكمية",
            "السبب",
            "تكلفة FIFO",
            "المسجل",
            "التاريخ",
          ]}
        >
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>
                <button
                  type="button"
                  onClick={() =>
                    getWaste(entry.id)
                      .then(setDetail)
                      .catch((cause: Error) => setError(cause.message))
                  }
                  className="font-medium hover:text-primary"
                >
                  {entry.targetName}{" "}
                  {entry.sizeName ? `— ${entry.sizeName}` : ""}
                </button>
              </td>
              <td>{entry.warehouse === "cafe" ? "الكافيه" : "الرئيسي"}</td>
              <td className="tnum">{entry.quantity}</td>
              <td>{reasonLabels[entry.reason] ?? entry.note}</td>
              <td className="tnum">{formatMoney(entry.totalCost)}</td>
              <td>{entry.recordedByName}</td>
              <td>{new Date(entry.occurredAt).toLocaleString("ar-EG")}</td>
            </tr>
          ))}
        </Table>
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
