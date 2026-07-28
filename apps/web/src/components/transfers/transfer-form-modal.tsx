"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  InventoryStockRow,
  PurchaseInvoiceSummary,
} from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { itemLabel } from "@/lib/format";
import {
  invoiceTransferRows,
  mergeTransferLines,
  newTransferLine,
  selectedTransferLines,
  transferRequestBody,
  transferTotalQuantity,
  type InvoiceTransferRow,
  type TransferLineForm,
} from "@/models/transfer-model";
import { getPurchase, listPurchases } from "@/services/purchases-service";
import {
  createDirectTransfer,
  createTransferRequest,
} from "@/services/transfers-service";

type SourceTab = "invoice" | "manual";

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
  // invoices are an admin-only API, so the shortcut only exists for direct transfers
  const invoiceSourceAllowed = mode === "direct";
  const [tab, setTab] = useState<SourceTab>(
    invoiceSourceAllowed ? "invoice" : "manual",
  );
  const [invoices, setInvoices] = useState<PurchaseInvoiceSummary[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceRows, setInvoiceRows] = useState<InvoiceTransferRow[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const stockByItem = useMemo(
    () => new Map(mainStock.map((row) => [row.itemId, row])),
    [mainStock],
  );
  const activeItems = items.filter((item) => item.isActive);

  useEffect(() => {
    if (!invoiceSourceAllowed) return;
    let cancelled = false;
    listPurchases()
      .then((rows) => {
        if (!cancelled) setInvoices(rows);
      })
      .catch((caught) => {
        if (!cancelled)
          setInvoiceError(
            caught instanceof Error ? caught.message : "تعذر تحميل الفواتير",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceSourceAllowed]);

  async function loadInvoice(id: string) {
    setInvoiceId(id);
    setInvoiceRows([]);
    setInvoiceError("");
    if (!id) return;
    setInvoiceLoading(true);
    try {
      const invoice = await getPurchase(Number(id));
      setInvoiceRows(invoiceTransferRows(invoice.lines, mainStock));
    } catch (caught) {
      setInvoiceError(
        caught instanceof Error ? caught.message : "تعذر تحميل بنود الفاتورة",
      );
    } finally {
      setInvoiceLoading(false);
    }
  }

  function updateInvoiceRow(
    itemId: number,
    changes: Partial<InvoiceTransferRow>,
  ) {
    setInvoiceRows((current) =>
      current.map((row) =>
        row.itemId === itemId ? { ...row, ...changes } : row,
      ),
    );
  }

  function applyInvoice() {
    const applied = selectedTransferLines(invoiceRows, nextKey.current);
    if (applied.length === 0) return;
    nextKey.current += applied.length;
    setLines((current) => mergeTransferLines(current, applied));
    setTab("manual");
  }

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
      title={mode === "direct" ? "تحويل مباشر إلى المحل" : "طلب رصيد للمحل"}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-paper/70 px-3 py-2 text-xs leading-5 text-muted">
          {mode === "direct"
            ? "سيُنقل الرصيد فوراً من أقدم دفعات المخزن الرئيسي مع الاحتفاظ بتكلفتها."
            : "أرسل الكميات المطلوبة، وسيتم النقل بعد مراجعة المدير واعتماد المتاح."}
        </div>

        {invoiceSourceAllowed && (
          <div
            role="tablist"
            aria-label="طريقة اختيار الأصناف"
            className="flex gap-1 border-b border-line"
          >
            {(
              [
                { id: "invoice", label: "من فاتورة شراء" },
                { id: "manual", label: "صنف صنف" },
              ] as Array<{ id: SourceTab; label: string }>
            ).map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  tab === entry.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}

        {invoiceSourceAllowed && tab === "invoice" ? (
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">فاتورة الشراء</span>
              <select
                value={invoiceId}
                onChange={(event) => void loadInvoice(event.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">اختر الفاتورة</option>
                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {`#${invoice.id} · ${invoice.supplierName}${
                      invoice.invoiceNumber ? ` · ${invoice.invoiceNumber}` : ""
                    } · ${new Date(invoice.purchasedAt).toLocaleDateString("ar-EG")}`}
                  </option>
                ))}
              </select>
            </label>

            {invoiceError && (
              <p className="text-sm text-danger">{invoiceError}</p>
            )}
            {invoiceLoading && (
              <p className="text-sm text-muted">جارِ تحميل البنود…</p>
            )}

            {invoiceRows.length > 0 && (
              <>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>اختر البنود والكميات المراد تحويلها.</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="underline hover:text-ink"
                      onClick={() =>
                        setInvoiceRows((current) =>
                          current.map((row) => ({
                            ...row,
                            selected: Number(row.quantity) > 0,
                          })),
                        )
                      }
                    >
                      تحديد الكل
                    </button>
                    <button
                      type="button"
                      className="underline hover:text-ink"
                      onClick={() =>
                        setInvoiceRows((current) =>
                          current.map((row) => ({ ...row, selected: false })),
                        )
                      }
                    >
                      إلغاء التحديد
                    </button>
                  </div>
                </div>
                <div className="max-h-[40vh] space-y-2 overflow-y-auto pe-1">
                  {invoiceRows.map((row) => (
                    <div
                      key={row.itemId}
                      className={`rounded-xl border border-line p-3 ${
                        row.availableQuantity === 0 ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-primary"
                          checked={row.selected}
                          disabled={row.availableQuantity === 0}
                          aria-label={`تحويل ${row.name}`}
                          onChange={(event) =>
                            updateInvoiceRow(row.itemId, {
                              selected: event.target.checked,
                            })
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {itemLabel(row.code, row.name)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            بالفاتورة:{" "}
                            {row.invoiceQuantity.toLocaleString("ar-EG", {
                              maximumFractionDigits: 3,
                            })}{" "}
                            · المتاح:{" "}
                            {row.availableQuantity.toLocaleString("ar-EG", {
                              maximumFractionDigits: 3,
                            })}{" "}
                            {row.stockUnit}
                          </p>
                          {row.clamped && (
                            <p className="mt-1 text-xs text-danger">
                              {row.inactive
                                ? "الصنف موقوف ولا يمكن تحويله."
                                : row.availableQuantity === 0
                                  ? "لم يتبقَ رصيد من هذا الصنف في المخزن الرئيسي."
                                  : "الكمية المشتراة لم تعد متاحة بالكامل، وتم تخفيضها للمتاح."}
                            </p>
                          )}
                        </div>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          max={row.availableQuantity}
                          dir="ltr"
                          aria-label={`كمية ${row.name}`}
                          disabled={!row.selected}
                          value={row.quantity}
                          onChange={(event) =>
                            updateInvoiceRow(row.itemId, {
                              quantity: event.target.value,
                            })
                          }
                          className="w-28 shrink-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  onClick={applyInvoice}
                  disabled={!invoiceRows.some((row) => row.selected)}
                >
                  اعتماد البنود المحددة
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
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
                  <div
                    key={line.key}
                    className="rounded-xl border border-line p-3"
                  >
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
                            current.filter(
                              (candidate) => candidate.key !== line.key,
                            ),
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
                              {itemLabel(candidate.code, candidate.name)}
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
                        المتاح في الرئيسي:{" "}
                        {Number(stock?.quantity ?? 0).toLocaleString("ar-EG", {
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
          </>
        )}

        <TextAreaField
          label="ملاحظات (اختياري)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-xs text-muted">
            إجمالي الكميات:{" "}
            {transferTotalQuantity(lines).toLocaleString("ar-EG", {
              maximumFractionDigits: 3,
            })}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={saving || activeItems.length === 0 || tab === "invoice"}
            >
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
