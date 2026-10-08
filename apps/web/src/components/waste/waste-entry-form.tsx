"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type {
  WasteCatalog,
  WasteDetail,
  WasteReason,
} from "@cashier/shared";
import { useAuth } from "@cashier/web-core/components/auth/auth-provider";
import { Button } from "@cashier/web-core/components/ui/button";
import { SearchSelect } from "@cashier/web-core/components/ui/search-select";
import { SelectField } from "@cashier/web-core/components/ui/select-field";
import { ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { warehouseForWasteTarget } from "@/lib/waste-target";
import {
  createWaste,
  getWasteCatalog,
  type CreateWasteBody,
} from "@/services/waste-service";

export const wasteReasonLabels: Record<WasteReason, string> = {
  expired: "منتهي الصلاحية",
  damaged: "تالف",
  preparation_mistake: "خطأ تحضير",
  spill: "انسكاب",
  other: "سبب آخر",
};

/**
 * The waste entry form, used by the waste page and by POS. Errors render
 * inside the form (T5).
 */
export function WasteEntryForm({
  onSaved,
}: {
  onSaved: (entry: WasteDetail) => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [catalog, setCatalog] = useState<WasteCatalog | null>(null);
  const [targetKey, setTargetKey] = useState("");
  const [warehouse, setWarehouse] = useState<"main" | "cafe">("cafe");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<WasteReason>("damaged");
  const [note, setNote] = useState("");
  const [clientRequestId, setClientRequestId] = useState(() =>
    crypto.randomUUID(),
  );
  const [error, setError] = useState("");
  const [cafeForcedNotice, setCafeForcedNotice] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWasteCatalog()
      .then((rows) => {
        if (!cancelled) setCatalog(rows);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message || "تعذر تحميل الأصناف");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const targets = useMemo(
    () =>
      catalog
        ? [
            ...catalog.items.map((item) => ({
              value: `item:${item.id}`,
              label: `${item.name} — ${item.stockUnit}`,
            })),
            ...(catalog.recipes ?? []).map((recipe) => ({
              value: `recipe:${recipe.recipeId}:${recipe.recipeSizeId}`,
              label: `${recipe.recipeName}${recipe.sizeName ? ` — ${recipe.sizeName}` : ""}`,
            })),
            ...catalog.products.map((product) => ({
              value: `product:${product.externalProductId}:${product.externalSizeId ?? 0}`,
              label: `${product.productName}${product.sizeName ? ` — ${product.sizeName}` : ""}`,
            })),
          ]
        : [],
    [catalog],
  );

  async function submit() {
    const [type, idText, sizeText] = targetKey.split(":");
    if (!idText) return;
    const target: CreateWasteBody["target"] =
      type === "recipe"
        ? {
            type: "recipe",
            recipeId: idText,
            recipeSizeId: sizeText,
          }
        : type === "product"
          ? {
              type: "external_product",
              externalProductId: Number(idText),
              externalSizeId: Number(sizeText) || null,
            }
          : { type: "item", itemId: idText };
    setSaving(true);
    setError("");
    try {
      const created = await createWaste({
        clientRequestId,
        warehouse,
        target,
        quantity: Number(quantity),
        reason,
        note: note.trim() || null,
      });
      setTargetKey("");
      setQuantity("");
      setNote("");
      setClientRequestId(crypto.randomUUID());
      onSaved(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الهالك");
    } finally {
      setSaving(false);
    }
  }

  const selectedProduct = targetKey.startsWith("product:");
  const selectedRecipe = targetKey.startsWith("recipe:");
  const selectedUnit = selectedProduct || selectedRecipe;
  const valid = Boolean(
    targetKey &&
      Number(quantity) > 0 &&
      (!selectedUnit || Number.isInteger(Number(quantity))) &&
      (reason !== "other" || note.trim().length > 0),
  );

  if (!catalog) {
    return error ? (
      <ErrorBanner>{error}</ErrorBanner>
    ) : (
      <LoadingState label="جارِ تحميل الأصناف…" />
    );
  }

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {isAdmin && (
          <SelectField
            label="المخزن"
            disabled={saving}
            value={warehouse}
            onChange={(event) => {
              const next = warehouseForWasteTarget(
                targetKey,
                event.target.value as "main" | "cafe",
              );
              setWarehouse(next.warehouse);
              setCafeForcedNotice(next.cafeForced);
              setClientRequestId(crypto.randomUUID());
            }}
          >
            <option value="cafe">مخزن الكافيه</option>
            <option value="main">المخزن الرئيسي</option>
          </SelectField>
        )}
        <SearchSelect
          label="الصنف أو المنتج"
          disabled={saving}
          value={targetKey}
          onChange={(next) => {
            setTargetKey(next);
            setClientRequestId(crypto.randomUUID());
            const nextWarehouse = warehouseForWasteTarget(next, warehouse);
            setWarehouse(nextWarehouse.warehouse);
            setCafeForcedNotice(nextWarehouse.cafeForced);
          }}
          options={targets}
          placeholder="اختر الصنف أو منتج الوصفة"
          required
        />
        {(selectedProduct || selectedRecipe) && (
          <p
            className="text-xs text-muted md:col-span-2"
            role={cafeForcedNotice ? "status" : undefined}
          >
            {cafeForcedNotice
              ? "تم تغيير المخزن إلى الكافيه لأن هالك المنتج/الوصفة يُسجل هناك فقط."
              : "الوصفة أو منتج الوصفة يُسجل في مخزن الكافيه فقط."}
          </p>
        )}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">الكمية</span>
          <input
            aria-label="الكمية"
            disabled={saving}
            type="number"
            min="0"
            step={selectedUnit ? 1 : 0.001}
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
              setClientRequestId(crypto.randomUUID());
            }}
            placeholder="الكمية"
            className="input tnum"
          />
        </label>
        <SelectField
          label="سبب الهالك"
          disabled={saving}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value as WasteReason);
            setClientRequestId(crypto.randomUUID());
          }}
        >
          {Object.entries(wasteReasonLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <label className="block space-y-1.5 md:col-span-2">
          <span className="text-sm font-medium">ملاحظات</span>
          <textarea
            aria-label="ملاحظات الهالك"
            disabled={saving}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setClientRequestId(crypto.randomUUID());
            }}
            placeholder={
              reason === "other" ? "اكتب السبب (مطلوب)" : "ملاحظات اختيارية"
            }
            maxLength={500}
            className="input min-h-24"
          />
        </label>
      </div>
      {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}
      <Button onClick={() => void submit()} disabled={saving || !valid} className="mt-4">
        <Trash2 className="size-4" />
        {saving ? "جارِ التسجيل…" : "تسجيل الهالك"}
      </Button>
    </div>
  );
}
