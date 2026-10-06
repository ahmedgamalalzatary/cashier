"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Beaker,
  ChefHat,
  Eye,
  Pencil,
  Power,
  PowerOff,
  RefreshCw,
  Scale,
  TriangleAlert,
} from "lucide-react";
import type {
  Category,
  ExternalProduct,
  ExternalProductCatalog,
  Item,
  PreparationSummary,
  PreparedRecipe,
} from "@cashier/shared";
import { ExternalProductCard } from "@/components/recipes/external-product-card";
import { CatalogSyncStatus } from "@/components/recipes/catalog-sync-status";
import { PrepareRecipeModal } from "@/components/recipes/prepare-recipe-modal";
import { ProductStockSetupModal } from "@/components/recipes/product-stock-setup-modal";
import { RecipeFormModal } from "@/components/recipes/recipe-form-modal";
import {
  PreparationMark,
  RecipeFlowRail,
  RecipeHeaderActions,
} from "@/components/recipes/recipe-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Stat, StatStrip } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui/states";
import { formatMoney, itemLabel } from "@/lib/format";
import {
  catalogRefreshOutcome,
  requestCatalogRefresh,
} from "@/models/catalog-refresh";
import { listCategories } from "@/services/categories-service";
import { listItems } from "@/services/items-service";
import {
  listPreparations,
  listRecipes,
  setRecipeActive,
} from "@/services/recipes-service";
import {
  getProductRefreshStatus,
  listProducts,
  refreshProducts,
} from "@/services/products-service";

type RecipeTab = "products" | "prepared" | "preparations";

