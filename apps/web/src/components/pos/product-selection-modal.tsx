"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { ExternalProduct } from "@cashier/shared";
import { Button } from "@cashier/web-core/components/ui/button";
import { Modal } from "@cashier/web-core/components/ui/modal";
import { formatMoney } from "@cashier/web-core/lib/format";
import { catalogSizePrice, defaultExternalSize } from "@/models/pos-model";

export function ProductSelectionModal({
  product,
  nowMs,
  onClose,
  onAdd,
}: {
  product: ExternalProduct;
  nowMs: number;
  onClose: () => void;
  onAdd: (
    sizeId: number | null,
    modifiers: Array<{
      externalModifierOptionId: number;
      quantity: number;
    }>,
  ) => void;
}) {
  const [sizeId, setSizeId] = useState<number | null>(() =>
    defaultExternalSize(product),
  );
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const groupsValid = product.modifierGroups.every((group) => {
    const count = group.options.reduce(
      (sum, option) => sum + (quantities[option.externalId] ?? 0),
      0,
    );
    return (!group.isRequired || count > 0) && count <= group.maxSelections;
  });

  return (
    <Modal open title={product.nameAr} onClose={onClose} size="xl">
      <div className="space-y-5">
        {product.sizes.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-semibold">اختر المقاس</h3>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((size) => (
                <button
                  type="button"
                  key={size.externalId}
                  onClick={() => setSizeId(size.externalId)}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${sizeId === size.externalId ? "border-primary bg-primary text-white" : "border-line"}`}
                >
                  {size.nameAr} ·{" "}
                  {formatMoney(catalogSizePrice(product, size, nowMs))}
                </button>
              ))}
            </div>
          </section>
        )}
        {product.modifierGroups.map((group) => {
          const selected = group.options.reduce(
            (sum, option) => sum + (quantities[option.externalId] ?? 0),
            0,
          );
          return (
            <section
              key={group.externalId}
              className="space-y-2 rounded-xl border border-line p-4"
            >
              <div className="flex justify-between gap-2">
                <h3 className="font-semibold">
                  {group.nameAr} {group.isRequired ? "(مطلوبة)" : ""}
                </h3>
                <span className="text-xs text-muted">
                  {selected}/{group.maxSelections}
                </span>
              </div>
              {group.options.map((option) => (
                <div
                  key={option.externalId}
                  className="flex items-center justify-between gap-3 rounded-lg bg-paper p-2"
                >
                  <span className="text-sm">
                    {option.nameAr} · +{formatMoney(option.extraPrice)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`تقليل ${option.nameAr}`}
                      onClick={() =>
                        setQuantities((current) => ({
                          ...current,
                          [option.externalId]: Math.max(
                            0,
                            (current[option.externalId] ?? 0) - 1,
                          ),
                        }))
                      }
                      className="rounded-md border border-line p-1.5"
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="min-w-5 text-center">
                      {quantities[option.externalId] ?? 0}
                    </span>
                    <button
                      type="button"
                      aria-label={`زيادة ${option.nameAr}`}
                      disabled={selected >= group.maxSelections}
                      onClick={() =>
                        setQuantities((current) => ({
                          ...current,
                          [option.externalId]:
                            (current[option.externalId] ?? 0) + 1,
                        }))
                      }
                      className="rounded-md border border-line p-1.5 disabled:opacity-40"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          );
        })}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            disabled={
              !groupsValid || (product.sizes.length > 0 && sizeId === null)
            }
            onClick={() =>
              onAdd(
                sizeId,
                Object.entries(quantities)
                  .filter(([, quantity]) => quantity > 0)
                  .map(([optionId, quantity]) => ({
                    externalModifierOptionId: Number(optionId),
                    quantity,
                  })),
              )
            }
          >
            إضافة إلى الطلب
          </Button>
        </div>
      </div>
    </Modal>
  );
}
