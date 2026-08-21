"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { PrepareRecipeModal } from "@/components/recipes/prepare-recipe-modal";
import { ProductStockSetupModal } from "@/components/recipes/product-stock-setup-modal";
import { RecipeFormModal } from "@/components/recipes/recipe-form-modal";
import {
  PreparationMark,
  RecipeFlowRail,
  RecipeHeaderActions,
  RecipeTabs,
  type RecipeTab,
} from "@/components/recipes/recipe-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { formatMoney, itemLabel } from "@/lib/format";
import { listCategories } from "@/services/categories-service";
import { listItems } from "@/services/items-service";
import {
  listPreparations,
  listRecipes,
  setRecipeActive,
} from "@/services/recipes-service";
import { listProducts, refreshProducts } from "@/services/products-service";

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
        const [productRows, recipeRows, preparationRows, categoryRows, itemRows] =
          await Promise.all([
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

  const products = catalog?.products ?? [];
  const counts = {
    products: products.length,
    prepared: recipes.length,
    preparations: preparations.length,
  };

  function saved() {
    setForm(undefined);
    setPreparing(null);
    setStockProduct(null);
    setReloadKey((current) => current + 1);
  }

  async function toggle(recipe: PreparedRecipe) {
    if (
      recipe.isActive &&
      !window.confirm(`إيقاف الوصفة «${recipe.name}»؟`)
    )
      return;
    try {
      await setRecipeActive(recipe.id, !recipe.isActive);
      saved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تغيير حالة الوصفة",
      );
    }
  }

  async function manualRefresh() {
    setRefreshing(true);
    try {
      setCatalog(await refreshProducts());
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "تعذر تحديث المنتجات الخارجية",
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="الوصفات والتحضير"
        actions={
          <RecipeHeaderActions
            onPrepared={() => setForm(null)}
            onRefresh={() => void manualRefresh()}
            refreshing={refreshing}
          />
        }
      />

      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-sidebar text-white shadow-[0_16px_45px_rgb(43_33_24/0.10)]">
        <div className="grid divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-y-0 lg:grid-cols-4">
          <Summary
            icon={<RefreshCw className="size-5 text-accent" />}
            label="منتجات جاهزة للبيع"
            value={String(products.filter((product) => product.sellable).length)}
          />
          <Summary
            icon={<Scale className="size-5 text-accent" />}
            label="مقاسات البيع"
            value={String(
              products.reduce(
                (sum, product) => sum + Math.max(1, product.sizes.length),
                0,
              ),
            )}
          />
          <Summary
            icon={<Beaker className="size-5 text-accent" />}
            label="أصناف مُحضّرة"
            value={String(recipes.length)}
          />
          <Summary
            icon={<TriangleAlert className="size-5 text-danger" />}
            label="إعداد مخزون غير مكتمل"
            value={String(
              products.filter((product) => !product.stockConfigured).length,
            )}
            danger={products.some((product) => !product.stockConfigured)}
          />
        </div>
      </section>

      {error && (
        <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {catalog && (
        <p
          className={`mb-4 rounded-lg p-3 text-sm ${
            catalog.stale
              ? "bg-warning/10 text-warning"
              : "bg-paper text-muted"
          }`}
        >
          {catalog.stale
            ? `نعرض آخر نسخة محفوظة لأن التحديث الخارجي تعذر${
                catalog.syncError ? ` (${catalog.syncError})` : ""
              }. `
            : ""}
          آخر تحديث ناجح:{" "}
          {new Date(catalog.lastSuccessfulSyncAt).toLocaleString("ar-EG")}
        </p>
      )}

      <RecipeTabs active={tab} counts={counts} onChange={setTab} />
      <section
        id={`recipes-${tab}-panel`}
        role="tabpanel"
        aria-labelledby={`recipes-${tab}-tab`}
        tabIndex={0}
      >
        {loading ? (
          <p className="text-muted">جارِ تحميل الكتالوج وحساب الوصفات…</p>
        ) : tab === "products" ? (
          products.length === 0 ? (
            <Empty
              title="لا توجد منتجات خارجية"
              description="استخدم تحديث المنتجات لتحميل الكتالوج الخارجي."
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {products.map((product) => (
                <ExternalProductCard
                  key={product.externalId}
                  product={product}
                  categoryName={
                    (() => {
                      const category = catalog?.categories.find(
                        (candidate) =>
                          candidate.externalId === product.externalCategoryId,
                      );
                      return category
                        ? `${category.nameAr} / ${category.nameEn}`
                        : "—";
                    })()
                  }
                  onStockSetup={() => setStockProduct(product)}
                />
              ))}
            </div>
          )
        ) : tab === "prepared" ? (
          recipes.length === 0 ? (
            <Empty
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
          <PreparationHistory rows={preparations} />
        )}
      </section>

      {form !== undefined && (
        <RecipeFormModal
          key={form?.id ?? "new-prepared"}
          editing={form}
          categories={categories}
          items={items}
          onClose={() => setForm(undefined)}
          onSaved={saved}
        />
      )}
      {stockProduct && (
        <ProductStockSetupModal
          product={stockProduct}
          items={items}
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
      className={`overflow-hidden rounded-2xl border border-line bg-surface ${recipe.isActive ? "" : "opacity-60"}`}
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
            className="rounded-lg p-2 text-muted hover:bg-line/60 hover:text-ink"
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
            className={`rounded-lg p-2 ${recipe.isActive ? "text-muted hover:bg-danger/10 hover:text-danger" : "text-success hover:bg-success/10"}`}
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
          outputLabel={`${Number(recipe.baseYield).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} ${recipe.outputStockUnit}`}
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

function PreparationHistory({ rows }: { rows: PreparationSummary[] }) {
  if (rows.length === 0)
    return (
      <Empty
        title="لم تُنفذ عمليات تحضير بعد"
        description="عند تحضير دفعة ستظهر هنا كوثيقة تكلفة ومخزون ثابتة."
      />
    );
  return (
    <Table
      headers={[
        "التحضير",
        "الوصفة",
        "الناتج",
        "الكمية",
        "التكلفة",
        "نفذها",
        "الوقت",
        "",
      ]}
    >
      {rows.map((row) => (
        <tr key={row.id}>
          <td className="px-4 py-3">#{row.id}</td>
          <td className="px-4 py-3">{row.recipeName}</td>
          <td className="px-4 py-3">{row.outputItemName}</td>
          <td className="tnum px-4 py-3">{row.producedQuantity}</td>
          <td className="tnum px-4 py-3">{formatMoney(row.totalCost)}</td>
          <td className="px-4 py-3">{row.preparedByName}</td>
          <td className="px-4 py-3 text-muted">
            {new Date(row.occurredAt).toLocaleString("ar-EG")}
          </td>
          <td className="px-4 py-3">
            <Link
              href={`/recipes/preparations/${row.id}`}
              aria-label={`عرض عملية التحضير رقم ${row.id}`}
              className="inline-flex rounded-lg p-2 text-muted hover:bg-line/50 hover:text-ink"
            >
              <Eye className="size-4" />
            </Link>
          </td>
        </tr>
      ))}
    </Table>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
      <ChefHat className="mx-auto mb-3 size-8 text-muted" />
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{description}</p>
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
    <div className="flex items-center gap-3 px-4 py-4">
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
