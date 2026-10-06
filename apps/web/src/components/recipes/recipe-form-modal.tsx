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
import type { Category, Item, Recipe } from "@cashier/shared";
import {
  emptyPreparedRecipeForm,
  newRecipeIngredient,
  recipeFormFromRecipe,
  recipeRequestBody,
  selectRecipeOutputItem,
  type RecipeForm,
  type RecipeIngredientForm,
} from "@/models/recipe-model";
import { createRecipe, updateRecipe } from "@/services/recipes-service";
import { listItems } from "@/services/items-service";
import { itemLabel } from "@/lib/format";
import { Button } from "../ui/button";
import { EntityPicker } from "../ui/entity-picker";
import { Field } from "../ui/field";
import { Modal } from "../ui/modal";
import { SearchSelect } from "../ui/search-select";
import { ItemFormModal } from "../warehouse/item-form-modal";

async function defaultItemsChanged() {
  return listItems();
}

export function RecipeFormModal({
  editing,
  categories,
  items,
  onItemsChanged = defaultItemsChanged,
  onClose,
  onSaved,
}: {
  editing: Recipe | null;
  categories: Category[];
  items: Item[];
  onItemsChanged?: () => Promise<Item[]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RecipeForm>(() =>
    editing ? recipeFormFromRecipe(editing) : emptyPreparedRecipeForm(),
  );
  const [itemList, setItemList] = useState<Item[]>(items);
  const [ingredientModalKey, setIngredientModalKey] = useState<number | null>(null);
  const [lineNotice, setLineNotice] = useState<{
    key: number;
    text: string;
  } | null>(null);
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
  const ingredientItems = itemList.filter(
    (item) => item.isActive || recipeUsesItem(editing, item.id),
  );
  const preparedItems = ingredientItems.filter(
    (item) => item.type === "prepared",
  );

  async function selectCreatedItem(lineKey: number, savedId: number) {
    let rows: Item[];
    try {
      rows = await onItemsChanged();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحميل الأصناف",
      );
      return;
    }
    setItemList(rows);
    const allowed = rows.filter(
      (item) => item.isActive || recipeUsesItem(editing, item.id),
    );
    const created = allowed.find((item) => item.id === savedId);
    if (!created) {
      setLineNotice({
        key: lineKey,
        text: "تم إنشاء الصنف لكنه غير مناسب لهذا الحقل.",
      });
      return;
    }
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((row) =>
        row.key === lineKey ? { ...row, itemId: String(savedId) } : row,
      ),
    }));
    setLineNotice(null);
  }

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
      title={editing ? `تعديل ${editing.name}` : "إضافة وصفة تحضير"}
      onClose={onClose}
    >
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="اسم الوصفة"
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
            onChange={(categoryId) =>
              setForm((current) => ({ ...current, categoryId }))
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

        <div className="grid gap-4 md:grid-cols-2">
          <SearchSelect
            label="الصنف المُحضّر الناتج"
            value={form.outputItemId}
            onChange={(outputItemId) =>
              setForm((current) =>
                selectRecipeOutputItem(current, outputItemId),
              )
            }
            options={preparedItems.map((item) => ({
              value: item.id,
              label: itemLabel(item.code, item.name),
              hint: item.stockUnit,
            }))}
            placeholder="اختر الصنف الناتج"
            required
          />
          <Field
            label={`ناتج الوصفة الأساسي${outputUnit(form.outputItemId, itemList)}`}
            type="number"
            min="0.001"
            step="0.001"
            value={form.baseYield}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                baseYield: event.target.value,
              }))
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
          notice={lineNotice}
          onChange={(ingredients) =>
            setForm((current) => ({ ...current, ingredients }))
          }
          onCreate={(lineKey) => {
            setLineNotice(null);
            setIngredientModalKey(lineKey);
          }}
        />

        {error && (
          <p className="error-banner">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving
              ? "جارِ الحفظ…"
              : editing
                ? "حفظ التعديلات"
                : "إنشاء الوصفة"}
          </Button>
        </div>
      </form>
      {/* outside the recipe <form>: a nested form's submit would bubble into it */}
      {ingredientModalKey !== null && (
        <ItemFormModal
          item={null}
          onClose={() => setIngredientModalKey(null)}
          onSaved={(savedId) => {
            const lineKey = ingredientModalKey;
            setIngredientModalKey(null);
            void selectCreatedItem(lineKey, savedId);
          }}
        />
      )}
    </Modal>
  );
}

function IngredientEditor({
  title,
  lines,
  items,
  nextKeyRef,
  notice,
  onChange,
  onCreate,
}: {
  title: string;
  lines: RecipeIngredientForm[];
  items: Item[];
  nextKeyRef: MutableRefObject<number>;
  notice: { key: number; text: string } | null;
  onChange: (lines: RecipeIngredientForm[]) => void;
  onCreate: (lineKey: number) => void;
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
          <div key={line.key}>
            <div className="grid items-start gap-3 sm:grid-cols-[1fr_12rem_auto]">
              <EntityPicker
                label={`المكوّن ${index + 1}`}
                value={line.itemId}
                onChange={(itemId) =>
                  onChange(
                    lines.map((row) =>
                      row.key === line.key ? { ...row, itemId } : row,
                    ),
                  )
                }
                options={items.map((item) => ({
                  value: item.id,
                  label: itemLabel(item.code, item.name),
                  hint: item.stockUnit,
                }))}
                placeholder="اختر الصنف"
                createLabel="إضافة صنف جديد"
                onCreate={() => onCreate(line.key)}
                required
              />
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
                className="rounded-lg p-2 text-muted hover:bg-danger/10 sm:mt-7 hover:text-danger disabled:opacity-40"
                disabled={lines.length === 1}
                onClick={() =>
                  onChange(lines.filter((row) => row.key !== line.key))
                }
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            {notice?.key === line.key && (
              <p className="mt-1.5 text-xs text-danger">{notice.text}</p>
            )}
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
  return (
    recipe.outputItemId === itemId ||
    recipe.ingredients.some((ingredient) => ingredient.itemId === itemId)
  );
}

function outputUnit(outputItemId: string, items: Item[]) {
  const unit = items.find(
    (item) => String(item.id) === outputItemId,
  )?.stockUnit;
  return unit ? ` (${unit})` : "";
}
