"use client";

import {
  AlertTriangle,
  Banknote,
  Clock3,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBasket,
  Trash2,
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
import { CashierShiftControls } from "@/components/shifts/cashier-shift-controls";
import { ExpenseEntryForm } from "@/components/expenses/expense-entry-form";
import { OrderPicker } from "@/components/refunds/order-picker";
import { RefundOrderModal } from "@/components/refunds/refund-order-modal";
import { WasteEntryForm } from "@/components/waste/waste-entry-form";
import type {
  CurrentShift,
  ExternalProduct,
  InventoryStockRow,
  PosCatalog,
  OrderDetail,
  OrderDiscountType,
  OrderSummary,
} from "@cashier/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { OrderReceipt } from "@/components/pos/order-receipt";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/format";
import { catalogRefreshOutcome } from "@/models/catalog-refresh";
import {
  addCatalogSelection,
  addLocalSelection,
  cartLineTotal,
  catalogSizePrice,
  catalogTilePrice,
  cartTotals,
  defaultExternalSize,
  filterCatalog,
  filterLocalCatalog,
  isOwnOpenShift,
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
import { getCafeWarehouseStock } from "@/services/inventory-service";
import {
  getProductRefreshStatus,
  refreshProducts,
} from "@/services/products-service";

export default function PosPage() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<PosCatalog | null>(null);
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [catalogSource, setCatalogSource] = useState<"local" | "external">(
    "local",
  );
  const [mainCategoryId, setMainCategoryId] = useState<number | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<number | null>(null);
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
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [refundPicking, setRefundPicking] = useState(false);
  const [refundingOrderId, setRefundingOrderId] = useState<number | null>(null);
  const [wasting, setWasting] = useState(false);
  const [expensing, setExpensing] = useState(false);
  const [error, setError] = useState("");
  // Cafe stock is information only on POS (T4): it never blocks a sale.
  const [cafeStock, setCafeStock] = useState<Map<number, InventoryStockRow>>(
    () => new Map(),
  );
  const checkoutAttempt = useRef<{
    fingerprint: string;
    clientRequestId: string;
  } | null>(null);

  const refreshOrders = useCallback(async () => {
    setRecentOrders(await listOrders());
  }, []);

  const refreshCafeStock = useCallback(async () => {
    // Stock badges are informational only (T4), so failures stay silent.
    const rows = await getCafeWarehouseStock().catch(() => null);
    if (rows) setCafeStock(new Map(rows.map((row) => [row.itemId, row])));
  }, []);

  const refreshShiftTotals = useCallback(async () => {
    const shift = await getCurrentShift().catch(() => null);
    if (shift) setCurrentShift(shift);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!refreshingCatalog) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void getProductRefreshStatus()
        .then(async (status) => {
          if (cancelled) return;
          const outcome = catalogRefreshOutcome(status);
          if (outcome === "failed") {
            setError(status.lastError ?? "تعذر تحديث المنتجات الخارجية");
            setRefreshingCatalog(false);
            return;
          }
          if (outcome === "worker-unavailable") {
            setError("خدمة تحديث المنتجات غير متاحة الآن");
            setRefreshingCatalog(false);
            return;
          }
          if (outcome === "pending") return;
          setRefreshingCatalog(false);
          setCatalog(await listCatalog());
        })
        .catch(() => undefined);
    }, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshingCatalog]);

  async function requestCatalogRefresh() {
    setRefreshingCatalog(true);
    setError("");
    try {
      await refreshProducts();
    } catch (caught) {
      setRefreshingCatalog(false);
      setError(
        caught instanceof Error ? caught.message : "تعذر طلب تحديث الكتالوج",
      );
    }
  }

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
            caught instanceof Error ? caught.message : "تعذر تحميل نقطة البيع",
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
    const refreshShift = () => {
      getCurrentShift()
        .then(setCurrentShift)
        .catch(() => undefined);
      // Stock badges are informational (T4), so a failure is silent.
      getCafeWarehouseStock()
        .then((rows) =>
          setCafeStock(new Map(rows.map((row) => [row.itemId, row]))),
        )
        .catch(() => undefined);
    };
    refreshShift();
    const interval = window.setInterval(refreshShift, 30_000);
    window.addEventListener("focus", refreshShift);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshShift);
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
  const visibleLocalProducts = filterLocalCatalog(
    catalog?.localProducts ?? [],
    catalog?.localCategories ?? [],
    { mainCategoryId, subCategoryId, query },
  );
  const hasOwnOpenShift = isOwnOpenShift(currentShift, user);
  const quickCash = useMemo(
    () => quickCashOptions(totals.total),
    [totals.total],
  );
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
      const freshShift = await getCurrentShift().catch(() => null);
      setCurrentShift(freshShift);
      if (!isOwnOpenShift(freshShift, user)) {
        setError("تغيرت حالة الوردية — تحقق منها قبل إتمام البيع");
        return;
      }
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
      void refreshCafeStock();
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
    <div className="pos-workspace">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.01em]">نقطة البيع</h1>
          <p className="mt-1 text-sm text-muted">الكاونتر · تيك أواي</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user?.role === "cashier" && (
            <CashierShiftControls
              current={currentShift}
              onChanged={setCurrentShift}
              disabled={loading || saving}
            />
          )}
          {hasOwnOpenShift && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setRefundPicking(true);
                  setError("");
                }}
              >
                <RotateCcw className="size-4" /> مرتجع
              </Button>
              <Button variant="secondary" onClick={() => setWasting(true)}>
                <Trash2 className="size-4" /> هالك
              </Button>
              <Button variant="secondary" onClick={() => setExpensing(true)}>
                <ReceiptText className="size-4" /> مصروف درج
              </Button>
            </>
          )}
          {user?.role === "admin" && (
            <Button
              variant="ghost"
              disabled={refreshingCatalog}
              onClick={() => void requestCatalogRefresh()}
            >
              <RefreshCw
                className={`size-4 ${refreshingCatalog ? "animate-spin" : ""}`}
              />
              تحديث الكتالوج
            </Button>
          )}
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm text-muted">
            <Clock3 className="size-4 text-primary" />
            <span className="tnum">{recentOrders.length} طلب محفوظ حديثاً</span>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="error-banner mb-4 flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
        </div>
      )}
      {catalog?.stale && (
        <div className="mb-4 rounded-xl bg-accent/10 px-4 py-3 text-sm">
          الكتالوج الخارجي قديم؛ آخر تحديث ناجح:{" "}
          {catalog.lastSuccessfulSyncAt
            ? new Date(catalog.lastSuccessfulSyncAt).toLocaleString("ar-EG")
            : "لم تتم المزامنة بعد"}
        </div>
      )}
      {!loading && !hasOwnOpenShift && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/35 bg-accent/10 px-4 py-3 text-sm">
          <span>
            {user?.role === "cashier"
              ? "يجب فتح وردية تخص هذا الكاشير قبل تسجيل البيع."
              : "المدير لا يسجل مبيعات؛ استخدم حساب كاشير."}
          </span>
          {user?.role === "admin" && (
            <Link
              className="rounded-lg bg-sidebar px-3 py-2 text-white"
              href="/shifts"
            >
              إدارة الورديات
            </Link>
          )}
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <section className="min-w-0 space-y-4">
          <div className="sheet p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted" />
              <input
                aria-label="ابحث باسم المنتج"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث باسم المنتج"
                className="input h-12 rounded-xl bg-paper ps-12 text-base"
              />
            </label>
            <Tabs
              idPrefix="pos-catalog"
              items={[
                { id: "local", label: "المنتجات المحلية" },
                { id: "external", label: "المنتجات الخارجية" },
              ]}
              active={catalogSource}
              onChange={setCatalogSource}
              ariaLabel="مصدر المنتجات"
              className="mt-3 border-0 bg-transparent p-0"
            />
            {catalogSource === "local" ? (
              <>
                <div
                  className="flex flex-wrap gap-2 mt-3"
                  aria-label="الأقسام الرئيسية"
                >
                  <CategoryButton
                    active={mainCategoryId === null}
                    onClick={() => {
                      setMainCategoryId(null);
                      setSubCategoryId(null);
                    }}
                  >
                    الكل
                  </CategoryButton>
                  {(catalog?.localCategories ?? [])
                    .filter((category) => category.parentId === null)
                    .map((category) => (
                      <CategoryButton
                        key={category.id}
                        active={mainCategoryId === category.id}
                        onClick={() => {
                          setMainCategoryId(category.id);
                          setSubCategoryId(null);
                        }}
                      >
                        {category.name}
                      </CategoryButton>
                    ))}
                </div>
                {mainCategoryId !== null && (
                  <div
                    className="flex flex-wrap gap-2 mt-3"
                    aria-label="الأقسام الفرعية"
                  >
                    <CategoryButton
                      active={subCategoryId === null}
                      onClick={() => setSubCategoryId(null)}
                    >
                      كل القسم
                    </CategoryButton>
                    {(catalog?.localCategories ?? [])
                      .filter(
                        (category) => category.parentId === mainCategoryId,
                      )
                      .map((category) => (
                        <CategoryButton
                          key={category.id}
                          active={subCategoryId === category.id}
                          onClick={() => setSubCategoryId(category.id)}
                        >
                          {category.name}
                        </CategoryButton>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-wrap gap-2 mt-3">
                <CategoryButton
                  active={categoryId === null}
                  onClick={() => setCategoryId(null)}
                >
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
            )}
          </div>

          <TabPanel idPrefix="pos-catalog" active={catalogSource}>
            {loading ? (
              <div className="sheet p-12 text-center text-sm text-muted">
                جارِ تحميل قائمة البيع…
              </div>
            ) : (catalogSource === "local"
                ? visibleLocalProducts.length
                : visibleProducts.length) === 0 ? (
              <div className="empty-state">
                <ReceiptText className="mx-auto mb-3 size-8 text-muted" />
                <p className="font-medium">لا توجد منتجات جاهزة للبيع</p>
                <p className="mt-1 text-sm text-muted">
                  المنتجات غير المتاحة أو غير المكتملة لا تظهر هنا.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {catalogSource === "local"
                  ? visibleLocalProducts.map((product) => (
                      <button
                        type="button"
                        key={`item:${product.id}`}
                        // Stock badges are informational only (T4): the tile
                        // stays clickable whatever the balance is.
                        onClick={() => {
                          setCart((current) =>
                            addLocalSelection(current, product),
                          );
                          setError("");
                        }}
                        className="flex min-h-[6.5rem] flex-col justify-between rounded-2xl border border-line bg-surface p-4 text-start transition hover:border-primary hover:shadow-md"
                      >
                        <div>
                          <p className="font-bold">{product.name}</p>
                          <p className="text-xs text-muted">
                            {product.stockUnit}
                          </p>
                          {(() => {
                            const stock = cafeStock.get(product.id);
                            if (!stock) return null;
                            const qty = Number(stock.quantity);
                            return (
                              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                                <span className="tnum">
                                  المتاح:{" "}
                                  {qty.toLocaleString("ar-EG", {
                                    maximumFractionDigits: 3,
                                  })}{" "}
                                  {stock.stockUnit}
                                </span>
                                {qty <= 0 ? (
                                  <Badge tone="danger">نفد من الكافيه</Badge>
                                ) : stock.isLowStock ? (
                                  <Badge tone="danger">منخفض</Badge>
                                ) : null}
                              </p>
                            );
                          })()}
                        </div>
                        <p className="mt-3 inline-flex w-fit rounded-lg bg-primary/10 px-2.5 py-1 font-bold text-primary">
                          {formatMoney(product.sellingPrice)}
                        </p>
                      </button>
                    ))
                  : visibleProducts.map((product) => (
                      <button
                        type="button"
                        key={product.externalId}
                        onClick={() => setSelecting(product)}
                        className="flex min-h-[6.5rem] flex-col justify-between rounded-2xl border border-line bg-surface p-4 text-start transition hover:border-primary hover:shadow-md"
                      >
                        <div>
                          <p className="font-bold">{product.nameAr}</p>
                          <p className="text-xs text-muted" dir="ltr">
                            {product.nameEn}
                          </p>
                        </div>
                        <p className="mt-3 inline-flex w-fit rounded-lg bg-primary/10 px-2.5 py-1 font-bold text-primary">
                          {formatMoney(catalogTilePrice(product, nowMs))}
                        </p>
                      </button>
                    ))}
              </div>
            )}
          </TabPanel>
        </section>

        <aside className="pos-ticket overflow-hidden rounded-2xl border border-line bg-surface xl:sticky xl:top-6">
          <div className="flex items-center gap-2 bg-sidebar px-4 py-3 text-white">
            <ShoppingBasket className="size-4" /> تذكرة الطلب
          </div>
          <div className="max-h-[42vh] min-h-40 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center text-center text-muted">
                <ShoppingBasket className="mb-2 size-8 opacity-40" />
                <p>الطلب فارغ</p>
              </div>
            ) : (
              <div className="ledger">
                {cart.map((line) => (
                  <CartRow
                    key={line.key}
                    line={line}
                    onQuantity={(quantity) =>
                      setCart((current) =>
                        setCartLineQuantity(current, line.key, quantity),
                      )
                    }
                    onRemove={() =>
                      setCart((current) =>
                        setCartLineQuantity(current, line.key, 0),
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-line p-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">الخصم</span>
                <select
                  aria-label="نوع الخصم"
                  value={discountType ?? ""}
                  onChange={(event) =>
                    setDiscountType(
                      (event.target.value || null) as OrderDiscountType | null,
                    )
                  }
                  className="input"
                >
                  <option value="">بدون خصم</option>
                  <option value="percent">خصم نسبة</option>
                  <option value="fixed">خصم ثابت</option>
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">قيمة الخصم</span>
                <input
                  aria-label="قيمة الخصم"
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={discountType === null}
                  value={discountValue || ""}
                  onChange={(event) =>
                    setDiscountValue(Number(event.target.value))
                  }
                  className="input tnum"
                />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium">النقد المستلم</span>
              <input
                aria-label="النقد المستلم"
                type="number"
                min="0"
                step="0.01"
                value={cashReceived || ""}
                onChange={(event) =>
                  setCashReceived(Number(event.target.value))
                }
                placeholder="النقد المستلم"
                className="input tnum"
              />
            </label>
            {totals.total > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCashReceived(totals.total)}
                >
                  بالضبط
                </Button>
                {quickCash.map((amount) => (
                  <Button
                    key={amount}
                    variant="secondary"
                    size="sm"
                    onClick={() => setCashReceived(amount)}
                  >
                    {formatMoney(amount)}
                  </Button>
                ))}
              </div>
            )}
            <div className="space-y-1 text-sm">
              <Total label="الإجمالي الفرعي" value={totals.subtotal} />
              <Total label="الخصم" value={totals.discountAmount} />
              <Total label="المطلوب" value={totals.total} strong />
              <Total label="الباقي" value={totals.change} />
            </div>
            <Button
              className="h-11 w-full justify-center"
              disabled={!canComplete}
              onClick={() => void completeOrder()}
            >
              <Banknote className="size-4" />
              {saving ? "جارِ الحفظ…" : "إتمام البيع"}
            </Button>
          </div>
        </aside>
      </div>

      <section className="mt-5 sheet p-4">
        <h2 className="mb-3 font-bold">آخر الطلبات</h2>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {recentOrders.slice(0, 9).map((order) => (
            <button
              type="button"
              key={order.id}
              onClick={() => void openReceipt(order.id)}
              className="flex items-center justify-between rounded-xl border border-line p-3 text-start transition-colors hover:border-primary"
            >
              <span>
                <span className="block font-medium">{order.orderNumber}</span>
                <span className="text-xs text-muted">{order.cashierName}</span>
              </span>
              <span className="tnum font-bold">{formatMoney(order.total)}</span>
            </button>
          ))}
        </div>
      </section>

      {selecting && (
        <ProductSelectionModal
          product={selecting}
          nowMs={nowMs}
          onClose={() => setSelecting(null)}
          onAdd={(sizeId, modifiers) =>
            addProduct(selecting, sizeId, modifiers)
          }
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
            <div className="mt-4 flex flex-col gap-2">
              {hasOwnOpenShift && (
                <Button
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={() => setRefundingOrderId(receipt.id)}
                >
                  <RotateCcw className="size-4" /> مرتجع لهذا الطلب
                </Button>
              )}
              <Button
                className="w-full justify-center"
                onClick={() => window.print()}
              >
                <Printer className="size-4" /> طباعة
              </Button>
            </div>
          </>
        )}
      </Modal>

      {refundPicking && (
        <Modal open title="اختر الطلب" onClose={() => setRefundPicking(false)}>
          <OrderPicker
            orders={recentOrders}
            onPick={(orderId) => {
              setRefundPicking(false);
              setRefundingOrderId(orderId);
            }}
          />
        </Modal>
      )}
      {refundingOrderId !== null && (
        <RefundOrderModal
          orderId={refundingOrderId}
          onClose={() => setRefundingOrderId(null)}
          onSaved={() => {
            setRefundingOrderId(null);
            setReceipt(null);
            void refreshOrders().catch(() =>
              setError("تم تسجيل المرتجع، لكن تعذر تحديث الطلبات"),
            );
            void refreshShiftTotals();
            void refreshCafeStock();
          }}
        />
      )}
      {wasting && (
        <Modal open title="تسجيل هالك" onClose={() => setWasting(false)}>
          <WasteEntryForm
            onSaved={() => {
              setWasting(false);
              void refreshShiftTotals();
              void refreshCafeStock();
            }}
          />
        </Modal>
      )}
      {expensing && (
        <Modal
          open
          title="مصروف من درج الوردية"
          onClose={() => setExpensing(false)}
        >
          <ExpenseEntryForm
            onSaved={() => {
              setExpensing(false);
              void refreshShiftTotals();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function ProductSelectionModal({
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

function CartRow({
  line,
  onQuantity,
  onRemove,
}: {
  line: PosCartLine;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-3">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-medium">{line.productName}</p>
          <p className="text-xs text-muted">
            {[
              line.sizeName,
              ...line.modifiers.map(
                (modifier) => `${modifier.name} × ${modifier.quantity}`,
              ),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="flex items-start gap-1">
          <span className="tnum font-bold">
            {formatMoney(cartLineTotal(line))}
          </span>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`حذف ${line.productName}`}
            title="حذف الصنف"
            className="rounded-md p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onQuantity(line.quantity - 1)}
          className="rounded-md border border-line p-1.5"
        >
          <Minus className="size-4" />
        </button>
        <span className="tnum">{line.quantity}</span>
        <button
          type="button"
          onClick={() => onQuantity(line.quantity + 1)}
          className="rounded-md border border-line p-1.5"
        >
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
      data-active={active}
      className="chip"
    >
      {children}
    </button>
  );
}

const CASH_BILLS = [50, 100, 200, 500];

/**
 * "بالضبط" plus the next three round notes above the total, so the cashier
 * rarely touches the keypad.
 */
function quickCashOptions(total: number) {
  if (total <= 0) return [];
  const rounded = [
    ...new Set(CASH_BILLS.map((bill) => Math.ceil(total / bill) * bill)),
  ]
    .filter((amount) => amount > total)
    .sort((a, b) => a - b)
    .slice(0, 3);
  return rounded;
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
    <div
      className={`flex justify-between ${strong ? "text-base font-bold" : ""}`}
    >
      <span>{label}</span>
      <span className="tnum">{formatMoney(value)}</span>
    </div>
  );
}
