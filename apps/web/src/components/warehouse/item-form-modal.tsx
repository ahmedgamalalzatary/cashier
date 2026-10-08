"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type { Category, Item, ItemType } from "@cashier/shared";
import { Button } from "@cashier/web-core/components/ui/button";
import { Field } from "@cashier/web-core/components/ui/field";
import { Modal } from "@cashier/web-core/components/ui/modal";
import { SelectField } from "@cashier/web-core/components/ui/select-field";
import { ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { formatItemCode } from "@cashier/web-core/lib/format";
import { createItem, updateItem } from "@/services/items-service";
import { createCategory, listCategories } from "@/services/categories-service";
import {
  eligibleItemCategories,
  stockMeaningFieldsLocked,
} from "@/models/warehouse-model";

const typeOptions: { value: ItemType; label: string }[] = [
  { value: "raw", label: "خامة" },
  { value: "resale", label: "إعادة بيع" },
  { value: "prepared", label: "مُحضّر" },
];

const emptyForm = {
  name: "",
  categoryId: "",
  type: "raw" as ItemType,
  sellingPrice: "",
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
  categories?: Category[];
  onClose: () => void;
  onSaved: (savedId: string) => void;
}) {
  const [form, setForm] = useState(
    item
      ? {
          name: item.name,
          categoryId: String(item.categoryId),
          type: item.type,
          sellingPrice: item.sellingPrice ?? "",
          stockUnit: item.stockUnit,
          purchaseUnit: item.purchaseUnit ?? "",
          purchaseToStockFactor: item.purchaseToStockFactor ?? "",
          mainMinimumLevel: item.mainMinimumLevel,
          cafeMinimumLevel: item.cafeMinimumLevel,
        }
      : emptyForm,
  );
  const [categoryList, setCategoryList] = useState<Category[]>(categories ?? []);
  const [categoriesLoading, setCategoriesLoading] = useState(
    categories === undefined,
  );
  const [categoriesError, setCategoriesError] = useState("");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stockMeaningLocked = item ? stockMeaningFieldsLocked(item) : false;

  useEffect(() => {
    if (categories !== undefined) return;
    let cancelled = false;
    listCategories()
      .then((rows) => {
        if (!cancelled) setCategoryList(rows);
      })
      .catch((caught) => {
        if (cancelled) return;
        setCategoriesError(
          caught instanceof Error ? caught.message : "تعذر تحميل التصنيفات",
        );
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categories]);

  const categoryOptions = useMemo(() => {
    const eligible = eligibleItemCategories(categoryList);
    if (item && !eligible.some((category) => category.id === item.categoryId)) {
      const current = categoryList.find(
        (category) => category.id === item.categoryId,
      );
      if (current) return [...eligible, current];
    }
    return eligible;
  }, [categoryList, item]);
  const categoryNames = new Map(
    categoryList.map((category) => [category.id, category.name]),
  );

  const set =
    (key: keyof typeof emptyForm) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setSavingCategory(true);
    setError("");
    try {
      const created = await createCategory({ name, parentId: null });
      setCategoryList(await listCategories());
      setForm((current) => ({ ...current, categoryId: String(created.id) }));
      setNewCategoryName("");
      setNewCategoryOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر إنشاء التصنيف",
      );
    } finally {
      setSavingCategory(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    // this modal opens from inside other forms; keep its submit from reaching theirs
    event.stopPropagation();
    setSaving(true);
    setError("");
    const purchaseUnit = form.purchaseUnit.trim() || null;
    const body = {
      name: form.name,
      categoryId: form.categoryId,
      type: form.type,
      sellingPrice: form.type === "resale" ? Number(form.sellingPrice) : null,
      stockUnit: form.stockUnit,
      purchaseUnit,
      purchaseToStockFactor: purchaseUnit
        ? Number(form.purchaseToStockFactor)
        : null,
      mainMinimumLevel: Number(form.mainMinimumLevel),
      cafeMinimumLevel: Number(form.cafeMinimumLevel),
    };
    try {
      if (item) {
        await updateItem(item.id, body);
        onSaved(item.id);
      } else {
        const created = await createItem(body);
        onSaved(created.id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ الصنف");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={item ? "تعديل الصنف" : "صنف جديد"} open onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {item ? (
          <div className="rounded-lg border border-line bg-paper/55 px-3 py-2">
            <p className="text-xs text-muted">كود الصنف</p>
            <p className="tnum mt-0.5 font-bold">{formatItemCode(item.code)}</p>
          </div>
        ) : (
          <p className="text-xs text-muted">
            يمنح النظام الصنف كوداً تسلسلياً تلقائياً بعد الحفظ.
          </p>
        )}
        <Field
          label="اسم الصنف"
          value={form.name}
          onChange={set("name")}
          maxLength={191}
          required
        />
        <div>
          {categoriesLoading ? (
            <LoadingState label="جارِ تحميل التصنيفات…" />
          ) : categoriesError ? (
            <ErrorBanner>{categoriesError}</ErrorBanner>
          ) : (
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
          )}
          <button
            type="button"
            onClick={() => setNewCategoryOpen((open) => !open)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" />
            تصنيف جديد
          </button>
        </div>
        {newCategoryOpen && (
          <div className="flex gap-2 rounded-xl border border-line bg-paper/55 p-3">
            <input
              aria-label="اسم التصنيف الجديد"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void addCategory();
              }}
              placeholder="مثال: مشروبات ساخنة"
              className="input min-w-0 flex-1"
            />
            <Button
              size="sm"
              onClick={() => void addCategory()}
              disabled={savingCategory || !newCategoryName.trim()}
            >
              {savingCategory ? "جارٍ الإضافة…" : "إضافة"}
            </Button>
          </div>
        )}
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
        {form.type === "resale" && (
          <Field
            label="سعر البيع"
            type="number"
            min="0.01"
            step="0.01"
            value={form.sellingPrice}
            onChange={set("sellingPrice")}
            required
            dir="ltr"
          />
        )}
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
