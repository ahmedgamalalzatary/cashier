"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Item, Supplier } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { createPurchase } from "@/services/purchases-service";
import { listItems } from "@/services/items-service";
import { listSuppliers } from "@/services/suppliers-service";

type Line = { variantId: number; quantity: string; unitPrice: string };

export function PurchaseInvoiceForm() {
  const router = useRouter();
  const [products, setProducts] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [paidAmount, setPaidAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([listItems(), listSuppliers()])
      .then(([productRows, supplierRows]) => {
        setProducts(productRows);
        setSuppliers(supplierRows.filter((row) => row.isActive));
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "تعذر تحميل البيانات"),
      );
  }, []);
  const variants = useMemo(
    () =>
      products.flatMap((product) =>
        product.variants
          .filter((variant) => variant.isActive && product.isActive)
          .map((variant) => ({ ...variant, productName: product.name })),
      ),
    [products],
  );
  const total = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0),
    0,
  );

  function update(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line, rowIndex) =>
        rowIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await createPurchase({
        supplierId: Number(supplierId),
        invoiceNumber: invoiceNumber.trim() || null,
        purchasedAt,
        paidAmount: Number(paidAmount),
        notes: notes.trim() || null,
        lines: lines.map((line) => ({
          variantId: line.variantId,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
        })),
      });
      router.push(`/purchases/${response.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ الفاتورة");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-1.5"><span className="text-sm font-medium">المورد</span><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required className="w-full rounded-lg border border-line bg-surface px-3 py-2"><option value="">اختر المورد</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        <Field label="رقم الفاتورة" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
        <Field label="التاريخ" type="date" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} required />
      </div>
      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={index} className="grid gap-3 rounded-lg border border-line p-3 md:grid-cols-[1fr_10rem_10rem_auto]">
            <select value={line.variantId || ""} onChange={(event) => update(index, { variantId: Number(event.target.value) })} required className="rounded border border-line px-3 py-2">
              <option value="">اختر المنتج / اللون / المقاس</option>
              {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.productName} — {variant.colorName} — {variant.sizeName} (#{variant.code})</option>)}
            </select>
            <input aria-label="الكمية" type="number" min="1" step="1" value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} required className="rounded border border-line px-3 py-2" />
            <input aria-label="تكلفة الوحدة" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => update(index, { unitPrice: event.target.value })} required className="rounded border border-line px-3 py-2" />
            <Button type="button" variant="ghost" onClick={() => setLines((current) => current.filter((_, rowIndex) => rowIndex !== index))}>حذف</Button>
          </div>
        ))}
        <Button type="button" variant="ghost" onClick={() => setLines((current) => [...current, { variantId: 0, quantity: "1", unitPrice: "" }])}>إضافة متغير</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={`المدفوع (الإجمالي ${total.toFixed(2)} ج.م)`} type="number" min="0" step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} />
        <Field label="ملاحظات" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      {error && <p className="text-danger">{error}</p>}
      <Button type="submit" disabled={saving || !lines.length}>{saving ? "جارِ الحفظ…" : "حفظ الفاتورة"}</Button>
    </form>
  );
}
