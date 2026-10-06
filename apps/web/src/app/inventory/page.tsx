"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Ban,
  Boxes,
  Pencil,
  Plus,
  RotateCcw,
  Scale,
  Search,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import type {
  Category,
  InventoryStockRow,
  Item,
  ItemType,
} from "@cashier/shared";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Field, TextAreaField } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Stat, StatStrip } from "@/components/ui/stat";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui/states";
import { ItemFormModal } from "@/components/warehouse/item-form-modal";
import { formatItemCode, formatMoney, sumDecimalValues } from "@/lib/format";
import {
  categoryFilterOptions,
  filterStockRows,
  type StockFilter,
} from "@/models/warehouse-model";
import { listCategories } from "@/services/categories-service";
import {
  getCafeWarehouseStock,
  getMainWarehouseStock,
} from "@/services/inventory-service";
import {
  deactivateItem,
  listItems,
  reactivateItem,
} from "@/services/items-service";
import { createManualAdjustment } from "@/services/stocktakes-service";

const typeLabels: Record<ItemType, string> = {
  raw: "خامة",
  resale: "إعادة بيع",
  prepared: "مُحضّر",
};

type WarehouseTab = "main" | "cafe";

export default function InventoryPage() {
  return (
    <Suspense fallback={<LoadingState label="جارِ تحميل المخزون…" />}>
      <InventoryView />
    </Suspense>
  );
}

