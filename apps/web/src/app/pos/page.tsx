"use client";

import {
  AlertTriangle,
  Banknote,
  Clock3,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  Search,
  ShoppingBasket,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OrderDetail,
  OrderDiscountType,
  OrderSummary,
  PosCatalogProduct,
} from "@cashier/shared";
import { OrderReceipt } from "@/components/pos/order-receipt";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/format";
import {
  addCatalogSelection,
  cartTotals,
  catalogCategories,
  filterCatalog,
  orderPayload,
  setCartLineQuantity,
  type PosCartLine,
} from "@/models/pos-model";
import {
  createOrder,
  getOrder,
  listCatalog,
  listOrders,
} from "@/services/orders-service";

export default function PosPage() {
  const [catalog, setCatalog] = useState<PosCatalogProduct[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [mainCategoryId, setMainCategoryId] = useState<number | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [discountType, setDiscountType] = useState<OrderDiscountType | null>(
    null,
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [cashReceived, setCashReceived] = useState(0);
  const [receipt, setReceipt] = useState<OrderDetail | null>(null);
  const [autoPrintOrderId, setAutoPrintOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const checkoutAttempt = useRef<{
    fingerprint: string;
    clientRequestId: string;
  } | null>(null);

  const refreshOrders = useCallback(async () => {
    setRecentOrders(await listOrders());
  }, []);
  const closeReceipt = useCallback(() => setReceipt(null), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCatalog(), listOrders()])
      .then(([catalogRows, orderRows]) => {
        if (cancelled) return;
        setCatalog(catalogRows);
        setRecentOrders(orderRows);
      })
      .catch((caught) => {
        if (!cancelled)
          setError(
            caught instanceof Error ? caught.message : "تعذر تحميل نقطة البيع",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!receipt || receipt.id !== autoPrintOrderId) return;
    const timer = window.setTimeout(() => {
      window.print();
      setAutoPrintOrderId(null);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [autoPrintOrderId, receipt]);

  const categories = useMemo(() => catalogCategories(catalog), [catalog]);
  const visibleProducts = useMemo(
    () => filterCatalog(catalog, { mainCategoryId, subCategoryId, query }),
    [catalog, mainCategoryId, query, subCategoryId],
  );
  const visibleSubcategories = categories.sub.filter(
    (row) => mainCategoryId === null || row.mainId === mainCategoryId,
  );
  const totals = cartTotals(
    cart,
    { type: discountType, value: discountValue },
    cashReceived,
  );
  const canComplete =
    cart.length > 0 && totals.discountValid && totals.hasEnoughCash && !saving;

  function chooseMainCategory(id: number | null) {
    setMainCategoryId(id);
    setSubCategoryId(null);
  }

  function addProduct(product: PosCatalogProduct, recipeSizeId?: number) {
    setCart((current) => addCatalogSelection(current, product, recipeSizeId));
    setError("");
  }

  function changeQuantity(line: PosCartLine, quantity: number) {
    setCart((current) => setCartLineQuantity(current, line.key, quantity));
  }

  async function completeOrder() {
    if (!canComplete) return;
    setSaving(true);
    setError("");
    try {
      const payload = orderPayload(
        cart,
        { type: discountType, value: discountValue },
        cashReceived,
      );
      const fingerprint = JSON.stringify(payload);
      if (checkoutAttempt.current?.fingerprint !== fingerprint) {
        checkoutAttempt.current = {
          fingerprint,
          clientRequestId: crypto.randomUUID(),
        };
      }
      const saved = await createOrder({
        ...payload,
        clientRequestId: checkoutAttempt.current.clientRequestId,
      });
      setReceipt(saved);
      setAutoPrintOrderId(saved.id);
      setCart([]);
      setDiscountType(null);
      setDiscountValue(0);
      setCashReceived(0);
      checkoutAttempt.current = null;
      void refreshOrders().catch(() => {
        setError("تم حفظ الطلب، لكن تعذر تحديث قائمة الطلبات");
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ الطلب");
    } finally {
      setSaving(false);
    }
  }

  async function openReceipt(id: number) {
    setError("");
    try {
      setReceipt(await getOrder(id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الإيصال");
    }
  }

  return (
    <div className="pos-workspace -m-2 lg:-m-4">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 px-2 lg:px-4">
        <div>
          <p className="mb-1 text-xs font-bold tracking-[0.18em] text-primary">
            الكاونتر · تيك أواي
          </p>
          <h1 className="text-3xl font-bold tracking-tight">نقطة البيع</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm text-muted shadow-sm">
          <Clock3 className="size-4 text-primary" />
          <span>{recentOrders.length} طلب محفوظ حديثاً</span>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mx-2 mb-4 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger lg:mx-4"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <section className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => chooseMainCategory(null)}
                className={categoryTab(mainCategoryId === null)}
              >
                الكل
              </button>
              {categories.main.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => chooseMainCategory(category.id)}
                  className={categoryTab(mainCategoryId === category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>

            {visibleSubcategories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  onClick={() => setSubCategoryId(null)}
                  className={subCategoryTab(subCategoryId === null)}
                >
                  كل الفروع
                </button>
                {visibleSubcategories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    onClick={() => setSubCategoryId(category.id)}
                    className={subCategoryTab(subCategoryId === category.id)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="relative block">
            <Search className="pointer-events-none absolute inset-y-0 right-4 my-auto size-5 text-muted" />
            <input
              aria-label="ابحث باسم المنتج"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث باسم المنتج"
              className="h-12 w-full rounded-xl border border-line bg-surface pe-12 ps-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </label>

          {loading ? (
            <div className="rounded-2xl border border-line bg-surface p-12 text-center text-muted">
              جارِ تحميل قائمة البيع…
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-12 text-center">
              <ReceiptText className="mx-auto mb-3 size-8 text-muted" />
              <p className="font-medium">لا توجد منتجات تطابق هذا الاختيار</p>
              <p className="mt-1 text-sm text-muted">
                غيّر التصنيف أو امسح عبارة البحث.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {visibleProducts.map((product) => (
                <ProductCard
                  key={
                    product.type === "recipe"
                      ? `recipe:${product.recipeId}`
                      : `item:${product.itemId}`
                  }
                  product={product}
                  onAdd={addProduct}
                />
              ))}
            </div>
          )}

          <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-bold">آخر الطلبات</h2>
                <p className="text-xs text-muted">اختر أي طلب لإعادة طباعته</p>
              </div>
              <ReceiptText className="size-5 text-primary" />
            </div>
            {recentOrders.length === 0 ? (
              <p className="rounded-lg bg-paper p-4 text-center text-sm text-muted">
                لا توجد مبيعات مسجلة بعد.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {recentOrders.slice(0, 10).map((order) => (
                  <button
                    type="button"
                    key={order.id}
                    onClick={() => openReceipt(order.id)}
                    className="group flex items-center justify-between rounded-xl border border-line px-3 py-3 text-right transition hover:border-primary/40 hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span>
                      <span className="block text-sm font-bold tnum" dir="ltr">
                        {order.orderNumber}
                      </span>
                      <span className="text-xs text-muted">
                        {new Date(order.createdAt).toLocaleTimeString("ar-EG", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 font-bold tnum">
                      {formatMoney(order.total)}
                      <Printer className="size-4 text-muted group-hover:text-primary" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </section>

        <aside className="pos-ticket overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_20px_45px_-32px_rgba(43,33,24,0.55)] xl:sticky xl:top-6">
          <div className="flex items-center justify-between border-b border-dashed border-line bg-sidebar px-5 py-4 text-white">
            <div>
              <p className="text-xs text-sidebar-ink">تذكرة الطلب</p>
              <h2 className="text-lg font-bold">{cart.length} صنف</h2>
            </div>
            <ShoppingBasket className="size-6 text-accent" />
          </div>

          <div className="max-h-[38vh] min-h-40 space-y-2 overflow-y-auto p-4 xl:max-h-[42vh]">
            {cart.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center text-center text-muted">
                <ShoppingBasket className="mb-2 size-8 opacity-40" />
                <p className="text-sm font-medium text-ink">الطلب فارغ</p>
                <p className="mt-1 text-xs">اضغط على منتج لبدء البيع.</p>
              </div>
            ) : (
              cart.map((line) => (
                <CartRow
                  key={line.key}
                  line={line}
                  onQuantity={(quantity) => changeQuantity(line, quantity)}
                />
              ))
            )}
          </div>

          <div className="space-y-4 border-t border-dashed border-line bg-paper/55 p-4">
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <select
                aria-label="نوع الخصم"
                value={discountType ?? "none"}
                onChange={(event) => {
                  const value = event.target.value;
                  setDiscountType(
                    value === "none" ? null : (value as OrderDiscountType),
                  );
                  if (value === "none") setDiscountValue(0);
                }}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="none">بدون خصم</option>
                <option value="percent">نسبة %</option>
                <option value="fixed">قيمة ثابتة</option>
              </select>
              <input
                aria-label="قيمة الخصم"
                type="number"
                min="0"
                max={discountType === "percent" ? 100 : 9_999_999_999.99}
                step="0.01"
                value={discountValue || ""}
                onChange={(event) =>
                  setDiscountValue(Number(event.target.value))
                }
                disabled={discountType === null}
                placeholder="قيمة الخصم"
                dir="ltr"
                className="min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
              />
            </div>
            {!totals.discountValid && (
              <p className="text-xs text-danger">
                راجع قيمة الخصم قبل إتمام الطلب.
              </p>
            )}

            <dl className="space-y-1.5 text-sm">
              <TotalRow label="الإجمالي" value={totals.subtotal} />
              {discountType && (
                <TotalRow label="الخصم" value={-totals.discountAmount} muted />
              )}
              <TotalRow label="المطلوب" value={totals.total} strong />
            </dl>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                النقد المستلم
              </label>
              <div className="relative">
                <Banknote className="pointer-events-none absolute inset-y-0 right-3 my-auto size-5 text-primary" />
                <input
                  aria-label="النقد المستلم"
                  type="number"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  value={cashReceived || ""}
                  onChange={(event) =>
                    setCashReceived(Number(event.target.value))
                  }
                  placeholder="0.00"
                  dir="ltr"
                  className="h-12 w-full rounded-xl border border-line bg-surface pe-11 ps-3 text-left text-lg font-bold tnum outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[totals.total, totals.total + 10, totals.total + 20].map(
                  (amount, index) => (
                    <button
                      type="button"
                      key={`${amount}-${index}`}
                      onClick={() => setCashReceived(amount)}
                      className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium tnum hover:border-primary"
                    >
                      {index === 0 ? "المبلغ بالضبط" : formatMoney(amount)}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-sidebar px-4 py-3 text-white">
              <span className="text-sm text-sidebar-ink">الباقي</span>
              <strong className="text-xl text-accent tnum">
                {formatMoney(totals.change)}
              </strong>
            </div>

            {!totals.hasEnoughCash && cart.length > 0 && (
              <p className="text-xs text-danger">
                المبلغ المستلم أقل من المطلوب.
              </p>
            )}
            <Button
              onClick={completeOrder}
              disabled={!canComplete}
              className="h-12 w-full justify-center text-base shadow-sm"
            >
              <ReceiptText className="size-5" />
              {saving ? "جارِ حفظ الطلب…" : "إتمام البيع وطباعة الإيصال"}
            </Button>
          </div>
        </aside>
      </div>

      {receipt && (
        <Modal
          title={`إيصال ${receipt.orderNumber}`}
          open
          onClose={closeReceipt}
          panelClassName="pos-receipt-dialog"
        >
          <div className="print-controls mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium hover:bg-primary-strong"
            >
              <Printer className="size-4" />
              طباعة مرة أخرى
            </button>
          </div>
          <OrderReceipt order={receipt} />
          {receipt.isNegativeStock && (
            <div className="print-controls mx-auto mt-3 flex max-w-[80mm] gap-2 rounded-xl border border-accent/30 bg-white p-3 text-xs text-ink">
              <AlertTriangle className="size-4 shrink-0 text-primary" />
              تم حفظ البيع مع رصيد مخزون سالب للمراجعة الإدارية.
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function ProductCard({
  product,
  onAdd,
}: {
  product: PosCatalogProduct;
  onAdd: (product: PosCatalogProduct, recipeSizeId?: number) => void;
}) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md">
      <div className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted">
            {product.subCategoryName ?? product.mainCategoryName}
          </p>
          <h3 className="mt-1 text-lg font-bold">{product.name}</h3>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
          {product.type === "recipe" ? "وصفة" : product.stockUnit}
        </span>
      </div>
      <div className="border-t border-line bg-paper/60 p-2">
        {product.type === "recipe" ? (
          <div className="grid gap-1.5">
            {product.sizes.map((size) => (
              <button
                type="button"
                key={size.id}
                onClick={() => onAdd(product, size.id)}
                className="flex min-h-11 items-center justify-between rounded-xl bg-surface px-3 text-sm font-medium transition hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span>{size.name}</span>
                <span className="tnum">{formatMoney(size.sellingPrice)}</span>
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onAdd(product)}
            className="flex min-h-11 w-full items-center justify-between rounded-xl bg-surface px-3 text-sm font-bold transition hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex items-center gap-2">
              <Plus className="size-4" /> إضافة
            </span>
            <span className="tnum">{formatMoney(product.sellingPrice)}</span>
          </button>
        )}
      </div>
    </article>
  );
}

function CartRow({
  line,
  onQuantity,
}: {
  line: PosCartLine;
  onQuantity: (quantity: number) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{line.productName}</p>
          <p className="text-xs text-muted">
            {line.sizeName ?? line.stockUnit} · {formatMoney(line.unitPrice)}
          </p>
        </div>
        <strong className="shrink-0 text-sm tnum">
          {formatMoney(Number(line.unitPrice) * line.quantity)}
        </strong>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`تقليل ${line.productName}`}
          onClick={() => onQuantity(line.quantity - 1)}
          className="grid size-9 place-items-center rounded-lg border border-line hover:border-primary hover:text-primary"
        >
          <Minus className="size-4" />
        </button>
        <input
          aria-label={`كمية ${line.productName}`}
          type="number"
          min={line.type === "recipe" ? 1 : 0.001}
          max={line.type === "recipe" ? 999 : 99_999_999_999.999}
          step={line.type === "recipe" ? 1 : 0.001}
          value={line.quantity}
          onChange={(event) => onQuantity(Number(event.target.value))}
          dir="ltr"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-paper text-center text-sm font-bold tnum outline-none focus:border-primary"
        />
        <button
          type="button"
          aria-label={`زيادة ${line.productName}`}
          onClick={() => onQuantity(line.quantity + 1)}
          className="grid size-9 place-items-center rounded-lg border border-line hover:border-primary hover:text-primary"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        strong ? "border-t border-line pt-2 text-lg font-bold" : ""
      } ${muted ? "text-muted" : ""}`}
    >
      <dt>{label}</dt>
      <dd className="tnum">{formatMoney(value)}</dd>
    </div>
  );
}

function categoryTab(active: boolean) {
  return `min-h-10 rounded-xl px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    active
      ? "bg-sidebar text-white shadow-sm"
      : "bg-paper text-muted hover:bg-line/60 hover:text-ink"
  }`;
}

function subCategoryTab(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    active
      ? "border-primary bg-primary/10 text-primary"
      : "border-line text-muted hover:border-primary/40 hover:text-ink"
  }`;
}