export default function RecipesPage() {
  const [catalog, setCatalog] = useState<ExternalProductCatalog | null>(null);
  const [recipes, setRecipes] = useState<PreparedRecipe[]>([]);
  const [preparations, setPreparations] = useState<PreparationSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<RecipeTab>("products");
  const [form, setForm] = useState<PreparedRecipe | null | undefined>();
  const [preparing, setPreparing] = useState<PreparedRecipe | null>(null);
  const [stockProduct, setStockProduct] = useState<ExternalProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [
          productRows,
          recipeRows,
          preparationRows,
          categoryRows,
          itemRows,
        ] = await Promise.all([
          listProducts(),
          listRecipes(),
          listPreparations(),
          listCategories(),
          listItems(),
        ]);
        if (cancelled) return;
        setCatalog(productRows);
        setRecipes(recipeRows);
        setPreparations(preparationRows);
        setCategories(categoryRows);
        setItems(itemRows);
        setError("");
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "تعذر تحميل المنتجات والوصفات",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!refreshing) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void getProductRefreshStatus()
        .then((status) => {
          if (cancelled) return;
          const outcome = catalogRefreshOutcome(status);
          if (outcome === "failed") {
            setError(status.lastError ?? "تعذر تحديث المنتجات الخارجية");
            setRefreshing(false);
            return;
          }
          if (outcome === "worker-unavailable") {
            setError("خدمة تحديث المنتجات غير متاحة الآن");
            setRefreshing(false);
            return;
          }
          if (outcome === "succeeded") {
            setRefreshing(false);
            setReloadKey((current) => current + 1);
          }
        })
        .catch(() => undefined);
    }, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshing]);

  const products = catalog?.products ?? [];

  function saved() {
    setForm(undefined);
    setPreparing(null);
    setStockProduct(null);
    setReloadKey((current) => current + 1);
  }

  async function toggle(recipe: PreparedRecipe) {
    if (recipe.isActive && !window.confirm(`إيقاف الوصفة «${recipe.name}»؟`))
      return;
    try {
      await setRecipeActive(recipe.id, !recipe.isActive);
      saved();
    } catch (caught) {
      setRefreshing(false);
      setError(
        caught instanceof Error ? caught.message : "تعذر تغيير حالة الوصفة",
      );
    }
  }

  async function manualRefresh() {
    await requestCatalogRefresh({
      refresh: refreshProducts,
      setRefreshing,
      setError,
    });
  }

  const historyColumns: DataColumn<PreparationSummary>[] = [
    {
      key: "id",
      header: "التحضير",
      mobile: "primary",
      cell: (row) => (
        <Link
          href={`/recipes/preparations/detail?id=${row.id}`}
          className="flex items-center gap-2 hover:text-primary"
        >
          <PreparationMark />
          <span className="tnum font-medium">#{row.id}</span>
        </Link>
      ),
    },
    { key: "recipe", header: "الوصفة", cell: (row) => row.recipeName },
    { key: "output", header: "الناتج", cell: (row) => row.outputItemName },
    {
      key: "quantity",
      header: "الكمية",
      numeric: true,
      cell: (row) =>
        Number(row.producedQuantity).toLocaleString("ar-EG", {
          maximumFractionDigits: 3,
        }),
    },
    {
      key: "cost",
      header: "التكلفة",
      numeric: true,
      cell: (row) => formatMoney(row.totalCost),
    },
    { key: "by", header: "نفذها", cell: (row) => row.preparedByName },
    {
      key: "at",
      header: "الوقت",
      cell: (row) => (
        <span className="text-muted">
          {new Date(row.occurredAt).toLocaleString("ar-EG")}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="الوصفات والتحضير"
        description="اربط الأصناف المُحضّرة بمكوّناتها، وتابع التكلفة والتحضير."
        actions={
          <RecipeHeaderActions
            onPrepared={() => setForm(null)}
            onRefresh={() => void manualRefresh()}
            refreshing={refreshing}
          />
        }
      />

      <StatStrip className="mb-5">
        <Stat
          icon={<RefreshCw className="size-4" />}
          label="منتجات جاهزة للبيع"
          value={String(products.filter((product) => product.sellable).length)}
        />
        <Stat
          icon={<Scale className="size-4" />}
          label="مقاسات البيع"
          value={String(
            products.reduce(
              (sum, product) => sum + Math.max(1, product.sizes.length),
              0,
            ),
          )}
        />
        <Stat
          icon={<Beaker className="size-4" />}
          label="أصناف مُحضّرة"
          value={String(recipes.length)}
        />
        <Stat
          icon={<TriangleAlert className="size-4" />}
          label="إعداد مخزون غير مكتمل"
          value={String(
            products.filter((product) => !product.stockConfigured).length,
          )}
          tone={
            products.some((product) => !product.stockConfigured)
              ? "danger"
              : "default"
          }
        />
      </StatStrip>

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}
      {catalog && (
        <div className="mb-4">
          <CatalogSyncStatus catalog={catalog} />
        </div>
      )}

      <Tabs
        items={[
          { id: "products", label: "منتجات القائمة", badge: products.length },
          { id: "prepared", label: "الأصناف المُحضّرة", badge: recipes.length },
          {
            id: "preparations",
            label: "سجل التحضير",
            badge: preparations.length,
          },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="أقسام الوصفات"
        className="mb-5"
      />

      {loading ? (
        <LoadingState label="جارِ تحميل الكتالوج وحساب الوصفات…" />
      ) : tab === "products" ? (
        products.length === 0 ? (
          <EmptyState
            icon={<ChefHat className="size-8" />}
            title="لا توجد منتجات خارجية"
            description="استخدم زر تحديث المنتجات لتحميل الكتالوج الخارجي."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {products.map((product) => (
              <ExternalProductCard
                key={product.externalId}
                product={product}
                categoryName={(() => {
                  const category = catalog?.categories.find(
                    (candidate) =>
                      candidate.externalId === product.externalCategoryId,
                  );
                  return category
                    ? `${category.nameAr} / ${category.nameEn}`
                    : "—";
                })()}
                onStockSetup={() => setStockProduct(product)}
              />
            ))}
          </div>
        )
      ) : tab === "prepared" ? (
        recipes.length === 0 ? (
          <EmptyState
            icon={<ChefHat className="size-8" />}
            title="لا توجد وصفات تحضير بعد"
            description="اربط صنفاً مُحضّراً بوصفة أساسية ثم جهّز دفعاته."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {recipes.map((recipe) => (
              <PreparedCard
                key={recipe.id}
                recipe={recipe}
                onEdit={() => setForm(recipe)}
                onToggle={() => void toggle(recipe)}
                onPrepare={() => setPreparing(recipe)}
              />
            ))}
          </div>
        )
      ) : (
        <DataTable
          caption="سجل التحضير"
          rows={preparations}
          rowKey={(row) => row.id}
          columns={historyColumns}
          empty={
            <EmptyState
              icon={<ChefHat className="size-8" />}
              title="لم تُنفذ عمليات تحضير بعد"
              description="عند تحضير دفعة ستظهر هنا كوثيقة تكلفة ومخزون ثابتة."
            />
          }
          actions={(row) => (
            <Link
              href={`/recipes/preparations/detail?id=${row.id}`}
              aria-label={`عرض عملية التحضير رقم ${row.id}`}
              title="عرض التفاصيل"
              className="inline-flex rounded-lg p-2 text-muted transition-colors hover:bg-line/50 hover:text-ink"
            >
              <Eye className="size-4" />
            </Link>
          )}
        />
      )}

      {form !== undefined && (
        <RecipeFormModal
          key={form?.id ?? "new-prepared"}
          editing={form}
          categories={categories}
          items={items}
          onItemsChanged={async () => {
            const rows = await listItems();
            setItems(rows);
            return rows;
          }}
          onClose={() => setForm(undefined)}
          onSaved={saved}
        />
      )}
      {stockProduct && (
        <ProductStockSetupModal
          product={stockProduct}
          items={items}
          onItemsChanged={async () => {
            const rows = await listItems();
            setItems(rows);
            return rows;
          }}
          onClose={() => setStockProduct(null)}
          onSaved={saved}
        />
      )}
      {preparing && (
        <PrepareRecipeModal
          recipe={preparing}
          onClose={() => setPreparing(null)}
          onSaved={() => {
            setTab("preparations");
            saved();
          }}
        />
      )}
    </div>
  );
}

function PreparedCard({
  recipe,
  onEdit,
  onToggle,
  onPrepare,
}: {
  recipe: PreparedRecipe;
  onEdit: () => void;
  onToggle: () => void;
  onPrepare: () => void;
}) {
  return (
    <article
      className={`sheet overflow-hidden ${recipe.isActive ? "" : "opacity-60"}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line bg-paper/45 px-4 py-3">
        <div className="flex items-center gap-3">
          <PreparationMark />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">{recipe.name}</h2>
              <Badge tone={recipe.isActive ? "success" : "neutral"}>
                {recipe.isActive ? "نشطة" : "موقوفة"}
              </Badge>
            </div>
            <p className="text-xs text-muted">{recipe.categoryName}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`تعديل ${recipe.name}`}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-line/60 hover:text-ink"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-label={
              recipe.isActive
                ? `إيقاف ${recipe.name}`
                : `إعادة تفعيل ${recipe.name}`
            }
            className={`rounded-lg p-2 transition-colors ${
              recipe.isActive
                ? "text-muted hover:bg-danger/10 hover:text-danger"
                : "text-success hover:bg-success/10"
            }`}
          >
            {recipe.isActive ? (
              <PowerOff className="size-4" />
            ) : (
              <Power className="size-4" />
            )}
          </button>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <RecipeFlowRail
          ingredientLabel={`${recipe.ingredients.length} مكوّن`}
          outputLabel={`${Number(recipe.baseYield).toLocaleString("ar-EG", {
            maximumFractionDigits: 3,
          })} ${recipe.outputStockUnit}`}
          costLabel={
            recipe.currentCost === null ? "—" : formatMoney(recipe.currentCost)
          }
          available={recipe.hasSufficientStock}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>
            {recipe.ingredients
              .map((ingredient) =>
                itemLabel(ingredient.itemCode, ingredient.itemName),
              )
              .join("، ")}
          </span>
          <span className="tnum">
            تكلفة الوحدة:{" "}
            {recipe.estimatedUnitCost === null
              ? "—"
              : formatMoney(recipe.estimatedUnitCost)}
          </span>
        </div>
        <Button
          className="w-full justify-center"
          onClick={onPrepare}
          disabled={!recipe.isActive}
        >
          <ChefHat className="size-4" /> تحضير دفعة
        </Button>
      </div>
    </article>
  );
}
