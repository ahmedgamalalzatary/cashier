"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, ReceiptText, Trash2 } from "lucide-react";
import type { Item, Supplier } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { formatMoney } from "@/lib/format";
import {
  newPurchaseLine,
  purchaseLineAmounts,
  purchaseRequestBody,
  purchaseTotal,
  type PurchaseLineForm,
} from "@/models/purchase-model";
import { listItems } from "@/services/items-service";
import { createPurchase } from "@/services/purchases-service";
import { listSuppliers } from "@/services/suppliers-service";

type PaymentMode = "credit" | "full" | "partial";

function localToday() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function PurchaseInvoiceForm() {
  const router = useRouter();
  const nextKey = useRef(2);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(localToday);
  const [notes, setNotes] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("credit");
  const [partialPaid, setPartialPaid] = useState("");
  const [lines, setLines] = useState<PurchaseLineForm[]>([newPurchaseLine(1)]);

  useEffect(() => {
    Promise.all([listSuppliers(), listItems()])
      .then(([supplierRows, itemRows]) => {
        setSuppliers(supplierRows.filter((supplier) => supplier.isActive));
        setItems(
          itemRows.filter((item) => item.isActive && item.type !== "prepared"),
        );
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "تعذر تحميل بيانات فاتورة الشراء",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const total = purchaseTotal(lines);
  const paidAmount =
    paymentMode === "full"
      ? total
      : paymentMode === "partial"
        ? Number(partialPaid) || 0
        : 0;
  const dueAmount = Math.max(0, total - paidAmount);

  function updateLine(key: number, changes: Partial<PurchaseLineForm>) {
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, ...changes } : line,
      ),
    );
  }

  function selectItem(line: PurchaseLineForm, itemId: string) {
    const item = itemMap.get(Number(itemId));
    updateLine(line.key, {
      itemId,
      unitMode: item?.purchaseUnit ? "purchase" : "stock",
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (paymentMode === "partial" && (paidAmount <= 0 || paidAmount >= total)) {
      setError(
        "الدفعة الجزئية يجب أن تكون أكبر من صفر وأقل من إجمالي الفاتورة",
      );
      return;
    }
    setSaving(true);
    try {
      const created = await createPurchase(
        purchaseRequestBody({
          supplierId,
          invoiceNumber,
          purchasedAt,
          paidAmount,
          notes,
          lines,
        }),
      );
      router.push(`/purchases/${created.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر حفظ فاتورة الشراء",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted">جارِ تجهيز الفاتورة…</p>;

  return (
    <form
      onSubmit={submit}
      className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]"
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center gap-2 border-b border-line pb-3">
            <ReceiptText className="size-5 text-primary" />
            <h2 className="font-bold">بيانات الفاتورة</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <SelectField
              label="المورد"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              required
            >
              <option value="" disabled>
                اختر المورد
              </option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </SelectField>
            <Field
              label="رقم فاتورة المورد (اختياري)"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              maxLength={100}
            />
            <Field
              label="تاريخ الشراء"
              type="date"
              value={purchasedAt}
              onChange={(event) => setPurchasedAt(event.target.value)}
              required
              dir="ltr"
            />
          </div>
          <div className="mt-4">
            <TextAreaField
              label="ملاحظات (اختياري)"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="font-bold">أصناف الفاتورة</h2>
              <p className="mt-0.5 text-xs text-muted">
                أدخل الكمية بنفس الوحدة المكتوبة في فاتورة المورد.
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  newPurchaseLine(nextKey.current++),
                ])
              }
            >
              <Plus className="size-4" /> إضافة صنف
            </Button>
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => {
              const item = itemMap.get(Number(line.itemId));
              const amounts = purchaseLineAmounts(line, item);
              const selectedElsewhere = new Set(
                lines
                  .filter((candidate) => candidate.key !== line.key)
                  .map((candidate) => Number(candidate.itemId)),
              );
              return (
                <div
                  key={line.key}
                  className="rounded-xl border border-line bg-paper/45 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex size-7 items-center justify-center rounded-full bg-sidebar text-xs font-bold text-accent">
                      {index + 1}
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
                      className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1.5fr)_9rem_8rem_9rem]">
                    <SelectField
                      label="الصنف"
                      value={line.itemId}
                      onChange={(event) => selectItem(line, event.target.value)}
                      required
                    >
                      <option value="" disabled>
                        اختر الصنف
                      </option>
                      {items.map((candidate) => (
                        <option
                          key={candidate.id}
                          value={candidate.id}
                          disabled={selectedElsewhere.has(candidate.id)}
                        >
                          {candidate.name}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="الوحدة"
                      value={line.unitMode}
                      onChange={(event) =>
                        updateLine(line.key, {
                          unitMode: event.target.value as "stock" | "purchase",
                        })
                      }
                      disabled={!item}
                    >
                      {item?.purchaseUnit && (
                        <option value="purchase">{item.purchaseUnit}</option>
                      )}
                      <option value="stock">
                        {item?.stockUnit ?? "وحدة المخزون"}
                      </option>
                    </SelectField>
                    <Field
                      label="الكمية"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.key, { quantity: event.target.value })
                      }
                      required
                      dir="ltr"
                    />
                    <Field
                      label="سعر الوحدة"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateLine(line.key, { unitPrice: event.target.value })
                      }
                      required
                      dir="ltr"
                    />
                  </div>
                  {item && (
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                      <span>
                        يدخل المخزن:{" "}
                        <b className="tnum text-ink">
                          {amounts.stockQuantity.toLocaleString("ar-EG", {
                            maximumFractionDigits: 3,
                          })}{" "}
                          {item.stockUnit}
                        </b>
                      </span>
                      <span>
                        إجمالي السطر:{" "}
                        <b className="tnum text-ink">
                          {formatMoney(amounts.lineTotal)}
                        </b>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="receipt-card sticky top-5 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_50px_rgb(43_33_24/0.10)]">
        <div className="bg-sidebar px-5 py-4 text-white">
          <p className="text-xs text-sidebar-ink">تسوية الفاتورة</p>
          <p className="tnum mt-1 text-3xl font-bold text-accent">
            {formatMoney(total)}
          </p>
        </div>
        <div className="space-y-4 p-5">
          <SelectField
            label="طريقة السداد"
            value={paymentMode}
            onChange={(event) =>
              setPaymentMode(event.target.value as PaymentMode)
            }
          >
            <option value="credit">آجل بالكامل</option>
            <option value="partial">دفعة جزئية</option>
            <option value="full">مدفوع بالكامل</option>
          </SelectField>
          {paymentMode === "partial" && (
            <Field
              label="المدفوع الآن"
              type="number"
              min="0.01"
              max={Math.max(0, total - 0.01)}
              step="0.01"
              value={partialPaid}
              onChange={(event) => setPartialPaid(event.target.value)}
              required
              dir="ltr"
            />
          )}
          <dl className="space-y-2 border-y border-dashed border-line py-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">الإجمالي</dt>
              <dd className="tnum font-medium">{formatMoney(total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">المدفوع</dt>
              <dd className="tnum text-success">{formatMoney(paidAmount)}</dd>
            </div>
            <div className="flex justify-between text-base">
              <dt className="font-medium">المتبقي للمورد</dt>
              <dd className="tnum font-bold text-danger">
                {formatMoney(dueAmount)}
              </dd>
            </div>
          </dl>
          {error && (
            <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
              {error}
            </p>
          )}
          {suppliers.length === 0 && (
            <p className="text-sm text-danger">
              أضف مورداً نشطاً قبل تسجيل فاتورة شراء.
            </p>
          )}
          {items.length === 0 && (
            <p className="text-sm text-danger">
              أضف صنفاً خاماً أو لإعادة البيع قبل تسجيل الفاتورة.
            </p>
          )}
          <Button
            type="submit"
            className="w-full justify-center"
            disabled={
              saving ||
              total <= 0 ||
              suppliers.length === 0 ||
              items.length === 0
            }
          >
            {saving ? "جارِ تأكيد الفاتورة…" : "تأكيد وإضافة للمخزن"}
          </Button>
          <p className="text-center text-xs leading-5 text-muted">
            بعد التأكيد لا يمكن تعديل الفاتورة؛ تضاف الكميات فوراً إلى المخزن
            الرئيسي.
          </p>
        </div>
      </aside>
    </form>
  );
}

function SelectField({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <select
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
