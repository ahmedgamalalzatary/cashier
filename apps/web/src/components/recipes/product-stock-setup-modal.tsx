"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  ExternalIngredientMapping,
  ExternalProduct,
  Item,
  ProductStockSetupBody,
} from "@cashier/shared";
import { itemLabel } from "../../lib/format";
import { configureProductStock } from "../../services/products-service";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Modal } from "../ui/modal";

type IngredientRow = { key: string; itemId: string; quantity: string };
type ModifierForm = {
  externalModifierOptionId: number;
  label: string;
  stockEffect: "" | "mapped" | "none";
  ingredients: IngredientRow[];
};

const rowsFromMappings = (
  mappings: ExternalIngredientMapping[],
  keyPrefix: string,
) =>
  mappings.length > 0
    ? mappings.map((mapping, index) => ({
        key: `${keyPrefix}:${index}`,
        itemId: String(mapping.itemId),
        quantity: mapping.quantity,
      }))
    : [{ key: `${keyPrefix}:empty`, itemId: "", quantity: "" }];

export function ProductStockSetupModal({
  product,
  items,
  onClose,
  onSaved,
}: {
  product: ExternalProduct;
  items: Item[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const keyRef = useRef(1);
  const nextKey = () => `new:${keyRef.current++}`;
  const [baseIngredients, setBaseIngredients] = useState<IngredientRow[]>(() =>
    rowsFromMappings(product.ingredients, "base"),
  );
  const [sizeIngredients, setSizeIngredients] = useState<
    Record<number, IngredientRow[]>
  >(() =>
    Object.fromEntries(
      product.sizes.map((size) => [
        size.externalId,
        rowsFromMappings(size.ingredients, `size:${size.externalId}`),
      ]),
    ),
  );
  const [modifiers, setModifiers] = useState<ModifierForm[]>(() =>
    product.modifierGroups.flatMap((group) =>
      group.options.map((option) => ({
        externalModifierOptionId: option.externalId,
        label:
          group.nameAr === null || option.nameAr === null
            ? // The external catalog lost this name; showing the raw ID would
              // be meaningless to the admin mapping the stock.
              "مجموعة بدون اسم — إضافة بدون اسم"
            : `${group.nameAr} — ${option.nameAr}`,
        stockEffect:
          option.stockEffect === "incomplete" ? "" : option.stockEffect,
        ingredients:
          option.stockEffect === "mapped"
            ? rowsFromMappings(
                option.ingredients,
                `modifier:${option.externalId}`,
              )
            : [],
      })),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const activeItems = items.filter((item) => item.isActive);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (modifiers.some((modifier) => modifier.stockEffect === "")) {
      setError("يجب تحديد تأثير المخزون لكل إضافة");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body: ProductStockSetupBody = {
        baseIngredients:
          product.sizes.length === 0 ? requestRows(baseIngredients) : [],
        sizes: product.sizes.map((size) => ({
          externalSizeId: size.externalId,
          ingredients: requestRows(sizeIngredients[size.externalId] ?? []),
        })),
        modifiers: modifiers.map((modifier) =>
          modifier.stockEffect === "none"
            ? {
                externalModifierOptionId: modifier.externalModifierOptionId,
                stockEffect: "none" as const,
              }
            : {
                externalModifierOptionId: modifier.externalModifierOptionId,
                stockEffect: "mapped" as const,
                ingredients: requestRows(modifier.ingredients),
              },
        ),
      };
      await configureProductStock(product.externalId, body);
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر حفظ إعداد المخزون",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="xl"
      title={`إعداد مخزون ${product.nameAr}`}
      onClose={onClose}
    >
      <form className="space-y-5" onSubmit={submit}>
        {product.sizes.length === 0 ? (
          <TargetEditor
            title="مكونات المنتج الأساسي"
            rows={baseIngredients}
            items={activeItems}
            nextKey={nextKey}
            onChange={setBaseIngredients}
          />
        ) : (
          product.sizes.map((size) => (
            <TargetEditor
              key={size.externalId}
              title={`مكونات المقاس: ${size.nameAr} / ${size.nameEn}`}
              rows={sizeIngredients[size.externalId] ?? []}
              items={activeItems}
              nextKey={nextKey}
              onChange={(rows) =>
                setSizeIngredients((current) => ({
                  ...current,
                  [size.externalId]: rows,
                }))
              }
            />
          ))
        )}

        {modifiers.length > 0 && (
          <section className="space-y-3 border-t border-line pt-4">
            <div>
              <h3 className="font-semibold">تأثير الإضافات على المخزون</h3>
              <p className="text-xs text-muted">
                يجب ربط كل إضافة بمكونات أو اختيار «بدون تأثير» صراحةً.
              </p>
            </div>
            {modifiers.map((modifier) => (
              <div
                key={modifier.externalModifierOptionId}
                className="space-y-3 rounded-xl border border-line bg-paper/45 p-4"
              >
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">{modifier.label}</span>
                  <select
                    required
                    value={modifier.stockEffect}
                    onChange={(event) => {
                      const stockEffect = event.target.value as
                        | ""
                        | "mapped"
                        | "none";
                      setModifiers((current) =>
                        current.map((row) =>
                          row.externalModifierOptionId ===
                          modifier.externalModifierOptionId
                            ? {
                                ...row,
                                stockEffect,
                                ingredients:
                                  stockEffect === "mapped" &&
                                  row.ingredients.length === 0
                                    ? [
                                        {
                                          key: nextKey(),
                                          itemId: "",
                                          quantity: "",
                                        },
                                      ]
                                    : row.ingredients,
                              }
                            : row,
                        ),
                      );
                    }}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                  >
                    <option value="">اختر تأثير المخزون</option>
                    <option value="mapped">تستهلك مكونات</option>
                    <option value="none">بدون تأثير على المخزون</option>
                  </select>
                </label>
                {modifier.stockEffect === "mapped" && (
                  <IngredientRows
                    rows={modifier.ingredients}
                    items={activeItems}
                    nextKey={nextKey}
                    onChange={(ingredients) =>
                      setModifiers((current) =>
                        current.map((row) =>
                          row.externalModifierOptionId ===
                          modifier.externalModifierOptionId
                            ? { ...row, ingredients }
                            : row,
                        ),
                      )
                    }
                  />
                )}
              </div>
            ))}
          </section>
        )}

        {error && (
          <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارِ الحفظ…" : "حفظ إعداد المخزون"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TargetEditor({
  title,
  rows,
  items,
  nextKey,
  onChange,
}: {
  title: string;
  rows: IngredientRow[];
  items: Item[];
  nextKey: () => string;
  onChange: (rows: IngredientRow[]) => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-line p-4">
      <h3 className="font-semibold">{title}</h3>
      <IngredientRows
        rows={rows}
        items={items}
        nextKey={nextKey}
        onChange={onChange}
      />
    </section>
  );
}

function IngredientRows({
  rows,
  items,
  nextKey,
  onChange,
}: {
  rows: IngredientRow[];
  items: Item[];
  nextKey: () => string;
  onChange: (rows: IngredientRow[]) => void;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const selected = items.find((item) => String(item.id) === row.itemId);
        return (
          <div
            key={row.key}
            className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]"
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">المكوّن {index + 1}</span>
              <select
                required
                value={row.itemId}
                onChange={(event) =>
                  onChange(
                    rows.map((current) =>
                      current.key === row.key
                        ? { ...current, itemId: event.target.value }
                        : current,
                    ),
                  )
                }
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              >
                <option value="">اختر الصنف</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {itemLabel(item.code, item.name)}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label={`الكمية${selected ? ` (${selected.stockUnit})` : ""}`}
              type="number"
              min="0.001"
              step="0.001"
              required
              value={row.quantity}
              onChange={(event) =>
                onChange(
                  rows.map((current) =>
                    current.key === row.key
                      ? { ...current, quantity: event.target.value }
                      : current,
                  ),
                )
              }
              dir="ltr"
            />
            <button
              type="button"
              aria-label={`حذف المكوّن ${index + 1}`}
              className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40"
              disabled={rows.length === 1}
              onClick={() =>
                onChange(rows.filter((current) => current.key !== row.key))
              }
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        );
      })}
      <Button
        variant="ghost"
        onClick={() =>
          onChange([
            ...rows,
            { key: nextKey(), itemId: "", quantity: "" },
          ])
        }
      >
        <Plus className="size-4" /> إضافة مكوّن
      </Button>
    </div>
  );
}

function requestRows(rows: IngredientRow[]) {
  return rows.map((row) => ({
    itemId: Number(row.itemId),
    quantity: Number(row.quantity),
  }));
}
