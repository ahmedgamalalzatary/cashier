"use client";

import { useState } from "react";
import type { Supplier } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { recordSupplierPayment } from "@/services/suppliers-service";

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
      await recordSupplierPayment(supplier.id, {
        amount: Number(amount),
        paidAt,
        notes: notes.trim() || null,
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
        <Field
          label="ملاحظات"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
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
