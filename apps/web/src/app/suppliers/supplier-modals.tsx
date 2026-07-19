"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

export type Supplier = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  openingBalance: string;
  isActive: boolean;
  balance: string;
};

const emptyForm = { name: "", phone: "", address: "", notes: "", openingBalance: "0" };

// mounted only while open (with a key per supplier), so state initializes fresh each time
export function SupplierFormModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(
    supplier
      ? {
          name: supplier.name,
          phone: supplier.phone ?? "",
          address: supplier.address ?? "",
          notes: supplier.notes ?? "",
          openingBalance: supplier.openingBalance,
        }
      : emptyForm,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = JSON.stringify({ ...form, openingBalance: Number(form.openingBalance) || 0 });
      if (supplier) {
        await api(`/api/suppliers/${supplier.id}`, { method: "PUT", body });
      } else {
        await api("/api/suppliers", { method: "POST", body });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={supplier ? "تعديل مورد" : "مورد جديد"} open onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="اسم المورد" value={form.name} onChange={set("name")} required />
        <Field label="الهاتف" value={form.phone} onChange={set("phone")} dir="ltr" />
        <Field label="العنوان" value={form.address} onChange={set("address")} />
        <Field
          label="الرصيد الافتتاحي (ج.م)"
          type="number"
          min="0"
          step="0.01"
          value={form.openingBalance}
          onChange={set("openingBalance")}
          dir="ltr"
        />
        <TextAreaField label="ملاحظات" value={form.notes} onChange={set("notes")} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارِ الحفظ…" : "حفظ"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// mounted only while a supplier is selected, so state initializes fresh each time
export function PaymentModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(() => {
    // local date, not UTC — toISOString shifts the day near midnight
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/api/suppliers/${supplier.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), paidAt, notes }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تسجيل الدفعة");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`تسجيل دفعة — ${supplier.name}`} open onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field
          label="المبلغ (ج.م)"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          dir="ltr"
        />
        <Field
          label="تاريخ الدفع"
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          required
          dir="ltr"
        />
        <Field label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارِ الحفظ…" : "تسجيل الدفعة"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
