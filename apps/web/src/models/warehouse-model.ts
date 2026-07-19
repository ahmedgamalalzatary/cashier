import type { Category, InventoryStockRow } from "@cashier/shared";

export type StockFilter = "all" | "low" | "inactive";

export function eligibleItemCategories(categories: Category[]) {
  const parentIds = new Set(categories.map((category) => category.parentId));
  return categories.filter(
    (category) =>
      category.isActive &&
      (category.parentId !== null || !parentIds.has(category.id)),
  );
}

export function categoryFilterOptions(
  categories: Category[],
  rows: InventoryStockRow[],
) {
  const names = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const stockedCategoryIds = new Set(rows.map((row) => row.categoryId));
  return categories
    .filter(
      (category) =>
        category.isActive || stockedCategoryIds.has(category.id),
    )
    .map((category) => {
      const label =
        category.parentId === null
          ? category.name
          : `${names.get(category.parentId) ?? ""} ← ${category.name}`;
      return {
        id: category.id,
        label: category.isActive ? label : `${label} (موقوف)`,
      };
    });
}

export function stockMeaningFieldsLocked(item: { hasStockHistory: boolean }) {
  return item.hasStockHistory;
}

export function filterStockRows(
  rows: InventoryStockRow[],
  filters: { query: string; categoryId: number | null; state: StockFilter },
  categories: Category[],
) {
  const query = filters.query.trim().toLocaleLowerCase("ar");
  const categoryIds =
    filters.categoryId === null
      ? null
      : new Set([
          filters.categoryId,
          ...categories
            .filter((category) => category.parentId === filters.categoryId)
            .map((category) => category.id),
        ]);
  return rows.filter((row) => {
    if (
      query &&
      !`${row.name} ${row.categoryName}`.toLocaleLowerCase("ar").includes(query)
    )
      return false;
    if (categoryIds && !categoryIds.has(row.categoryId)) return false;
    if (filters.state === "low" && !row.isLowStock) return false;
    if (filters.state === "inactive" && row.isActive) return false;
    return true;
  });
}
