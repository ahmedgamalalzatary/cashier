"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Beaker, BookOpen, ChefHat, Eye, Pencil, Power, PowerOff, Scale, TriangleAlert } from "lucide-react";
import type { Category, Item, PreparationSummary, PreparedRecipe, ProductRecipe, Recipe, RecipeType } from "@cashier/shared";
import { PrepareRecipeModal } from "@/components/recipes/prepare-recipe-modal";
import { RecipeFormModal } from "@/components/recipes/recipe-form-modal";
import { PreparationMark, RecipeFlowRail, RecipeHeaderActions, RecipeMargin, RecipeTabs, type RecipeTab } from "@/components/recipes/recipe-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { recipeStats } from "@/models/recipe-model";
import { listCategories } from "@/services/categories-service";
import { listItems } from "@/services/items-service";
import { listPreparations, listRecipes, setRecipeActive } from "@/services/recipes-service";

type FormState = { type: RecipeType; editing: Recipe | null } | null;

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [preparations, setPreparations] = useState<PreparationSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<RecipeTab>("products");
  const [form, setForm] = useState<FormState>(null);
  const [preparing, setPreparing] = useState<PreparedRecipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [recipeRows, preparationRows, categoryRows, itemRows] = await Promise.all([
          listRecipes(), listPreparations(), listCategories(), listItems(),
        ]);
        if (cancelled) return;
        setRecipes(recipeRows);
        setPreparations(preparationRows);
        setCategories(categoryRows);
        setItems(itemRows);
        setError("");
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "تعذر تحميل دفتر الوصفات");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const products = useMemo(() => recipes.filter((recipe): recipe is ProductRecipe => recipe.type === "product"), [recipes]);
  const prepared = useMemo(() => recipes.filter((recipe): recipe is PreparedRecipe => recipe.type === "prepared"), [recipes]);
  const stats = recipeStats(recipes);
  const counts = { products: products.length, prepared: prepared.length, preparations: preparations.length };

  function saved() {
    setForm(null);
    setPreparing(null);
    setReloadKey((current) => current + 1);
  }

  async function toggle(recipe: Recipe) {
    if (recipe.isActive && !window.confirm(`إيقاف الوصفة «${recipe.name}»؟`)) return;
    try {
      await setRecipeActive(recipe.id, !recipe.isActive);
      saved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تغيير حالة الوصفة");
    }
  }

  return (
    <div>
      <PageHeader title="الوصفات والتحضير" actions={<RecipeHeaderActions onProduct={() => setForm({ type: "product", editing: null })} onPrepared={() => setForm({ type: "prepared", editing: null })} />} />

      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-sidebar text-white shadow-[0_16px_45px_rgb(43_33_24/0.10)]">
        <div className="grid divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-y-0 lg:grid-cols-4">
          <Summary icon={<BookOpen className="size-5 text-accent" />} label="وصفات نشطة" value={String(stats.active)} />
          <Summary icon={<Scale className="size-5 text-accent" />} label="مقاسات بيع" value={String(products.reduce((sum, recipe) => sum + recipe.sizes.length, 0))} />
          <Summary icon={<Beaker className="size-5 text-accent" />} label="أصناف مُحضّرة" value={String(stats.prepared)} />
          <Summary icon={<TriangleAlert className="size-5 text-danger" />} label="رصيد مكونات غير كافٍ" value={String(stats.unavailable)} danger={stats.unavailable > 0} />
        </div>
      </section>

      {error && <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <RecipeTabs active={tab} counts={counts} onChange={setTab} />
      <section id={`recipes-${tab}-panel`} role="tabpanel" aria-labelledby={`recipes-${tab}-tab`} tabIndex={0}>
        {loading ? (
          <p className="text-muted">جارِ حساب الوصفات من دفعات FIFO…</p>
        ) : tab === "products" ? (
          products.length === 0 ? <Empty title="لا توجد منتجات وصفات بعد" description="أضف منتجاً، ثم عرّف مقاساته وأسعاره ومكوناته." /> :
          <div className="grid gap-4 xl:grid-cols-2">{products.map((recipe) => <ProductCard key={recipe.id} recipe={recipe} onEdit={() => setForm({ type: "product", editing: recipe })} onToggle={() => void toggle(recipe)} />)}</div>
        ) : tab === "prepared" ? (
          prepared.length === 0 ? <Empty title="لا توجد وصفات تحضير بعد" description="اربط صنفاً مُحضّراً بوصفة أساسية، ثم جهّز دفعاته من مخزون الكافيه." /> :
          <div className="grid gap-4 xl:grid-cols-2">{prepared.map((recipe) => <PreparedCard key={recipe.id} recipe={recipe} onEdit={() => setForm({ type: "prepared", editing: recipe })} onToggle={() => void toggle(recipe)} onPrepare={() => setPreparing(recipe)} />)}</div>
        ) : <PreparationHistory rows={preparations} />}
      </section>

      {form && <RecipeFormModal key={form.editing?.id ?? `new-${form.type}`} type={form.type} editing={form.editing} categories={categories} items={items} onClose={() => setForm(null)} onSaved={saved} />}
      {preparing && <PrepareRecipeModal recipe={preparing} onClose={() => setPreparing(null)} onSaved={() => { setTab("preparations"); saved(); }} />}
    </div>
  );
}

