"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReceiptText, Trash2 } from "lucide-react";
import type { Category, Item, Supplier } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { EntityPicker } from "@/components/ui/entity-picker";
import { Field, TextAreaField } from "@/components/ui/field";
import { Section } from "@/components/ui/section";
import { SelectField } from "@/components/ui/select-field";
import { ErrorBanner } from "@/components/ui/states";
import { formatMoney, itemLabel } from "@/lib/format";
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
import { SupplierFormModal } from "@/components/suppliers/supplier-form-modal";
import { ItemFormModal } from "@/components/warehouse/item-form-modal";
import { listCategories } from "@/services/categories-service";

type PaymentMode = "credit" | "full" | "partial";

function localToday() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function PurchaseInvoiceForm() {
  const router = useRouter();
  const requestedSupplierId = useSearchParams().get("supplier");
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [itemModalLineKey, setItemModalLineKey] = useState<number | null>(null);
  const [lineNotice, setLineNotice] = useState<{
    key: number;
    text: string;
  } | null>(null);
  const [clientRequestId, setClientRequestId] = useState(() =>
    crypto.randomUUID(),
  );

  useEffect(() => {
    Promise.all([listSuppliers(), listItems(), listCategories()])
      .then(([supplierRows, itemRows, categoryRows]) => {
        const activeSuppliers = supplierRows.filter(
          (supplier) => supplier.isActive,
        );
        setSuppliers(activeSuppliers);
        setItems(
          itemRows.filter((item) => item.isActive && item.type !== "prepared"),
        );
        setCategories(categoryRows);
        // preselect only a supplier that is actually selectable
        const requested = Number(requestedSupplierId);
        if (
          requestedSupplierId &&
          activeSuppliers.some((supplier) => supplier.id === requested)
        ) {
          setSupplierId(String(requested));
        }
      })
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "تعذر تحميل بيانات فاتورة الشراء",
        ),
      )
      .finally(() => setLoading(false));
  }, [requestedSupplierId]);

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

  async function reloadSuppliers(selectId?: number) {
    try {
      const rows = await listSuppliers();
      setSuppliers(rows.filter((supplier) => supplier.isActive));
      if (selectId !== undefined) setSupplierId(String(selectId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحميل الموردين",
      );
    }
  }

  async function reloadItems(): Promise<Item[] | null> {
    try {
      const rows = await listItems();
      const usable = rows.filter(
        (item) => item.isActive && item.type !== "prepared",
      );
      setItems(usable);
      return usable;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحميل الأصناف",
      );
      return null;
    }
  }

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
      // the amount was in the previous item's unit
      toCafeQuantity: "",
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
          clientRequestId,
          supplierId,
          invoiceNumber,
          purchasedAt,
          paidAmount,
          notes,
          // displayed newest-first; save in entry order
          lines: [...lines].reverse(),
        }),
      );
      setClientRequestId(crypto.randomUUID());
      router.push(`/purchases/detail?id=${created.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر حفظ فاتورة الشراء",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">جارِ تجهيز الفاتورة…</p>;

  return (
    <>
      <form
        onSubmit={submit}
        className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]"
      >
        <div className="space-y-5">
          <Section
            title="بيانات الفاتورة"
            icon={<ReceiptText className="size-5" />}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <EntityPicker
                label="المورد"
                value={supplierId}
                onChange={setSupplierId}
                options={suppliers.map((supplier) => ({
                  value: supplier.id,
                  label: supplier.name,
                }))}
                placeholder="اختر المورد"
                createLabel="إضافة مورد جديد"
                onCreate={() => setSupplierModalOpen(true)}
                required
              />
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
          </Section>

          <Section
            title="أصناف الفاتورة"
            description="أدخل الكمية بنفس الوحدة المكتوبة في فاتورة المورد."
            action={
              <Button
                variant="ghost"
                onClick={() =>
                  setLines((current) => [
                    newPurchaseLine(nextKey.current++),
                    ...current,
                  ])
                }
              >
                + إضافة صنف
              </Button>
            }
          >
            <div className="space-y-3">
              {lines.map((line, index) => {
                // lines are newest-first, so number them from the bottom up to
                // keep each line's number stable as new ones are added on top
                const lineNumber = lines.length - index;
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
                        {lineNumber}
                      </span>
                      <button
                        type="button"
                        aria-label={`حذف الصنف رقم ${lineNumber}`}
                        title="حذف الصنف"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) =>
                            current.filter(
                              (candidate) => candidate.key !== line.key,
                            ),
                          )
                        }
                        className="rounded-lg p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1.5fr)_9rem_8rem_9rem_9rem]">
                      <EntityPicker
                        label="الصنف"
                        value={line.itemId}
                        onChange={(next) => selectItem(line, next)}
                        options={items
                          .filter(
                            (candidate) =>
                              !selectedElsewhere.has(candidate.id) ||
                              candidate.id === Number(line.itemId),
                          )
                          .map((candidate) => ({
                            value: candidate.id,
                            label: itemLabel(candidate.code, candidate.name),
                            hint: candidate.stockUnit,
                          }))}
                        placeholder="اختر الصنف"
                        createLabel="إضافة صنف جديد"
                        onCreate={() => {
                          setLineNotice(null);
                          setItemModalLineKey(line.key);
                        }}
                        required
                      />
                      <SelectField
                        label="الوحدة"
                        value={line.unitMode}
                        onChange={(event) =>
                          updateLine(line.key, {
                            unitMode: event.target.value as
                              | "stock"
                              | "purchase",
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
                          updateLine(line.key, {
                            unitPrice: event.target.value,
                          })
                        }
                        required
                        dir="ltr"
                      />
                      <Field
                        label={`للكافيه الآن (${item?.stockUnit ?? "وحدة المخزون"})`}
                        type="number"
                        min="0"
                        max={item ? amounts.stockQuantity : undefined}
                        step="0.001"
                        placeholder="0"
                        value={line.toCafeQuantity ?? ""}
                        onChange={(event) =>
                          updateLine(line.key, {
                            toCafeQuantity: event.target.value,
                          })
                        }
                        disabled={!item}
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
                        {Number(line.toCafeQuantity) > 0 && (
                          <span>
                            يبقى في الرئيسي:{" "}
                            <b className="tnum text-ink">
                              {Math.max(
                                0,
                                amounts.stockQuantity -
                                  Number(line.toCafeQuantity),
                              ).toLocaleString("ar-EG", {
                                maximumFractionDigits: 3,
                              })}{" "}
                              {item.stockUnit}
                            </b>
                          </span>
                        )}
                        <span>
                          إجمالي السطر:{" "}
                          <b className="tnum text-ink">
                            {formatMoney(amounts.lineTotal)}
                          </b>
                        </span>
                      </div>
                    )}
                    {lineNotice?.key === line.key && (
                      <p className="mt-3 text-xs text-danger">{lineNotice.text}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
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
            {error && <ErrorBanner>{error}</ErrorBanner>}
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
              الرئيسي، وما حددته للكافيه يُحوَّل إليه في نفس الحفظ.
            </p>
          </div>
        </aside>
      </form>
      {supplierModalOpen && (
        <SupplierFormModal
          supplier={null}
          onClose={() => setSupplierModalOpen(false)}
          onSaved={(savedId) => {
            setSupplierModalOpen(false);
            void reloadSuppliers(savedId);
          }}
        />
      )}
      {itemModalLineKey !== null && (
        <ItemFormModal
          item={null}
          categories={categories}
          onClose={() => setItemModalLineKey(null)}
          onSaved={(savedId) => {
            const targetKey = itemModalLineKey;
            setItemModalLineKey(null);
            void reloadItems().then((usable) => {
              if (!usable) return;
              const created = usable.find((item) => item.id === savedId);
              if (created) {
                updateLine(targetKey, {
                  itemId: String(savedId),
                  unitMode: created.purchaseUnit ? "purchase" : "stock",
                });
                setLineNotice(null);
                return;
              }
              setLineNotice({
                key: targetKey,
                text: "تم إنشاء الصنف، لكن الأصناف المُحضّرة لا تُشترى من المورد.",
              });
            });
          }}
        />
      )}
    </>
  );
}
