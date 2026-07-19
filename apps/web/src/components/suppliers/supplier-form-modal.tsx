"use client";

import { useState } from "react";
import type { Supplier } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { supplierRequestBody } from "@/models/supplier-model";
import { createSupplier, updateSupplier } from "@/services/suppliers-service";

const emptyForm = {
  name: "",
  phone: "",
  address: "",
  notes: "",
  openingBalance: "0",
};

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

  const set =
    (key: keyof typeof emptyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = supplierRequestBody(form, supplier);
      if (supplier) await updateSupplier(supplier.id, body);
      else await createSupplier(body);
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
        <Field
          label="اسم المورد"
          value={form.name}
          onChange={set("name")}
          required
        />
        <Field
          label="الهاتف"
          value={form.phone}
          onChange={set("phone")}
          dir="ltr"
        />
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
        <TextAreaField
          label="ملاحظات"
          value={form.notes}
          onChange={set("notes")}
        />
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