function ProductCard({ recipe, onEdit, onToggle }: { recipe: ProductRecipe; onEdit: () => void; onToggle: () => void }) {
  return <article className={`overflow-hidden rounded-2xl border border-line bg-surface ${recipe.isActive ? "" : "opacity-60"}`}>
    <CardHeader recipe={recipe} onEdit={onEdit} onToggle={onToggle} />
    <div className="space-y-3 p-4">{recipe.sizes.map((size) => <div key={size.id} className="space-y-2">
      <RecipeFlowRail ingredientLabel={`${size.ingredients.length} مكوّن`} outputLabel={`${size.name} · ${formatMoney(size.sellingPrice)}`} costLabel={size.currentCost === null ? "—" : formatMoney(size.currentCost)} available={size.hasSufficientStock} />
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted"><span>{size.ingredients.map((ingredient) => ingredient.itemName).join("، ")}</span>{size.marginAmount !== null && size.marginPercentage !== null && size.costPercentage !== null && <RecipeMargin marginAmount={size.marginAmount} marginPercentage={size.marginPercentage} costPercentage={size.costPercentage} />}</div>
    </div>)}</div>
  </article>;
}

function PreparedCard({ recipe, onEdit, onToggle, onPrepare }: { recipe: PreparedRecipe; onEdit: () => void; onToggle: () => void; onPrepare: () => void }) {
  return <article className={`overflow-hidden rounded-2xl border border-line bg-surface ${recipe.isActive ? "" : "opacity-60"}`}>
    <CardHeader recipe={recipe} onEdit={onEdit} onToggle={onToggle} />
    <div className="space-y-3 p-4">
      <RecipeFlowRail ingredientLabel={`${recipe.ingredients.length} مكوّن`} outputLabel={`${Number(recipe.baseYield).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} ${recipe.outputStockUnit}`} costLabel={recipe.currentCost === null ? "—" : formatMoney(recipe.currentCost)} available={recipe.hasSufficientStock} />
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted"><span>{recipe.ingredients.map((ingredient) => ingredient.itemName).join("، ")}</span><span className="tnum">تكلفة الوحدة: {recipe.estimatedUnitCost === null ? "—" : formatMoney(recipe.estimatedUnitCost)}</span></div>
      <Button className="w-full justify-center" onClick={onPrepare} disabled={!recipe.isActive}><ChefHat className="size-4" /> تحضير دفعة</Button>
    </div>
  </article>;
}

function CardHeader({ recipe, onEdit, onToggle }: { recipe: Recipe; onEdit: () => void; onToggle: () => void }) {
  return <div className="flex items-start justify-between gap-3 border-b border-line bg-paper/45 px-4 py-3">
    <div className="flex items-center gap-3">{recipe.type === "prepared" ? <PreparationMark /> : <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent/15 text-primary"><BookOpen className="size-4" /></span>}<div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{recipe.name}</h2><Badge tone={recipe.isActive ? "success" : "neutral"}>{recipe.isActive ? "نشطة" : "موقوفة"}</Badge></div><p className="text-xs text-muted">{recipe.categoryName}</p></div></div>
    <div className="flex gap-1"><button type="button" onClick={onEdit} aria-label={`تعديل ${recipe.name}`} title="تعديل الوصفة" className="rounded-lg p-2 text-muted hover:bg-line/60 hover:text-ink"><Pencil className="size-4" /></button><button type="button" onClick={onToggle} aria-label={recipe.isActive ? `إيقاف ${recipe.name}` : `إعادة تفعيل ${recipe.name}`} title={recipe.isActive ? "إيقاف الوصفة" : "إعادة تفعيل الوصفة"} className={`rounded-lg p-2 ${recipe.isActive ? "text-muted hover:bg-danger/10 hover:text-danger" : "text-success hover:bg-success/10"}`}>{recipe.isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}</button></div>
  </div>;
}

function PreparationHistory({ rows }: { rows: PreparationSummary[] }) {
  if (rows.length === 0) return <Empty title="لم تُنفذ عمليات تحضير بعد" description="عند تحضير دفعة ستظهر هنا كوثيقة تكلفة ومخزون ثابتة." />;
  return <Table headers={["التحضير", "الوصفة", "الناتج", "الكمية", "التكلفة", "نفذها", "الوقت", ""]}>{rows.map((row) => <tr key={row.id}>
    <td className="px-4 py-3"><div className="flex items-center gap-2"><PreparationMark /><span className="font-medium">#{row.id}</span></div></td><td className="px-4 py-3">{row.recipeName}</td><td className="px-4 py-3">{row.outputItemName}</td><td className="tnum px-4 py-3">{Number(row.producedQuantity).toLocaleString("ar-EG", { maximumFractionDigits: 3 })}</td><td className="tnum px-4 py-3">{formatMoney(row.totalCost)}</td><td className="px-4 py-3">{row.preparedByName}</td><td className="px-4 py-3 text-muted">{new Date(row.occurredAt).toLocaleString("ar-EG")}</td><td className="px-4 py-3"><Link href={`/recipes/preparations/${row.id}`} aria-label={`عرض عملية التحضير رقم ${row.id}`} title="عرض التفاصيل" className="inline-flex rounded-lg p-2 text-muted hover:bg-line/50 hover:text-ink"><Eye className="size-4" /></Link></td>
  </tr>)}</Table>;
}

function Empty({ title, description }: { title: string; description: string }) { return <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center"><ChefHat className="mx-auto mb-3 size-8 text-muted" /><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted">{description}</p></div>; }
function Summary({ icon, label, value, danger = false }: { icon: ReactNode; label: string; value: string; danger?: boolean }) { return <div className="flex items-center gap-3 px-4 py-4"><div className="rounded-lg bg-white/8 p-2">{icon}</div><div><p className="text-xs text-sidebar-ink">{label}</p><p className={`tnum mt-0.5 text-xl font-bold ${danger ? "text-accent" : ""}`}>{value}</p></div></div>; }
