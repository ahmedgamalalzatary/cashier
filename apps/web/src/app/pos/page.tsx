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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import type {
  CurrentShift,
  ExternalProduct,
  ExternalProductCatalog,
  OrderDetail,
  OrderDiscountType,
  OrderSummary,
} from "@cashier/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { OrderReceipt } from "@/components/pos/order-receipt";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/format";
import {
  addCatalogSelection,
  catalogTilePrice,
  cartTotals,
  defaultExternalSize,
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
  const [catalog, setCatalog] = useState<ExternalProductCatalog | null>(null);
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState<ExternalProduct | null>(null);
  const [discountType, setDiscountType] = useState<OrderDiscountType | null>(
    null,
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [cashReceived, setCashReceived] = useState(0);
  // Tile prices depend on the active discount window, so keep a clock in state
  // (rendering must stay pure) and re-check it every minute.
  const [nowMs, setNowMs] = useState(() => Date.now());
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

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

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
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "تعذر تحميل نقطة البيع",
          );
        }
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

  const visibleProducts = useMemo(
    () =>
      filterCatalog(catalog?.products ?? [], {
        categoryId,
        query,
      }),
    [catalog?.products, categoryId, query],
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

  function addProduct(
    product: ExternalProduct,
    externalSizeId: number | null,
    modifiers: Array<{
      externalModifierOptionId: number;
      quantity: number;
    }>,
  ) {
    setCart((current) =>
      addCatalogSelection(
        current,
        product,
        externalSizeId,
        modifiers,
        Date.now(),
      ),
    );
    setSelecting(null);
    setError("");
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
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
        </div>
      )}
      {catalog?.stale && (
        <div className="mx-2 mb-4 rounded-xl bg-accent/10 px-4 py-3 text-sm lg:mx-4">
          الكتالوج الخارجي قديم؛ آخر تحديث ناجح:{" "}
          {new Date(catalog.lastSuccessfulSyncAt).toLocaleString("ar-EG")}
        </div>
      )}
      {!loading && !hasOwnOpenShift && (
        <div className="mx-2 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/35 bg-accent/10 px-4 py-3 text-sm lg:mx-4">
          <span>
            {user?.role === "cashier"
              ? "يجب فتح وردية تخص هذا الكاشير قبل تسجيل البيع."
              : "المدير لا يسجل مبيعات؛ استخدم حساب كاشير."}
          </span>
          <Link className="rounded-lg bg-sidebar px-3 py-2 text-white" href="/shifts">
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
                className="h-12 w-full rounded-xl border border-line bg-paper pe-12 ps-4 text-sm outline-none focus:border-primary"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <CategoryButton active={categoryId === null} onClick={() => setCategoryId(null)}>
                الكل
              </CategoryButton>
              {(catalog?.categories ?? [])
                .filter((category) => category.isActive && category.isVisible)
                .map((category) => (
                  <CategoryButton
                    key={category.externalId}
                    active={categoryId === category.externalId}
                    onClick={() => setCategoryId(category.externalId)}
                  >
                    {category.nameAr}
                  </CategoryButton>
                ))}
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-line bg-surface p-12 text-center text-muted">
              جارِ تحميل قائمة البيع…
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-12 text-center">
              <ReceiptText className="mx-auto mb-3 size-8 text-muted" />
              <p className="font-medium">لا توجد منتجات جاهزة للبيع</p>
              <p className="mt-1 text-sm text-muted">
                المنتجات غير المتاحة أو غير المكتملة لا تظهر هنا.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {visibleProducts.map((product) => (
                <button
                  type="button"
                  key={product.externalId}
                  onClick={() => setSelecting(product)}
                  className="rounded-2xl border border-line bg-surface p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary"
                >
                  <p className="font-bold">{product.nameAr}</p>
                  <p className="text-xs text-muted" dir="ltr">
                    {product.nameEn}
                  </p>
                  <p className="mt-4 font-bold text-primary">
                    {formatMoney(catalogTilePrice(product, nowMs))}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="pos-ticket overflow-hidden rounded-2xl border border-line bg-surface shadow-sm xl:sticky xl:top-6">
          <div className="flex items-center gap-2 bg-sidebar px-4 py-3 text-white">
            <ShoppingBasket className="size-4" /> تذكرة الطلب
          </div>
          <div className="max-h-[42vh] min-h-40 space-y-2 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center text-center text-muted">
                <ShoppingBasket className="mb-2 size-8 opacity-40" />
                <p>الطلب فارغ</p>
              </div>
            ) : (
              cart.map((line) => (
                <CartRow
                  key={line.key}
                  line={line}
                  onQuantity={(quantity) =>
                    setCart((current) =>
                      setCartLineQuantity(current, line.key, quantity),
                    )
                  }
                />
              ))
            )}
          </div>

          <div className="space-y-3 border-t border-line p-4">
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="نوع الخصم"
                value={discountType ?? ""}
                onChange={(event) =>
                  setDiscountType(
                    (event.target.value || null) as OrderDiscountType | null,
                  )
                }
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              >
                <option value="">بدون خصم</option>
                <option value="percent">خصم نسبة</option>
                <option value="fixed">خصم ثابت</option>
              </select>
              <input
                aria-label="قيمة الخصم"
                type="number"
                min="0"
                step="0.01"
                disabled={discountType === null}
                value={discountValue || ""}
                onChange={(event) => setDiscountValue(Number(event.target.value))}
                className="rounded-lg border border-line px-3 py-2 text-sm"
              />
            </div>
            <input
              aria-label="النقد المستلم"
              type="number"
              min="0"
              step="0.01"
              value={cashReceived || ""}
              onChange={(event) => setCashReceived(Number(event.target.value))}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
            <div className="space-y-1 text-sm">
              <Total label="الإجمالي الفرعي" value={totals.subtotal} />
              <Total label="الخصم" value={totals.discountAmount} />
              <Total label="المطلوب" value={totals.total} strong />
              <Total label="الباقي" value={totals.change} />
            </div>
            <Button
              className="w-full justify-center"
              disabled={!canComplete}
              onClick={() => void completeOrder()}
            >
              <Banknote className="size-4" />
              {saving ? "جارِ الحفظ…" : "إتمام البيع"}
            </Button>
          </div>
        </aside>
      </div>

      <section className="mx-2 mt-5 rounded-2xl border border-line bg-surface p-4 lg:mx-4">
        <h2 className="mb-3 font-bold">آخر الطلبات</h2>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {recentOrders.slice(0, 9).map((order) => (
            <button
              type="button"
              key={order.id}
              onClick={() => void openReceipt(order.id)}
              className="flex items-center justify-between rounded-xl border border-line p-3 text-start hover:border-primary"
            >
              <span>
                <span className="block font-medium">{order.orderNumber}</span>
                <span className="text-xs text-muted">{order.cashierName}</span>
              </span>
              <span className="font-bold">{formatMoney(order.total)}</span>
            </button>
          ))}
        </div>
      </section>

      {selecting && (
        <ProductSelectionModal
          product={selecting}
          onClose={() => setSelecting(null)}
          onAdd={(sizeId, modifiers) => addProduct(selecting, sizeId, modifiers)}
        />
      )}
      <Modal
        open={receipt !== null}
        title={receipt ? `إيصال ${receipt.orderNumber}` : "الإيصال"}
        onClose={() => setReceipt(null)}
        panelClassName="pos-receipt-dialog"
      >
        {receipt && (
          <>
            <OrderReceipt order={receipt} />
            <Button className="mt-4 w-full justify-center" onClick={() => window.print()}>
              <Printer className="size-4" /> طباعة
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
}

function ProductSelectionModal({
  product,
  onClose,
  onAdd,
}: {
  product: ExternalProduct;
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
                  className={`rounded-lg border px-3 py-2 text-sm ${sizeId === size.externalId ? "border-primary bg-primary text-white" : "border-line"}`}
                >
                  {size.nameAr} · {formatMoney(size.price)}
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
            <section key={group.externalId} className="space-y-2 rounded-xl border border-line p-4">
              <div className="flex justify-between gap-2">
                <h3 className="font-semibold">
                  {group.nameAr} {group.isRequired ? "(مطلوبة)" : ""}
                </h3>
                <span className="text-xs text-muted">
                  {selected}/{group.maxSelections}
                </span>
              </div>
              {group.options.map((option) => (
                <div key={option.externalId} className="flex items-center justify-between gap-3 rounded-lg bg-paper p-2">
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
                      className="rounded-md border border-line p-1"
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
                      className="rounded-md border border-line p-1 disabled:opacity-40"
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
            disabled={!groupsValid || (product.sizes.length > 0 && sizeId === null)}
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

function CartRow({
  line,
  onQuantity,
}: {
  line: PosCartLine;
  onQuantity: (quantity: number) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper/60 p-3">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-medium">{line.productName}</p>
          <p className="text-xs text-muted">
            {[line.sizeName, ...line.modifiers.map((modifier) => `${modifier.name} × ${modifier.quantity}`)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="font-bold">
          {formatMoney(Number(line.unitPrice) * line.quantity)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => onQuantity(line.quantity - 1)} className="rounded-md border border-line p-1">
          <Minus className="size-4" />
        </button>
        <span>{line.quantity}</span>
        <button type="button" onClick={() => onQuantity(line.quantity + 1)} className="rounded-md border border-line p-1">
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

function CategoryButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm ${active ? "bg-sidebar text-white" : "bg-paper text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Total({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-bold" : ""}`}>
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}