function InventoryView() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const searchParams = useSearchParams();
  const requestedCafe = searchParams.get("warehouse") === "cafe";
  const requestedState = searchParams.get("state");
  const [tab, setTab] = useState<WarehouseTab>(
    requestedCafe ? "cafe" : isAdmin ? "main" : "cafe",
  );
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [mainStock, setMainStock] = useState<InventoryStockRow[]>([]);
  const [cafeStock, setCafeStock] = useState<InventoryStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirming, setConfirming] = useState<Item | null>(null);
  const [confirmingBusy, setConfirmingBusy] = useState(false);
  const [confirmingError, setConfirmingError] = useState("");
  const [adjusting, setAdjusting] = useState<InventoryStockRow | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustingBusy, setAdjustingBusy] = useState(false);
  const [adjustingError, setAdjustingError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [state, setState] = useState<StockFilter>(() =>
    requestedState === "low" || (isAdmin && requestedState === "inactive")
      ? requestedState
      : "all",
  );
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Items, categories and main stock are admin-only APIs: one failing call
    // in the batch would break the whole page, so cashiers load cafe stock only.
    type Loaded = [
      Item[],
      Category[],
      InventoryStockRow[],
      InventoryStockRow[],
    ];
    const load: Promise<Loaded> = isAdmin
      ? Promise.all([
          listItems(),
          listCategories(),
          getMainWarehouseStock(),
          getCafeWarehouseStock(),
        ])
      : getCafeWarehouseStock().then((cafeRows): Loaded => [
          [],
          [],
          [],
          cafeRows,
        ]);
    load
      .then(([itemRows, categoryRows, mainRows, cafeRows]) => {
        if (cancelled) return;
        setItems(itemRows);
        setCategories(categoryRows);
        setMainStock(mainRows);
        setCafeStock(cafeRows);
        setError("");
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof Error ? caught.message : "تعذر تحميل بيانات المخزن",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, reloadKey]);

  const stock = tab === "main" ? mainStock : cafeStock;
  const visibleRows = useMemo(
    () => filterStockRows(stock, { query, categoryId, state }, categories),
    [stock, query, categoryId, state, categories],
  );
  const categoryOptions = useMemo(
    () => categoryFilterOptions(categories, stock),
    [categories, stock],
  );
  const activeItems = stock.filter((row) => row.isActive).length;
  const lowStock = stock.filter((row) => row.isLowStock).length;
  const negativeStock = stock.filter((row) => row.isNegativeStock).length;
  const totalValue = sumDecimalValues(stock.map((row) => row.stockValue));

  async function deactivate(item: Item) {
    setConfirmingBusy(true);
    setConfirmingError("");
    try {
      await deactivateItem(item.id);
      setConfirming(null);
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setConfirmingError(
        caught instanceof Error ? caught.message : "تعذر إيقاف الصنف",
      );
    } finally {
      setConfirmingBusy(false);
    }
  }

  async function reactivate(item: Item) {
    try {
      await reactivateItem(item.id);
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر إعادة تفعيل الصنف",
      );
    }
  }

  async function saveAdjustment() {
    if (!adjusting || adjustQty === "" || !adjustNote.trim()) {
      setAdjustingError("أكمل الكمية الفعلية وسبب التسوية");
      return;
    }
    setAdjustingBusy(true);
    setAdjustingError("");
    try {
      await createManualAdjustment({
        warehouse: tab,
        itemId: adjusting.itemId,
        countedQuantity: Number(adjustQty),
        note: adjustNote.trim(),
      });
      setAdjusting(null);
      setAdjustQty("");
      setAdjustNote("");
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setAdjustingError(
        caught instanceof Error ? caught.message : "تعذر حفظ التسوية",
      );
    } finally {
      setAdjustingBusy(false);
    }
  }

  const columns: DataColumn<InventoryStockRow>[] = [
    {
      key: "name",
      header: "الصنف",
      mobile: "primary",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="tnum text-xs text-muted">
            {formatItemCode(row.code)}
          </span>
          <span className="font-medium">{row.name}</span>
        </div>
      ),
    },
    { key: "category", header: "التصنيف", cell: (row) => row.categoryName },
    { key: "type", header: "النوع", cell: (row) => typeLabels[row.type] },
    {
      key: "quantity",
      header: "الرصيد",
      numeric: true,
      cell: (row) => (
        <span
          className={
            row.isLowStock || row.isNegativeStock
              ? "font-medium text-danger"
              : "font-medium"
          }
        >
          {Number(row.quantity).toLocaleString("ar-EG", {
            maximumFractionDigits: 3,
          })}{" "}
          {row.stockUnit}
        </span>
      ),
    },
    {
      key: "minimum",
      header: "حد التنبيه",
      numeric: true,
      cell: (row) =>
        Number(row.minimumLevel).toLocaleString("ar-EG", {
          maximumFractionDigits: 3,
        }),
    },
    {
      key: "value",
      header: "قيمة FIFO",
      numeric: true,
      cell: (row) => formatMoney(row.stockValue),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) =>
        row.isNegativeStock ? (
          <Badge tone="danger">رصيد سالب</Badge>
        ) : row.isLowStock ? (
          <Badge tone="danger">منخفض</Badge>
        ) : (
          <Badge tone={row.isActive ? "success" : "neutral"}>
            {row.isActive ? "متاح" : "موقوف"}
          </Badge>
        ),
    },
  ];

  if (!isAdmin) {
    return (
      <div>
        <PageHeader
          title="مخزن الكافيه"
          description="الأرصدة المتاحة في الكافيه. لطلب كميات من المخزن الرئيسي استخدم صفحة التحويلات."
        />
        {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}
        <div className="toolbar mb-4">
          <label className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
            <input
              aria-label="البحث عن صنف"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث بالاسم أو التصنيف"
              className="input ps-9"
            />
          </label>
          <select
            aria-label="تصفية حسب حالة المخزون"
            value={state}
            onChange={(event) => setState(event.target.value as StockFilter)}
            className="input w-auto"
          >
            <option value="all">كل الحالات</option>
            <option value="low">تحت حد التنبيه</option>
          </select>
        </div>
        {loading ? (
          <LoadingState label="جارِ تحميل الرصيد…" />
        ) : (
          <DataTable
            caption="رصيد مخزن الكافيه"
            rows={filterStockRows(cafeStock, { query, state }, categories)}
            rowKey={(row) => row.itemId}
            columns={columns.filter(
              (column) => !["type", "minimum", "value"].includes(column.key),
            )}
            empty={
              <EmptyState
                icon={<Boxes className="size-8" />}
                title="لا يوجد رصيد في الكافيه بعد"
                description="أنشئ طلب تحويل، ثم يعتمد المدير الكميات المتاحة من المخزن الرئيسي."
              />
            }
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="المخزون"
        description="الأصناف والأرصدة في المخزن الرئيسي ومخزن الكافيه، مع التسويات الفردية."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> صنف جديد
          </Button>
        }
      />

      <Tabs
        idPrefix="inventory"
        items={[
          { id: "main", label: "المخزن الرئيسي" },
          { id: "cafe", label: "مخزن الكافيه" },
        ]}
        active={tab}
        onChange={(next) => {
          setTab(next);
          setCategoryId(null);
        }}
        ariaLabel="اختيار المخزن"
        className="mb-5"
      />

      <StatStrip className="mb-4">
        <Stat
          icon={<Boxes className="size-4" />}
          label="الأصناف النشطة"
          value={String(activeItems)}
        />
        <Stat
          icon={<TriangleAlert className="size-4" />}
          label="تحت حد التنبيه"
          value={String(lowStock)}
          tone={lowStock > 0 ? "danger" : "default"}
        />
        <Stat
          icon={<TriangleAlert className="size-4" />}
          label="أرصدة سالبة"
          value={String(negativeStock)}
          tone={negativeStock > 0 ? "danger" : "default"}
        />
        <Stat
          icon={<WalletCards className="size-4" />}
          label="قيمة الرصيد FIFO"
          value={formatMoney(totalValue)}
        />
      </StatStrip>

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      <div className="toolbar mb-4">
        <label className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
          <input
            aria-label="البحث عن صنف"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث بالاسم أو التصنيف"
            className="input ps-9"
          />
        </label>
        <select
          aria-label="تصفية حسب التصنيف"
          value={categoryId ?? ""}
          onChange={(event) =>
            setCategoryId(
              event.target.value ? Number(event.target.value) : null,
            )
          }
          className="input w-auto"
        >
          <option value="">كل التصنيفات</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <select
          aria-label="تصفية حسب حالة المخزون"
          value={state}
          onChange={(event) => setState(event.target.value as StockFilter)}
          className="input w-auto"
        >
          <option value="all">كل الحالات</option>
          <option value="low">تحت حد التنبيه</option>
          <option value="inactive">الأصناف الموقوفة</option>
        </select>
      </div>

      <TabPanel idPrefix="inventory" active={tab}>
        {loading ? (
          <LoadingState label="جارِ تحميل دفتر المخزن…" />
        ) : (
          <DataTable
            caption="أرصدة المخزون"
            rows={visibleRows}
            rowKey={(row) => row.itemId}
            rowClassName={(row) => (row.isActive ? undefined : "opacity-55")}
            columns={columns}
            empty={
              stock.length === 0 ? (
                <EmptyState
                  icon={<Boxes className="size-8" />}
                  title="المخزن لا يحتوي على أصناف بعد"
                  description="أضف أول صنف، ثم سجّل فاتورة شراء لتعبئة رصيده."
                  action={
                    <Button
                      onClick={() => {
                        setEditing(null);
                        setFormOpen(true);
                      }}
                    >
                      <Plus className="size-4" /> صنف جديد
                    </Button>
                  }
                />
              ) : (
                <p className="empty-state text-sm text-muted">
                  لا توجد أصناف تطابق عوامل التصفية الحالية.
                </p>
              )
            }
            actions={(row) => {
              const item = items.find(
                (candidate) => candidate.id === row.itemId,
              );
              if (!item) return null;
              return (
                <div className="flex items-center gap-1">
                  <IconButton
                    title="تسوية الرصيد"
                    onClick={() => {
                      setAdjustQty("");
                      setAdjustNote("");
                      setAdjustingError("");
                      setAdjusting(row);
                    }}
                  >
                    <Scale className="size-4" />
                  </IconButton>
                  <IconButton
                    title="تعديل"
                    onClick={() => {
                      setEditing(item);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </IconButton>
                  {item.isActive ? (
                    <IconButton
                      title="إيقاف"
                      danger
                      onClick={() => {
                        setConfirmingError("");
                        setConfirming(item);
                      }}
                    >
                      <Ban className="size-4" />
                    </IconButton>
                  ) : (
                    <IconButton
                      title="إعادة التفعيل"
                      onClick={() => reactivate(item)}
                    >
                      <RotateCcw className="size-4" />
                    </IconButton>
                  )}
                </div>
              );
            }}
          />
        )}
      </TabPanel>

      {formOpen && (
        <ItemFormModal
          key={editing?.id ?? "new"}
          item={editing}
          categories={categories}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setReloadKey((current) => current + 1);
          }}
        />
      )}
      <ConfirmDialog
        open={confirming !== null}
        title="إيقاف الصنف"
        description={
          confirming
            ? `سيُوقف الصنف "${confirming.name}" مع بقاء رصيده ظاهراً في المخزن.`
            : undefined
        }
        tone="danger"
        confirmLabel="إيقاف الصنف"
        busy={confirmingBusy}
        error={confirmingError}
        onConfirm={() => confirming && void deactivate(confirming)}
        onCancel={() => {
          setConfirming(null);
          setConfirmingError("");
        }}
      />
      {adjusting && (
        <Modal
          open
          title={`تسوية رصيد ${adjusting.name}`}
          onClose={() => setAdjusting(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted">
              الرصيد المسجل حالياً{" "}
              <b className="tnum text-ink">
                {Number(adjusting.quantity).toLocaleString("ar-EG", {
                  maximumFractionDigits: 3,
                })}{" "}
                {adjusting.stockUnit}
              </b>
              . أدخل الكمية الفعلية وسبب التسوية.
            </p>
            <Field
              label="الكمية الفعلية"
              type="number"
              min="0"
              step="0.001"
              value={adjustQty}
              onChange={(event) => setAdjustQty(event.target.value)}
              dir="ltr"
            />
            <TextAreaField
              label="سبب التسوية"
              required
              value={adjustNote}
              onChange={(event) => setAdjustNote(event.target.value)}
            />
            {adjustingError && <ErrorBanner>{adjustingError}</ErrorBanner>}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setAdjusting(null);
                  setAdjustingError("");
                }}
                disabled={adjustingBusy}
              >
                إلغاء
              </Button>
              <Button
                onClick={() => void saveAdjustment()}
                disabled={adjustingBusy}
              >
                {adjustingBusy ? "جارِ الحفظ…" : "حفظ التسوية"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
