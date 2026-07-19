"use client";

import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Category, Item, Recipe, RecipeType } from "@cashier/shared";
import {
  emptyPreparedRecipeForm,
  emptyProductRecipeForm,
  newProductSize,
  newRecipeIngredient,
  recipeFormFromRecipe,
  recipeRequestBody,
  type ProductRecipeForm,
  type RecipeForm,
  type RecipeIngredientForm,
} from "@/models/recipe-model";
import { createRecipe, updateRecipe } from "@/services/recipes-service";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Modal } from "../ui/modal";

export function RecipeFormModal({
  type,
  editing,
  categories,
  items,
  onClose,
  onSaved,
}: {
  type: RecipeType;
  editing: Recipe | null;
  categories: Category[];
  items: Item[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RecipeForm>(() =>
    editing
      ? recipeFormFromRecipe(editing)
      : type === "product"
        ? emptyProductRecipeForm()
        : emptyPreparedRecipeForm(),
  );
  const nextKeyRef = useRef(10_000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const leafCategories = useMemo(() => {
    const parents = new Set(categories.map((category) => category.parentId));
    return categories.filter(
      (category) =>
        !parents.has(category.id) &&
        (category.isActive || category.id === editing?.categoryId),
    );
  }, [categories, editing?.categoryId]);
  const ingredientItems = items.filter(
    (item) => item.isActive || recipeUsesItem(editing, item.id),
  );
  const preparedItems = ingredientItems.filter(
    (item) => item.type === "prepared",
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = recipeRequestBody(form);
      if (editing) await updateRecipe(editing.id, body);
      else await createRecipe(body);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ الوصفة");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="xl"
      title={
        editing
          ? `تعديل ${editing.name}`
          : type === "product"
            ? "إضافة منتج وصفة"
            : "إضافة وصفة تحضير"
      }
      onClose={onClose}
    >
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label={form.type === "product" ? "اسم المنتج" : "اسم الوصفة"}
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            maxLength={191}
            required
            autoFocus
          />
          <SelectField
            label="التصنيف"
            value={form.categoryId}
            onChange={(value) =>
              setForm((current) => ({ ...current, categoryId: value }))
            }
            required
          >
            <option value="">اختر التصنيف</option>
            {leafCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
        </div>

        {form.type === "product" ? (
          <ProductEditor
            form={form}
            items={ingredientItems}
            nextKeyRef={nextKeyRef}
            onChange={setForm}
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="الصنف المُحضّر الناتج"
                value={form.outputItemId}
                onChange={(value) =>
                  setForm((current) =>
                    current.type === "prepared"
                      ? { ...current, outputItemId: value }
                      : current,
                  )
                }
                required
              >
                <option value="">اختر الصنف الناتج</option>
                {preparedItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.stockUnit})
                  </option>
                ))}
              </SelectField>
              <Field
                label={`ناتج الوصفة الأساسي${outputUnit(form.outputItemId, items)}`}
                type="number"
                min="0.001"
                step="0.001"
                value={form.baseYield}
                onChange={(event) =>
                  setForm((current) =>
                    current.type === "prepared"
                      ? { ...current, baseYield: event.target.value }
                      : current,
                  )
                }
                required
                dir="ltr"
              />
            </div>
            <IngredientEditor
              title="مكونات الوصفة الأساسية"
              lines={form.ingredients}
              items={ingredientItems.filter(
                (item) => String(item.id) !== form.outputItemId,
              )}
              nextKeyRef={nextKeyRef}
              onChange={(ingredients) =>
                setForm((current) =>
                  current.type === "prepared"
                    ? { ...current, ingredients }
                    : current,
                )
              }
            />
          </>
        )}

        {error && (
          <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارِ الحفظ…" : editing ? "حفظ التعديلات" : "إنشاء الوصفة"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ProductEditor({
  form,
  items,
  nextKeyRef,
  onChange,
}: {
  form: ProductRecipeForm;
  items: Item[];
  nextKeyRef: MutableRefObject<number>;
  onChange: (form: RecipeForm) => void;
}) {
  function updateSize(key: number, patch: Partial<ProductRecipeForm["sizes"][number]>) {
    onChange({
      ...form,
      sizes: form.sizes.map((size) =>
        size.key === key ? { ...size, ...patch } : size,
      ),
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">المقاسات والأسعار</h3>
          <p className="text-xs text-muted">لكل مقاس سعر وكميات مكونات مستقلة.</p>
        </div>
        <Button
          variant="ghost"
          onClick={() =>
            onChange({
              ...form,
              sizes: [...form.sizes, newProductSize(nextKeyRef.current++)],
            })
          }
          disabled={form.sizes.length >= 20}
        >
          <Plus className="size-4" /> إضافة مقاس
        </Button>
      </div>
      {form.sizes.map((size, index) => (
        <div key={size.key} className="rounded-2xl border border-line bg-paper/45 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <p className="text-sm font-semibold">المقاس {index + 1}</p>
            <button
              type="button"
              aria-label={`حذف المقاس ${index + 1}`}
              title="حذف المقاس"
              className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40"
              disabled={form.sizes.length === 1}
              onClick={() =>
                onChange({
                  ...form,
                  sizes: form.sizes.filter((row) => row.key !== size.key),
                })
              }
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <Field
              label="اسم المقاس"
              value={size.name}
              onChange={(event) => updateSize(size.key, { name: event.target.value })}
              maxLength={100}
              required
            />
            <Field
              label="سعر البيع (ج.م)"
              type="number"
              min="0.01"
              step="0.01"
              value={size.sellingPrice}
              onChange={(event) =>
                updateSize(size.key, { sellingPrice: event.target.value })
              }
              required
              dir="ltr"
            />
          </div>
          <IngredientEditor
            title="مكونات المقاس"
            lines={size.ingredients}
            items={items}
            nextKeyRef={nextKeyRef}
            onChange={(ingredients) => updateSize(size.key, { ingredients })}
          />
        </div>
      ))}
    </section>
  );
}

function IngredientEditor({
  title,
  lines,
  items,
  nextKeyRef,
  onChange,
}: {
  title: string;
  lines: RecipeIngredientForm[];
  items: Item[];
  nextKeyRef: MutableRefObject<number>;
  onChange: (lines: RecipeIngredientForm[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Button
          variant="ghost"
          className="px-3 py-1.5"
          onClick={() =>
            onChange([...lines, newRecipeIngredient(nextKeyRef.current++)])
          }
          disabled={lines.length >= 100}
        >
          <Plus className="size-3.5" /> مكوّن
        </Button>
      </div>
      {lines.map((line, index) => {
        const selected = items.find((item) => String(item.id) === line.itemId);
        return (
          <div key={line.key} className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]">
            <SelectField
              label={`المكوّن ${index + 1}`}
              value={line.itemId}
              onChange={(itemId) =>
                onChange(
                  lines.map((row) =>
                    row.key === line.key ? { ...row, itemId } : row,
                  ),
                )
              }
              required
            >
              <option value="">اختر الصنف</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
            <Field
              label={`الكمية${selected ? ` (${selected.stockUnit})` : ""}`}
              type="number"
              min="0.001"
              step="0.001"
              value={line.quantity}
              onChange={(event) =>
                onChange(
                  lines.map((row) =>
                    row.key === line.key
                      ? { ...row, quantity: event.target.value }
                      : row,
                  ),
                )
              }
              required
              dir="ltr"
            />
            <button
              type="button"
              aria-label={`حذف المكوّن ${index + 1}`}
              title="حذف المكوّن"
              className="mb-0.5 rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40"
              disabled={lines.length === 1}
              onClick={() => onChange(lines.filter((row) => row.key !== line.key))}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <select
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      >
        {children}
      </select>
    </label>
  );
}

function recipeUsesItem(recipe: Recipe | null, itemId: number) {
  if (!recipe) return false;
  if (recipe.type === "prepared" && recipe.outputItemId === itemId) return true;
  const ingredients =
    recipe.type === "product"
      ? recipe.sizes.flatMap((size) => size.ingredients)
      : recipe.ingredients;
  return ingredients.some((ingredient) => ingredient.itemId === itemId);
}

function outputUnit(outputItemId: string, items: Item[]) {
  const unit = items.find((item) => String(item.id) === outputItemId)?.stockUnit;
  return unit ? ` (${unit})` : "";
}
