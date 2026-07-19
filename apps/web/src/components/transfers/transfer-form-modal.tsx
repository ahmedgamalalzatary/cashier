"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { InventoryStockRow } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  newTransferLine,
  transferRequestBody,
  transferTotalQuantity,
  type TransferLineForm,
} from "@/models/transfer-model";
import {
  createDirectTransfer,
  createTransferRequest,
} from "@/services/transfers-service";

export function TransferFormModal({
  mode,
  items,
  mainStock,
  onClose,
  onSaved,
}: {
  mode: "request" | "direct";
  items: InventoryStockRow[];
  mainStock: InventoryStockRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const nextKey = useRef(2);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLineForm[]>([newTransferLine(1)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stockByItem = useMemo(
    () => new Map(mainStock.map((row) => [row.itemId, row])),
    [mainStock],
  );
  const activeItems = items.filter((item) => item.isActive);

  function updateLine(key: number, changes: Partial<TransferLineForm>) {
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, ...changes } : line,
      ),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = transferRequestBody({ notes, lines });
      if (mode === "direct") await createDirectTransfer(body);
      else await createTransferRequest(body);
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : mode === "direct"
            ? "تعذر تنفيذ التحويل المباشر"
            : "تعذر إرسال طلب التحويل",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "direct" ? "تحويل مباشر إلى الكافيه" : "طلب رصيد للكافيه"}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-paper/70 px-3 py-2 text-xs leading-5 text-muted">
          {mode === "direct"
            ? "سيُنقل الرصيد فوراً من أقدم دفعات المخزن الرئيسي مع الاحتفاظ بتكلفتها."
            : "أرسل الكميات المطلوبة، وسيتم النقل بعد مراجعة المدير واعتماد المتاح."}
        </div>

        <div className="max-h-[48vh] space-y-3 overflow-y-auto pe-1">
          {lines.map((line, index) => {
            const item = activeItems.find(
              (candidate) => candidate.itemId === Number(line.itemId),
            );
            const stock = stockByItem.get(Number(line.itemId));
            const usedItemIds = new Set(
              lines
                .filter((candidate) => candidate.key !== line.key)
                .map((candidate) => Number(candidate.itemId)),
            );
            return (
              <div key={line.key} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-muted">
                    الصنف {index + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={`حذف الصنف رقم ${index + 1}`}
                    title="حذف الصنف"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((candidate) => candidate.key !== line.key),
                      )
                    }
                    className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">الصنف</span>
                    <select
                      value={line.itemId}
                      required
                      onChange={(event) =>
                        updateLine(line.key, { itemId: event.target.value })
                      }
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="" disabled>
                        اختر الصنف
                      </option>
                      {activeItems.map((candidate) => (
                        <option
                          key={candidate.itemId}
                          value={candidate.itemId}
                          disabled={usedItemIds.has(candidate.itemId)}
                        >
                          {candidate.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label={`الكمية${item ? ` (${item.stockUnit})` : ""}`}
                    type="number"
                    min="0.001"
                    step="0.001"
                    max={
                      mode === "direct" && stock
                        ? Math.max(0, Number(stock.quantity))
                        : undefined
                    }
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(line.key, { quantity: event.target.value })
                    }
                    required
                    dir="ltr"
                  />
                </div>
                {mode === "direct" && item && (
                  <p className="mt-2 text-xs text-muted">
                    المتاح في الرئيسي: {Number(stock?.quantity ?? 0).toLocaleString("ar-EG", {
                      maximumFractionDigits: 3,
                    })}{" "}
                    {item.stockUnit}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <Button
          variant="ghost"
          onClick={() =>
            setLines((current) => [
              ...current,
              newTransferLine(nextKey.current++),
            ])
          }
          disabled={lines.length >= activeItems.length}
        >
          <Plus className="size-4" /> إضافة صنف
        </Button>

        <TextAreaField
          label="ملاحظات (اختياري)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-xs text-muted">
            إجمالي الكميات: {transferTotalQuantity(lines).toLocaleString("ar-EG", {
              maximumFractionDigits: 3,
            })}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={saving || activeItems.length === 0}>
              {saving
                ? "جارِ الحفظ…"
                : mode === "direct"
                  ? "تنفيذ التحويل"
                  : "إرسال الطلب"}
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
