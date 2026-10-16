import { describe, expect, it } from "vitest";
import {
  applyTableView,
  filterOptions,
  isReportRangeReady,
  percentChange,
  presetRange,
  reportTotal,
  tableTotals,
  type Column,
} from "../../src/models/reports-model";
import type { ReportRow } from "../../src/services/reports-service";
describe("reports model", () => {
  it("totals decimal report values without concatenating strings", () => {
    expect(
      reportTotal([{ amount: "12.50" }, { amount: "7.50" }], "amount"),
    ).toBe(20);
  });

  it("requires two non-empty dates in calendar order before fetching", () => {
    expect(isReportRangeReady("2026-09-01", "2026-09-30")).toBe(true);
    expect(isReportRangeReady("2026-09-30", "2026-09-30")).toBe(true);
    expect(isReportRangeReady("", "2026-09-30")).toBe(false);
    expect(isReportRangeReady("2026-09-01", "")).toBe(false);
    expect(isReportRangeReady("2026-10-01", "2026-09-30")).toBe(false);
  });
});

describe("date presets", () => {
  it("covers today and yesterday, across a month edge", () => {
    expect(presetRange("today", "2026-10-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-01",
    });
    expect(presetRange("yesterday", "2026-10-01")).toEqual({
      from: "2026-09-30",
      to: "2026-09-30",
    });
    expect(presetRange("yesterday", "2026-01-01")).toEqual({
      from: "2025-12-31",
      to: "2025-12-31",
    });
  });

  it("starts the week on Saturday, the shop's first day", () => {
    // 2026-10-15 is a Thursday; its week began on Saturday 10th.
    expect(presetRange("week", "2026-10-15")).toEqual({
      from: "2026-10-10",
      to: "2026-10-15",
    });
    // On a Saturday the week is just that day.
    expect(presetRange("week", "2026-10-10")).toEqual({
      from: "2026-10-10",
      to: "2026-10-10",
    });
    // A Friday reaches back across the month edge.
    expect(presetRange("week", "2026-10-02")).toEqual({
      from: "2026-09-26",
      to: "2026-10-02",
    });
  });

  it("covers this month to today and the whole previous month", () => {
    expect(presetRange("month", "2026-10-15")).toEqual({
      from: "2026-10-01",
      to: "2026-10-15",
    });
    expect(presetRange("lastMonth", "2026-03-31")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(presetRange("lastMonth", "2026-01-10")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});

describe("table toolkit", () => {
  const columns: Column[] = [
    { key: "name", label: "الصنف" },
    { key: "warehouse", label: "المخزن", kind: "warehouse", filter: true },
    { key: "quantity", label: "الكمية", kind: "number", total: true },
    { key: "amount", label: "المبلغ", kind: "money", total: true },
  ];
  const rows = [
    { name: "لبن", warehouse: "main", quantity: "10", amount: "100.00" },
    { name: "أرز", warehouse: "cafe", quantity: "9", amount: "20.50" },
    { name: "بن", warehouse: "main", quantity: "100", amount: null },
  ];
  const names = (result: ReportRow[]) => result.map((row) => row.name);

  it("searches the text a reader sees, ignoring hamza forms", () => {
    expect(names(applyTableView(rows, columns, { search: "ارز", filters: {} }))).toEqual(["أرز"]);
    // warehouse codes are matched by their Arabic label, not the code
    expect(
      names(applyTableView(rows, columns, { search: "الكافيه", filters: {} })),
    ).toEqual(["أرز"]);
    // figures are not searched
    expect(applyTableView(rows, columns, { search: "100", filters: {} })).toEqual([]);
  });

  it("sorts numbers as numbers and text in Arabic order, both ways", () => {
    const sort = (key: string, direction: "asc" | "desc") =>
      names(applyTableView(rows, columns, { search: "", filters: {}, sort: { key, direction } }));
    expect(sort("quantity", "asc")).toEqual(["أرز", "لبن", "بن"]);
    expect(sort("quantity", "desc")).toEqual(["بن", "لبن", "أرز"]);
    expect(sort("name", "asc")).toEqual(["أرز", "بن", "لبن"]);
    // an empty figure stays last in either direction
    expect(sort("amount", "asc")).toEqual(["أرز", "لبن", "بن"]);
    expect(sort("amount", "desc")).toEqual(["لبن", "أرز", "بن"]);
  });

  it("filters by an exact value and offers each value once, labelled", () => {
    expect(
      names(applyTableView(rows, columns, { search: "", filters: { warehouse: "main" } })),
    ).toEqual(["لبن", "بن"]);
    expect(filterOptions(rows, columns[1]!)).toEqual([
      { value: "main", label: "الرئيسي" },
      { value: "cafe", label: "الكافيه" },
    ]);
  });

  it("totals only the money and quantity columns that ask for it", () => {
    expect(tableTotals(rows, columns)).toEqual({ quantity: 119, amount: 120.5 });
    expect(tableTotals([], columns)).toEqual({ quantity: 0, amount: 0 });
  });

  it("does not change the rows it was given", () => {
    const before = names(rows);
    applyTableView(rows, columns, { search: "", filters: {}, sort: { key: "name", direction: "asc" } });
    expect(names(rows)).toEqual(before);
  });
});

describe("change against the previous period", () => {
  it("is a percentage up or down, and absent when there is nothing to compare", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(10, 0)).toBeNull();
    // a loss turning smaller is an improvement measured against its size
    expect(percentChange(-50, -100)).toBe(50);
  });
});
