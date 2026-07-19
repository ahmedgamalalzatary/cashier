"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { categoryParentOptions, categoryUpdateBody } from "@/models/category-model";
import { createCategory, updateCategory } from "@/services/categories-service";

import type { Category } from "@cashier/shared";

// mounted only while open (keyed by target), so state initializes fresh each time
export function CategoryFormModal({
  editing,
  parent,
  categories,
  onClose,
  onSaved,
}: {
  editing: Category | null;
  parent: Category | null; // when creating a sub, the main it belongs to
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [parentId, setParentId] = useState(
    String(editing?.parentId ?? parent?.id ?? ""),
  );
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
        await updateCategory(
          editing.id,
          categoryUpdateBody(trimmed, parentId, editing.parentId),
        );
      } else {
        await createCategory({ name: trimmed, parentId: parent?.id ?? null });
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
        {editing && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">التصنيف الرئيسي</span>
            <select
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">بدون — تصنيف رئيسي</option>
              {categoryParentOptions(
                categories,
                editing.id,
                editing.parentId,
              ).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}
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
