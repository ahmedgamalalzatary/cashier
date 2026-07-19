import { describe, expect, it } from "vitest";
import type { Category, InventoryStockRow } from "@cashier/shared";
import {
  categoryFilterOptions,
  eligibleItemCategories,
  filterStockRows,
  stockMeaningFieldsLocked,
} from "../../../src/app/warehouse/warehouse-model";

const categories: Category[] = [
  { id: 1, name: "خامات", parentId: null, isActive: true, createdAt: "" },
  { id: 2, name: "مشروبات", parentId: null, isActive: true, createdAt: "" },
  { id: 3, name: "قهوة", parentId: 2, isActive: true, createdAt: "" },
  { id: 4, name: "قديم", parentId: null, isActive: false, createdAt: "" },
];

const rows: InventoryStockRow[] = [
  {
    itemId: 1,
    name: "بن برازيلي",
    categoryId: 3,
    categoryName: "قهوة",
    type: "raw",
    stockUnit: "كجم",
    isActive: true,
    quantity: "2.000",
    stockValue: "200.000000000",
    minimumLevel: "3.000",
    isLowStock: true,
    isNegativeStock: false,
  },
  {
    itemId: 2,
    name: "أكواب ورق",
    categoryId: 1,
    categoryName: "خامات",
    type: "resale",
    stockUnit: "قطعة",
    isActive: false,
    quantity: "50.000",
    stockValue: "100.000000000",
    minimumLevel: "10.000",
    isLowStock: false,
    isNegativeStock: false,
  },
];

describe("warehouse view model", () => {
  it("allows active sub-categories and active main categories without children", () => {
    expect(
      eligibleItemCategories(categories).map((category) => category.id),
    ).toEqual([1, 3]);
  });

  it("filters by Arabic search, category, and low-stock state", () => {
    expect(
      filterStockRows(
        rows,
        {
          query: "برازيلي",
          categoryId: 3,
          state: "low",
        },
        categories,
      ).map((row) => row.itemId),
    ).toEqual([1]);
    expect(
      filterStockRows(
        rows,
        { query: "", categoryId: null, state: "inactive" },
        categories,
      ),
    ).toEqual([rows[1]]);
  });

  it("includes child items when filtering by a main category", () => {
    expect(
      filterStockRows(
        rows,
        { query: "", categoryId: 2, state: "all" },
        categories,
      ).map((row) => row.itemId),
    ).toEqual([1]);
  });

  it("offers only active categories with hierarchical child labels", () => {
    expect(categoryFilterOptions(categories)).toEqual([
      { id: 1, label: "خامات" },
      { id: 2, label: "مشروبات" },
      { id: 3, label: "مشروبات ← قهوة" },
    ]);
  });

  it("locks stock-meaning fields only after stock history exists", () => {
    expect(stockMeaningFieldsLocked({ hasStockHistory: false })).toBe(false);
    expect(stockMeaningFieldsLocked({ hasStockHistory: true })).toBe(true);
  });
});
