"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Category, Item, ItemType } from "@cashier/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  eligibleItemCategories,
  stockMeaningFieldsLocked,
} from "./warehouse-model";

const typeOptions: { value: ItemType; label: string }[] = [
  { value: "raw", label: "خامة" },
  { value: "resale", label: "إعادة بيع" },
  { value: "prepared", label: "مُحضّر" },
];

const emptyForm = {
  name: "",
  categoryId: "",
  type: "raw" as ItemType,
  stockUnit: "",
  purchaseUnit: "",
  purchaseToStockFactor: "",
  mainMinimumLevel: "0",
  cafeMinimumLevel: "0",
};

export function ItemFormModal({
  item,
  categories,
  onClose,
  onSaved,
}: {
  item: Item | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(
    item
      ? {
          name: item.name,
          categoryId: String(item.categoryId),
          type: item.type,
          stockUnit: item.stockUnit,
          purchaseUnit: item.purchaseUnit ?? "",
          purchaseToStockFactor: item.purchaseToStockFactor ?? "",
          mainMinimumLevel: item.mainMinimumLevel,
          cafeMinimumLevel: item.cafeMinimumLevel,
        }
      : emptyForm,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stockMeaningLocked = item ? stockMeaningFieldsLocked(item) : false;

  const categoryOptions = useMemo(() => {
    const eligible = eligibleItemCategories(categories);
    if (item && !eligible.some((category) => category.id === item.categoryId)) {
      const current = categories.find(
        (category) => category.id === item.categoryId,
      );
      if (current) return [...eligible, current];
    }
    return eligible;
  }, [categories, item]);
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  );

  const set =
    (key: keyof typeof emptyForm) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const purchaseUnit = form.purchaseUnit.trim() || null;
    const body = JSON.stringify({
      name: form.name,
      categoryId: Number(form.categoryId),
      type: form.type,
      stockUnit: form.stockUnit,
      purchaseUnit,
      purchaseToStockFactor: purchaseUnit
        ? Number(form.purchaseToStockFactor)
        : null,
      mainMinimumLevel: Number(form.mainMinimumLevel),
      cafeMinimumLevel: Number(form.cafeMinimumLevel),
    });
    try {
      if (item) {
        await api(`/api/items/${item.id}`, { method: "PUT", body });
      } else {
        await api("/api/items", { method: "POST", body });
      }
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ الصنف");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={item ? "تعديل الصنف" : "صنف جديد"} open onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field
          label="اسم الصنف"
          value={form.name}
          onChange={set("name")}
          maxLength={191}
          required
        />
        <SelectField
          label="التصنيف"
          value={form.categoryId}
          onChange={set("categoryId")}
          required
        >
          <option value="" disabled>
            اختر التصنيف
          </option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.parentId === null
                ? category.name
                : `${categoryNames.get(category.parentId)} ← ${category.name}`}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="نوع الصنف"
            value={form.type}
            onChange={set("type")}
            disabled={stockMeaningLocked}
          >
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <Field
            label="وحدة المخزون"
            value={form.stockUnit}
            onChange={set("stockUnit")}
            placeholder="كجم، لتر، قطعة…"
            maxLength={50}
            required
            disabled={stockMeaningLocked}
          />
        </div>
        {stockMeaningLocked && (
          <p className="text-xs text-muted">
            لا يمكن تغيير نوع الصنف أو وحدة المخزون بعد تسجيل حركة مخزون.
          </p>
        )}
        <div className="rounded-xl border border-line bg-paper/55 p-4">
          <p className="mb-3 text-sm font-medium">وحدة الشراء (اختياري)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="اسم وحدة الشراء"
              value={form.purchaseUnit}
              onChange={set("purchaseUnit")}
              placeholder="شيكارة، كرتونة…"
              maxLength={50}
            />
            <Field
              label={`كم ${form.stockUnit || "وحدة مخزون"} في وحدة الشراء؟`}
              type="number"
              min="0.000001"
              step="0.000001"
              value={form.purchaseToStockFactor}
              onChange={set("purchaseToStockFactor")}
              required={Boolean(form.purchaseUnit.trim())}
              disabled={!form.purchaseUnit.trim()}
              dir="ltr"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="حد التنبيه — المخزن الرئيسي"
            type="number"
            min="0"
            step="0.001"
            value={form.mainMinimumLevel}
            onChange={set("mainMinimumLevel")}
            required
            dir="ltr"
          />
          <Field
            label="حد التنبيه — الكافيه"
            type="number"
            min="0"
            step="0.001"
            value={form.cafeMinimumLevel}
            onChange={set("cafeMinimumLevel")}
            required
            dir="ltr"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارِ الحفظ…" : "حفظ الصنف"}
          </Button>
        </div>
      </form>
    </Modal>
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
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
