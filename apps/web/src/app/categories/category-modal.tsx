"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

import type { Category } from "@cashier/shared";

export type { Category };

// mounted only while open (keyed by target), so state initializes fresh each time
export function CategoryFormModal({
  editing,
  parent,
  onClose,
  onSaved,
}: {
  editing: Category | null;
  parent: Category | null; // when creating a sub, the main it belongs to
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const title = editing
    ? "تعديل تصنيف"
    : parent
      ? `تصنيف فرعي جديد — ${parent.name}`
      : "تصنيف رئيسي جديد";

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("اسم التصنيف مطلوب");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api(`/api/categories/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ name: trimmed }),
        });
      } else {
        await api("/api/categories", {
          method: "POST",
          body: JSON.stringify({ name: trimmed, parentId: parent?.id ?? null }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} open onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field
          label="اسم التصنيف"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
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
