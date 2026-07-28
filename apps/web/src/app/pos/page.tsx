"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrderDetail, PosCatalogProduct } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  addCatalogSelection,
  cartTotals,
  filterCatalog,
  orderPayload,
  setCartLineQuantity,
  type DiscountSelection,
  type PosCartLine,
} from "@/models/pos-model";
import { createOrder, listCatalog } from "@/services/orders-service";
import { getCurrentShift } from "@/services/shifts-service";
import { OrderReceipt } from "@/components/pos/order-receipt";

export default function PosPage() {
  const [catalog, setCatalog] = useState<PosCatalogProduct[]>([]);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [query, setQuery] = useState("");
  const [cash, setCash] = useState(0);
  const [discount] = useState<DiscountSelection>({ type: null, value: 0 });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<OrderDetail | null>(null);

  useEffect(() => {
    Promise.all([listCatalog(), getCurrentShift()])
      .then(([rows, shift]) => {
        setCatalog(rows);
        setShiftOpen(Boolean(shift));
        if (!shift) setMessage("يجب فتح وردية قبل تسجيل البيع");
      })
      .catch((error) => setMessage(error.message));
  }, []);

  const shown = useMemo(
    () =>
      filterCatalog(catalog, {
        mainCategoryId: null,
        subCategoryId: null,
        query,
      }),
    [catalog, query],
  );
  const totals = cartTotals(cart, discount, cash);

  function scan(value: string) {
    const exact = catalog.find(
      (variant) =>
        variant.barcode === value.trim() ||
        String(variant.code) === value.trim(),
    );
    if (exact) {
      setCart((current) => addCatalogSelection(current, exact));
      setQuery("");
    }
  }

  async function checkout() {
    if (!cart.length || !totals.hasEnoughCash) return;
    setSaving(true);
    setMessage("");
    try {
      const order = await createOrder({
        clientRequestId: crypto.randomUUID(),
        ...orderPayload(cart, discount, cash),
      });
      setLastOrder(order);
      setCart([]);
      setCash(0);
      setMessage("تم تسجيل البيع بنجاح");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تسجيل البيع");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="grid gap-6 p-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">نقطة البيع</h1>
        <Field
          label="مسح الباركود أو البحث بالمنتج واللون والمقاس"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              scan(query);
            }
          }}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((variant) => (
            <button
              key={variant.variantId}
              type="button"
              onClick={() =>
                setCart((current) => addCatalogSelection(current, variant))
              }
              className="rounded-xl border border-line bg-surface p-4 text-start hover:border-primary"
            >
              <strong className="block">{variant.productName}</strong>
              <span className="text-sm text-muted">
                {variant.colorName} · {variant.sizeName}
              </span>
              <span className="mt-2 block font-semibold">
                {variant.sellingPrice} ج.م
              </span>
              <span className="text-xs text-muted">#{variant.code}</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="space-y-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-lg font-bold">السلة</h2>
        {cart.map((line) => (
          <div key={line.key} className="rounded-lg border border-line p-3">
            <div className="font-medium">{line.productName}</div>
            <div className="text-sm text-muted">
              {line.colorName} · {line.sizeName}
            </div>
            <input
              aria-label="الكمية"
              type="number"
              min={1}
              max={999}
              value={line.quantity}
              onChange={(event) =>
                setCart((current) =>
                  setCartLineQuantity(
                    current,
                    line.key,
                    Number(event.target.value),
                  ),
                )
              }
              className="mt-2 w-24 rounded border border-line px-2 py-1"
            />
          </div>
        ))}
        <div className="border-t border-line pt-3">
          <div>الإجمالي: {totals.total.toFixed(2)} ج.م</div>
          <Field
            label="المبلغ المستلم"
            type="number"
            value={cash}
            onChange={(event) => setCash(Number(event.target.value))}
          />
          <div>الباقي: {totals.change.toFixed(2)} ج.م</div>
        </div>
        {message && <p className="text-sm">{message}</p>}
        <Button
          type="button"
          disabled={
            saving || !shiftOpen || !cart.length || !totals.hasEnoughCash
          }
          onClick={checkout}
          className="w-full"
        >
          {saving ? "جارِ الحفظ…" : "إتمام البيع"}
        </Button>
      </aside>
      {lastOrder && <OrderReceipt order={lastOrder} />}
    </main>
  );
}
