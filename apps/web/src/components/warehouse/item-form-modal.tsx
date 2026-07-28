"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Category, Item } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { createItem, updateItem } from "@/services/items-service";

type Draft = {
  key: string;
  id?: number;
  colorId: number;
  sizeId: number;
  colorName: string;
  sizeName: string;
  enabled: boolean;
  barcode: string;
  sellingPrice: string;
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
  const [name, setName] = useState(item?.name ?? "");
  const [categoryId, setCategoryId] = useState(String(item?.categoryId ?? ""));
  const [selectedColors, setSelectedColors] = useState<number[]>(
    item ? [...new Set(item.variants.map((variant) => variant.colorId))] : [],
  );
  const [selectedSizes, setSelectedSizes] = useState<number[]>(
    item ? [...new Set(item.variants.map((variant) => variant.sizeId))] : [],
  );
  const [drafts, setDrafts] = useState<Draft[]>(
    item?.variants.map((variant) => ({
      key: `${variant.colorId}:${variant.sizeId}`,
      id: variant.id,
      colorId: variant.colorId,
      sizeId: variant.sizeId,
      colorName: variant.colorName,
      sizeName: variant.sizeName,
      enabled: variant.isActive,
      barcode: variant.barcode ?? "",
      sellingPrice: variant.sellingPrice,
    })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const category = categories.find((row) => row.id === Number(categoryId));
  const eligible = categories.filter(
    (row) =>
      row.isActive &&
      !categories.some(
        (candidate) => candidate.parentId === row.id && candidate.isActive,
      ),
  );

  const generated = useMemo(() => {
    if (!category) return drafts;
    const existing = new Map(drafts.map((draft) => [draft.key, draft]));
    return selectedColors.flatMap((colorId) =>
      selectedSizes.map((sizeId) => {
        const key = `${colorId}:${sizeId}`;
        return (
          existing.get(key) ?? {
            key,
            colorId,
            sizeId,
            colorName:
              category.colors?.find((option) => option.id === colorId)?.name ??
              "",
            sizeName:
              category.sizes?.find((option) => option.id === sizeId)?.name ??
              "",
            enabled: true,
            barcode: "",
            sellingPrice: "",
          }
        );
      }),
    );
  }, [category, drafts, selectedColors, selectedSizes]);

  function toggle(
    list: number[],
    value: number,
    setter: (next: number[]) => void,
  ) {
    setter(
      list.includes(value)
        ? list.filter((id) => id !== value)
        : [...list, value],
    );
  }
  function updateDraft(key: string, patch: Partial<Draft>) {
    const base = generated.find((row) => row.key === key)!;
    setDrafts((current) => [
      ...current.filter((row) => row.key !== key),
      { ...base, ...patch },
    ]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const enabled = generated.filter((row) => row.enabled);
    if (!item && !enabled.length) {
      setError("اختر متغيراً واحداً على الأقل");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        categoryId: Number(categoryId),
        variants: [
          ...generated.filter((row) => row.id || row.enabled),
          ...(item?.variants ?? [])
            .filter(
              (variant) => !generated.some((row) => row.id === variant.id),
            )
            .map((variant) => ({
              key: `${variant.colorId}:${variant.sizeId}`,
              id: variant.id,
              colorId: variant.colorId,
              sizeId: variant.sizeId,
              colorName: variant.colorName,
              sizeName: variant.sizeName,
              barcode: variant.barcode ?? "",
              sellingPrice: variant.sellingPrice,
              enabled: false,
            })),
        ].map((row) => ({
          id: row.id,
          colorId: row.colorId,
          sizeId: row.sizeId,
          barcode: row.barcode.trim() || null,
          sellingPrice: Number(row.sellingPrice),
          isActive: row.enabled,
        })),
      };
      if (item) await updateItem(item.id, body);
      else await createItem(body);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ المنتج");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={item ? "تعديل المنتج" : "منتج جديد"}
      open
      onClose={onClose}
      size="xl"
    >
      <form onSubmit={save} className="space-y-4">
        <Field
          label="اسم المنتج"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">التصنيف</span>
          <select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setSelectedColors([]);
              setSelectedSizes([]);
              setDrafts([]);
            }}
            required
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
          >
            <option value="">اختر التصنيف</option>
            {eligible.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        {category && (
          <>
            <OptionPicker
              title="الألوان"
              options={(category.colors ?? []).filter((row) => row.isActive)}
              selected={selectedColors}
              onToggle={(id) => toggle(selectedColors, id, setSelectedColors)}
            />
            <OptionPicker
              title="المقاسات"
              options={(category.sizes ?? []).filter((row) => row.isActive)}
              selected={selectedSizes}
              onToggle={(id) => toggle(selectedSizes, id, setSelectedSizes)}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>تفعيل</th>
                    <th>اللون</th>
                    <th>المقاس</th>
                    <th>سعر البيع</th>
                    <th>الباركود</th>
                  </tr>
                </thead>
                <tbody>
                  {generated.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(event) =>
                            updateDraft(row.key, {
                              enabled: event.target.checked,
                            })
                          }
                        />
                      </td>
                      <td>{row.colorName}</td>
                      <td>{row.sizeName}</td>
                      <td>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={row.sellingPrice}
                          onChange={(event) =>
                            updateDraft(row.key, {
                              sellingPrice: event.target.value,
                            })
                          }
                          required={row.enabled}
                          className="w-28 rounded border p-1"
                        />
                      </td>
                      <td>
                        <input
                          value={row.barcode}
                          onChange={(event) =>
                            updateDraft(row.key, {
                              barcode: event.target.value,
                            })
                          }
                          className="w-40 rounded border p-1"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جارِ الحفظ…" : "حفظ المنتج"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function OptionPicker({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<{ id: number; name: string }>;
  selected: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-line p-3">
      <legend>{title}</legend>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label key={option.id} className="flex gap-1">
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={() => onToggle(option.id)}
            />
            {option.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
