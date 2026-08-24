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
import Link from "next/link";
import type {
  OrderDetail,
  OrderDiscountType,
  OrderSummary,
  PosCatalogProduct,
  CurrentShift,
} from "@cashier/shared";
import { useAuth } from "@/components/auth/auth-provider";
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
import { getCurrentShift } from "@/services/shifts-service";

export default function PosPage() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<PosCatalogProduct[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [mainCategoryId, setMainCategoryId] = useState<number | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [discountType, setDiscountType] = useState<OrderDiscountType | null>(
    null,
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [cashReceived, setCashReceived] = useState(0);
  const [ticketTab, setTicketTab] = useState<"ticket" | "orders">("ticket");
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
    Promise.all([listCatalog(), listOrders(), getCurrentShift()])
      .then(([catalogRows, orderRows, shift]) => {
        if (cancelled) return;
        setCatalog(catalogRows);
        setRecentOrders(orderRows);
        setCurrentShift(shift);
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
  const detailedCurrentShift =
    currentShift && !("occupied" in currentShift) ? currentShift : null;
  const hasOwnOpenShift =
    user?.role === "cashier" && detailedCurrentShift?.cashierUserId === user.id;
  const canComplete =
    hasOwnOpenShift &&
    cart.length > 0 &&
    totals.discountValid &&
    totals.hasEnoughCash &&
    !saving;

  function chooseMainCategory(id: number | null) {
    setMainCategoryId(id);
    setSubCategoryId(null);
  }

  function addProduct(product: PosCatalogProduct, recipeSizeId?: number) {
    setCart((current) => addCatalogSelection(current, product, recipeSizeId));
    // The ticket now shares its panel with the order history, so a product
    // added while browsing past orders would otherwise land out of sight.
    setTicketTab("ticket");
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

      {!loading && !hasOwnOpenShift && (
        <div className="mx-2 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/35 bg-accent/10 px-4 py-3 text-sm lg:mx-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              {detailedCurrentShift
                ? `البيع متوقف لأن الوردية المفتوحة تخص ${detailedCurrentShift.cashierName}.`
                : currentShift
                  ? "البيع متوقف لأن درج النقدية مستخدم في وردية كاشير آخر."
                  : user?.role === "cashier"
                    ? "يجب فتح وردية قبل تسجيل أي عملية بيع."
                    : "المدير لا يفتح ورديات أو يسجل مبيعات؛ استخدم حساب كاشير."}
            </span>
          </div>
          <Link
            href="/shifts"
            className="rounded-lg bg-sidebar px-3 py-2 font-medium text-white hover:bg-ink"
          >
            الذهاب إلى الورديات
          </Link>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <section className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
            <label className="relative block">
              <Search className="pointer-events-none absolute inset-y-0 right-4 my-auto size-5 text-muted" />
              <input
                aria-label="ابحث باسم المنتج"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث باسم المنتج"
                className="h-12 w-full rounded-xl border border-line bg-paper pe-12 ps-4 text-sm outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/10"
              />
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
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
                  <span
                    aria-hidden
                    className={`tint-dot size-2 rounded-full ${tintClass(category.id)}`}
                  />
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
        </section>

        <aside className="pos-ticket overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_20px_45px_-32px_rgba(43,33,24,0.55)] xl:sticky xl:top-6">
          <div className="flex gap-1 bg-sidebar px-2 pt-2">
            <button
              type="button"
              onClick={() => setTicketTab("ticket")}
              aria-pressed={ticketTab === "ticket"}
              className={ticketTabClass(ticketTab === "ticket")}
            >
              <ShoppingBasket className="size-4" />
              تذكرة الطلب
              {cart.length > 0 && (
                <span className={ticketTabBadge(ticketTab === "ticket")}>
                  {cart.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTicketTab("orders")}
              aria-pressed={ticketTab === "orders"}
              className={ticketTabClass(ticketTab === "orders")}
            >
              <ReceiptText className="size-4" />
              آخر الطلبات
              {recentOrders.length > 0 && (
                <span className={ticketTabBadge(ticketTab === "orders")}>
                  {recentOrders.length}
                </span>
              )}
            </button>
          </div>

          {ticketTab === "orders" ? (
            <RecentOrdersPanel orders={recentOrders} onOpen={openReceipt} />
          ) : (
            <>
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
                    <TotalRow
                      label="الخصم"
                      value={-totals.discountAmount}
                      muted
                    />
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
            </>
          )}
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
    <article
      className={`catalog-card flex flex-col rounded-2xl border-2 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tintClass(product.mainCategoryId)}`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="catalog-thumb grid size-11 shrink-0 place-items-center rounded-xl text-xl font-bold"
        >
          {product.name.trim().charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold leading-tight">
            {product.name}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted">
            {product.subCategoryName ?? product.mainCategoryName}
          </p>
        </div>
        {product.type === "item" && (
          <span className="catalog-badge shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold">
            {product.stockUnit}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {product.type === "recipe" ? (
          product.sizes.map((size) => (
            <button
              type="button"
              key={size.id}
              onClick={() => onAdd(product, size.id)}
              className="catalog-option min-h-11 flex-1 basis-20 rounded-xl border border-line bg-paper px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {size.name}
            </button>
          ))
        ) : (
          <button
            type="button"
            onClick={() => onAdd(product)}
            className="catalog-option flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-paper px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus className="size-4" />
            إضافة
          </button>
        )}
      </div>
    </article>
  );
}

function RecentOrdersPanel({
  orders,
  onOpen,
}: {
  orders: OrderSummary[];
  onOpen: (id: number) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center p-6 text-center text-muted">
        <ReceiptText className="mb-2 size-8 opacity-40" />
        <p className="text-sm font-medium text-ink">لا توجد مبيعات مسجلة بعد</p>
        <p className="mt-1 text-xs">أول طلب تُتمّه سيظهر هنا لإعادة طباعته.</p>
      </div>
    );
  }
  return (
    <div className="max-h-[68vh] min-h-56 overflow-y-auto p-3">
      <p className="mb-2 px-1 text-xs text-muted">اختر أي طلب لإعادة طباعته</p>
      <ul className="space-y-1.5">
        {orders.slice(0, 12).map((order, index) => (
          <li key={order.id}>
            <button
              type="button"
              onClick={() => onOpen(order.id)}
              className="group flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-right transition hover:border-primary/45 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="min-w-0">
                <span
                  className="block truncate text-[13px] font-bold tnum"
                  dir="ltr"
                >
                  {order.orderNumber}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  <Clock3 className="size-3" />
                  {new Date(order.createdAt).toLocaleTimeString("ar-EG", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {index === 0 && (
                    <span className="rounded-full bg-accent/20 px-1.5 font-bold text-primary">
                      الأحدث
                    </span>
                  )}
                  {order.isNegativeStock && (
                    <AlertTriangle
                      role="img"
                      className="size-3 text-danger"
                      aria-label="حُفظ برصيد مخزون سالب"
                    />
                  )}
                </span>
              </span>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-muted transition group-hover:border-primary group-hover:bg-surface group-hover:text-primary">
                <Printer className="size-4" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
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
          onChange={(event) => {
            if (event.target.value === "") return;
            const quantity = Number(event.target.value);
            if (Number.isNaN(quantity)) return;
            onQuantity(quantity);
          }}
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

const TINT_COUNT = 8;

/* Categories are the only grouping a cashier can see at a glance now that no
   price is printed on a card, so the tone must stay put for a given category. */
function tintClass(categoryId: number) {
  return `tint-${((categoryId % TINT_COUNT) + TINT_COUNT) % TINT_COUNT}`;
}

function categoryTab(active: boolean) {
  return `inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    active
      ? "bg-sidebar text-white shadow-sm"
      : "bg-paper text-muted hover:bg-line/60 hover:text-ink"
  }`;
}

function ticketTabClass(active: boolean) {
  return `flex flex-1 items-center justify-center gap-2 rounded-t-xl px-3 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    active
      ? "bg-surface text-ink"
      : "text-sidebar-ink hover:bg-white/10 hover:text-white"
  }`;
}

function ticketTabBadge(active: boolean) {
  return `min-w-5 rounded-full px-1.5 text-xs tnum ${
    active ? "bg-primary/10 text-primary" : "bg-white/15 text-white"
  }`;
}

function subCategoryTab(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    active
      ? "border-primary bg-primary/10 text-primary"
      : "border-line text-muted hover:border-primary/40 hover:text-ink"
  }`;
}
