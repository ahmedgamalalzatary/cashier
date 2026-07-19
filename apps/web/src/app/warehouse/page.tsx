"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Ban,
  Boxes,
  PackageOpen,
  Pencil,
  Plus,
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
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { ItemFormModal } from "./item-modal";
import {
  categoryFilterOptions,
  filterStockRows,
  type StockFilter,
} from "./warehouse-model";

const typeLabels: Record<ItemType, string> = {
  raw: "خامة",
  resale: "إعادة بيع",
  prepared: "مُحضّر",
};

export default function WarehousePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stock, setStock] = useState<InventoryStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [state, setState] = useState<StockFilter>("all");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<Item[]>("/api/items"),
      api<Category[]>("/api/categories"),
      api<InventoryStockRow[]>("/api/inventory/main/stock"),
    ])
      .then(([itemRows, categoryRows, stockRows]) => {
        if (cancelled) return;
        setItems(itemRows);
        setCategories(categoryRows);
        setStock(stockRows);
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
  }, [reloadKey]);

  const visibleRows = useMemo(
    () => filterStockRows(stock, { query, categoryId, state }, categories),
    [stock, query, categoryId, state, categories],
  );
  const categoryOptions = useMemo(
    () => categoryFilterOptions(categories),
    [categories],
  );
  const activeItems = stock.filter((row) => row.isActive).length;
  const lowStock = stock.filter((row) => row.isLowStock).length;
  const negativeStock = stock.filter((row) => row.isNegativeStock).length;
  const totalValue = stock.reduce(
    (sum, row) => sum + Number(row.stockValue),
    0,
  );

  async function deactivate(item: Item) {
    if (!confirm(`إيقاف الصنف "${item.name}"؟ سيظل رصيده ظاهراً في المخزن.`))
      return;
    try {
      await api(`/api/items/${item.id}`, { method: "DELETE" });
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إيقاف الصنف");
    }
  }

  return (
    <div>
      <PageHeader
        title="المخزن الرئيسي"
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

      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-sidebar text-white shadow-[0_16px_45px_rgb(43_33_24/0.10)]">
        <div className="grid divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-y-0 lg:grid-cols-4">
          <Summary
            icon={<PackageOpen className="size-5 text-accent" />}
            label="الأصناف النشطة"
            value={String(activeItems)}
          />
          <Summary
            icon={<TriangleAlert className="size-5 text-accent" />}
            label="تحت حد التنبيه (النشطة)"
            value={String(lowStock)}
            danger={lowStock > 0}
          />
          <Summary
            icon={<TriangleAlert className="size-5 text-danger" />}
            label="أرصدة سالبة (كل الأصناف)"
            value={String(negativeStock)}
            danger={negativeStock > 0}
          />
          <Summary
            icon={<WalletCards className="size-5 text-accent" />}
            label="قيمة كل الرصيد FIFO (يشمل الموقوف)"
            value={formatMoney(totalValue)}
          />
        </div>
      </section>

      {error && (
        <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mb-4 grid gap-3 rounded-xl border border-line bg-surface p-3 md:grid-cols-[minmax(14rem,1fr)_13rem_12rem]">
        <label className="relative block">
          <Search className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted" />
          <input
            aria-label="البحث عن صنف"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث بالاسم أو التصنيف"
            className="w-full rounded-lg border border-line bg-paper/40 py-2 pe-3 ps-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
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
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
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
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="all">كل الحالات</option>
          <option value="low">تحت حد التنبيه</option>
          <option value="inactive">الأصناف الموقوفة</option>
        </select>
      </div>

      {loading ? (
        <p className="text-muted">جارِ تحميل دفتر المخزن…</p>
      ) : stock.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
          <Boxes className="mx-auto mb-3 size-8 text-muted" />
          <p className="font-medium">المخزن لا يحتوي على أصناف بعد</p>
          <p className="mt-1 text-sm text-muted">
            أضف أول صنف لتجهيزه للمشتريات وحركات المخزون.
          </p>
        </div>
      ) : visibleRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          لا توجد أصناف تطابق عوامل التصفية الحالية.
        </p>
      ) : (
        <Table
          headers={[
            "الصنف",
            "التصنيف",
            "النوع",
            "الرصيد",
            "حد التنبيه",
            "قيمة FIFO",
            "الحالة",
            "إجراءات",
          ]}
        >
          {visibleRows.map((row) => {
            const item = items.find((candidate) => candidate.id === row.itemId);
            return (
              <tr key={row.itemId} className={row.isActive ? "" : "opacity-55"}>
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 text-muted">{row.categoryName}</td>
                <td className="px-4 py-3">{typeLabels[row.type]}</td>
                <td className="px-4 py-3 tnum font-medium">
                  <span className={row.isLowStock ? "text-danger" : ""}>
                    {Number(row.quantity).toLocaleString("ar-EG", {
                      maximumFractionDigits: 3,
                    })}{" "}
                    {row.stockUnit}
                  </span>
                </td>
                <td className="px-4 py-3 tnum text-muted">
                  {Number(row.minimumLevel).toLocaleString("ar-EG", {
                    maximumFractionDigits: 3,
                  })}
                </td>
                <td className="px-4 py-3 tnum">
                  {formatMoney(row.stockValue)}
                </td>
                <td className="px-4 py-3">
                  {row.isNegativeStock ? (
                    <Badge tone="danger">رصيد سالب</Badge>
                  ) : row.isLowStock ? (
                    <Badge tone="danger">منخفض</Badge>
                  ) : (
                    <Badge tone={row.isActive ? "success" : "neutral"}>
                      {row.isActive ? "متاح" : "موقوف"}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {item && (
                    <div className="flex items-center gap-1">
                      <IconButton
                        title="تعديل"
                        onClick={() => {
                          setEditing(item);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                      {item.isActive && (
                        <IconButton
                          title="إيقاف"
                          danger
                          onClick={() => deactivate(item)}
                        >
                          <Ban className="size-4" />
                        </IconButton>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}

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
    </div>
  );
}

function Summary({
  icon,
  label,
  value,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <div className="rounded-lg bg-white/8 p-2">{icon}</div>
      <div>
        <p className="text-xs text-sidebar-ink">{label}</p>
        <p
          className={`tnum mt-0.5 text-xl font-bold ${danger ? "text-accent" : ""}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors ${
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-muted hover:bg-line/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
