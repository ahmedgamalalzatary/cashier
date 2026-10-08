"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  InventoryStockRow,
  PurchaseInvoiceSummary,
} from "@cashier/shared";
import { Button } from "@cashier/web-core/components/ui/button";
import { Field, TextAreaField } from "@cashier/web-core/components/ui/field";
import { Modal } from "@cashier/web-core/components/ui/modal";
import { SearchSelect } from "@cashier/web-core/components/ui/search-select";
import { itemLabel } from "@cashier/web-core/lib/format";
import {
  invoiceTransferRows,
  newTransferLine,
  selectedTransferLines,
  transferDirectBody,
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

const quantity = (value: string | number | undefined) =>
  Number(value ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

export function TransferFormModal({
  mode,
  items,
  mainStock,
  initialInvoiceId,
  onClose,
  onSaved,
}: {
  mode: "request" | "direct";
  items: InventoryStockRow[];
  mainStock: InventoryStockRow[];
  initialInvoiceId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const nextKey = useRef(2);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLineForm[]>([newTransferLine(1)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [clientRequestId, setClientRequestId] = useState(() =>
    crypto.randomUUID(),
  );
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
  // the invoice the applied lines came from, so the API can cap them to what
  // the invoice still owes the cafe
  const [appliedInvoiceId, setAppliedInvoiceId] = useState<string | null>(null);
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

  // A purchase invoice can hand the user straight here (?direct=1&invoice=id)
  useEffect(() => {
    if (invoiceSourceAllowed && initialInvoiceId !== undefined) {
      void loadInvoice(String(initialInvoiceId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInvoiceId, invoiceSourceAllowed]);

  async function loadInvoice(id: string) {
    setInvoiceId(id);
    setInvoiceRows([]);
    setInvoiceError("");
    if (!id) return;
    setInvoiceLoading(true);
    try {
      const invoice = await getPurchase(id);
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
    itemId: string,
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
    // the transfer becomes exactly what the invoice offers: merging would keep
    // hand-entered lines and then claim invoice quantities for items the
    // invoice never bought
    setLines(applied);
    setAppliedInvoiceId(invoiceId);
    setTab("manual");
  }

  function updateLine(key: number, changes: Partial<TransferLineForm>) {
    // a hand-edited line is no longer the invoice's own quantity
    setAppliedInvoiceId(null);
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, ...changes } : line,
      ),
    );
  }

  function addLine() {
    // an added line is not part of the invoice's own quantities
    setAppliedInvoiceId(null);
    setLines((current) => [
      ...current,
      newTransferLine(nextKey.current++),
    ]);
  }

  function removeLine(key: number) {
    // the invoice was applied as a whole, so dropping one line breaks the link
    setAppliedInvoiceId(null);
    setLines((current) => current.filter((line) => line.key !== key));
  }

  // the invoice link only survives while every line still comes from it
  const invoiceLinkApplies =
    mode === "direct" &&
    appliedInvoiceId !== null &&
    lines.length > 0 &&
    lines.every((line) => line.itemId !== "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (mode === "direct") {
        await createDirectTransfer(
          transferDirectBody({
            notes,
            purchaseInvoiceId: invoiceLinkApplies ? appliedInvoiceId : null,
            lines,
          }),
        );
      } else {
        await createTransferRequest(
          transferRequestBody({ clientRequestId, notes, lines }),
        );
        setClientRequestId(crypto.randomUUID());
      }
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

        {invoiceSourceAllowed && (
          <div
            role="tablist"
            aria-label="طريقة اختيار الأصناف"
            className="flex gap-1 border-b border-line"
          >
            {(
              [
                { id: "invoice", label: "من فاتورة شراء" },
                { id: "manual", label: "إدخال يدوي" },
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
                        row.availableQuantity === 0 || row.remainingQuantity === 0
                          ? "opacity-60"
                          : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-primary"
                          checked={row.selected}
                          disabled={row.availableQuantity === 0 || row.remainingQuantity === 0}
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
                            })}
                            {row.transferredQuantity > 0 && (
                              <>
                                {" "}
                                · حُوِّل للكافيه:{" "}
                                {row.transferredQuantity.toLocaleString("ar-EG", {
                                  maximumFractionDigits: 3,
                                })}
                              </>
                            )}{" "}
                            · المتبقي:{" "}
                            {row.remainingQuantity.toLocaleString("ar-EG", {
                              maximumFractionDigits: 3,
                            })}{" "}
                            · المتاح في الرئيسي:{" "}
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
                                  : "الكمية المتبقية من الفاتورة لم تعد متاحة بالكامل، وتم تخفيضها للمتاح."}
                            </p>
                          )}
                        </div>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          max={Math.min(row.remainingQuantity, row.availableQuantity)}
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
                  (candidate) => candidate.itemId === line.itemId,
                );
                const stock = stockByItem.get(line.itemId);
                const usedItemIds = new Set(
                  lines
                    .filter((candidate) => candidate.key !== line.key)
                    .map((candidate) => candidate.itemId),
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
                        onClick={() => removeLine(line.key)}
                        className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                      <SearchSelect
                        label="الصنف"
                        value={line.itemId}
                        onChange={(itemId) =>
                          updateLine(line.key, { itemId })
                        }
                        options={activeItems.map((candidate) => ({
                          value: candidate.itemId,
                          label: itemLabel(candidate.code, candidate.name),
                          hint:
                            mode === "direct"
                              ? `في الكافيه: ${quantity(candidate.quantity)} · في الرئيسي: ${quantity(stockByItem.get(candidate.itemId)?.quantity)} ${candidate.stockUnit}`
                              : `في الكافيه: ${quantity(candidate.quantity)} ${candidate.stockUnit}`,
                          disabled: usedItemIds.has(candidate.itemId),
                        }))}
                        placeholder="اختر الصنف"
                        required
                      />
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
                    {mode === "direct" ? (
                      item && (
                        <p className="mt-2 text-xs text-muted">
                          المتاح في الرئيسي: {quantity(stock?.quantity)}{" "}
                          {item.stockUnit}
                        </p>
                      )
                    ) : (
                      item && (
                        <p className="mt-2 text-xs text-muted">
                          الرصيد الحالي في الكافيه: {quantity(item.quantity)}{" "}
                          {item.stockUnit}
                        </p>
                      )
                    )}
                  </div>
                );
              })}
            </div>

            <Button variant="ghost" onClick={addLine} disabled={lines.length >= activeItems.length}>
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
          {tab === "invoice" && (
            <p className="basis-full text-xs text-muted">
              حدد البنود ثم اضغط «اعتماد البنود المحددة» لنقلها إلى الطلب قبل الإرسال.
            </p>
          )}
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
