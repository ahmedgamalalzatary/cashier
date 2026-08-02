import { describe, expect, it } from "vitest";
import type {
  InventoryStockRow,
  Shift,
  Supplier,
  TransferRequestSummary,
} from "@cashier/shared";
import { formatMoney } from "../../src/lib/format";
import {
  attentionItems,
  countPhrase,
  dayTape,
  drawerIsBusy,
  greetingFor,
  ITEM_COUNT,
  openShiftOf,
  shiftTapeLines,
  workedLabel,
} from "../../src/models/home-model";

function shift(overrides: Partial<Shift> & Pick<Shift, "id">): Shift {
  return {
    status: "closed",
    cashierUserId: 1,
    employeeId: 1,
    cashierName: "أحمد",
    openingFloat: "200.00",
    openedAt: "2026-08-02T08:00:00.000Z",
    closedAt: null,
    closedByUserId: null,
    actualCash: null,
    expectedCash: null,
    overShort: null,
    workedMinutes: 0,
    events: [],
    ...overrides,
    totals: {
      ordersCount: 0,
      sales: "0.00",
      discounts: "0.00",
      transferRequests: 0,
      refunds: "0.00",
      expenses: "0.00",
      wasteEntries: 0,
      ...overrides.totals,
    },
  };
}

function stockRow(overrides: Partial<InventoryStockRow>): InventoryStockRow {
  return {
    itemId: 1,
    code: 1,
    name: "بن",
    categoryId: 1,
    categoryName: "قهوة",
    type: "raw",
    stockUnit: "كجم",
    isActive: true,
    quantity: "1.000",
    stockValue: "10.000000000",
    minimumLevel: "3.000",
    isLowStock: false,
    isNegativeStock: false,
    ...overrides,
  };
}

const noAttention = {
  mainStock: [] as InventoryStockRow[],
  cafeStock: [] as InventoryStockRow[],
  requests: [] as TransferRequestSummary[],
  suppliers: [] as Supplier[],
};

function request(status: TransferRequestSummary["status"]) {
  return {
    id: 1,
    requestedBy: 1,
    shiftId: 1,
    requestedByName: "أحمد",
    notes: null,
    status,
    reviewedBy: null,
    reviewedByName: null,
    rejectionReason: null,
    reviewedAt: null,
    createdAt: "2026-08-02T08:00:00.000Z",
    lineCount: 1,
  } satisfies TransferRequestSummary;
}

describe("home view model", () => {
  it("greets by the hour of the Cairo day", () => {
    expect(greetingFor(2)).toBe("سهرة سعيدة");
    expect(greetingFor(8)).toBe("صباح الخير");
    expect(greetingFor(14)).toBe("نهارك سعيد");
    expect(greetingFor(21)).toBe("مساء الخير");
  });

  it("counts nouns the way Arabic does", () => {
    expect(countPhrase(1, ITEM_COUNT)).toBe("صنف واحد");
    expect(countPhrase(2, ITEM_COUNT)).toBe("صنفان");
    expect(countPhrase(5, ITEM_COUNT)).toBe("٥ أصناف");
    expect(countPhrase(14, ITEM_COUNT)).toBe("١٤ صنفًا");
    expect(countPhrase(100, ITEM_COUNT)).toBe("١٠٠ صنف");
  });

  it("only exposes a drawer the signed-in user may look inside", () => {
    expect(openShiftOf(null)).toBeNull();
    expect(openShiftOf({ occupied: true })).toBeNull();
    expect(drawerIsBusy({ occupied: true })).toBe(true);
    expect(drawerIsBusy(null)).toBe(false);
    const open = shift({ id: 4, status: "open" });
    expect(openShiftOf(open)).toBe(open);
    expect(drawerIsBusy(open)).toBe(false);
  });

  it("prints the open shift as receipt lines", () => {
    const lines = shiftTapeLines(
      shift({
        id: 4,
        status: "open",
        totals: {
          ordersCount: 3,
          sales: "1340.00",
          discounts: "30.00",
          transferRequests: 0,
          refunds: "80.00",
          expenses: "120.00",
          wasteEntries: 0,
        },
      }),
    );
    expect(lines).toEqual([
      { label: "العهدة الافتتاحية", value: formatMoney("200.00") },
      { label: "المبيعات", value: formatMoney("1340.00") },
      { label: "الطلبات", value: "٣" },
      { label: "الخصومات", value: formatMoney("30.00") },
      { label: "المرتجعات", value: formatMoney("80.00") },
      { label: "مصروفات الدرج", value: formatMoney("120.00") },
    ]);
  });

  it("never sets a separator against Arabic-Indic digits, which reads as one", () => {
    const labels = [
      ...shiftTapeLines(shift({ id: 4, status: "open" })),
      ...dayTape([shift({ id: 4 })]).lines,
    ].map((line) => line.label);
    const supplierLabel = attentionItems({
      ...noAttention,
      role: "admin",
      suppliers: [
        {
          id: 1,
          name: "مورد",
          phone: null,
          address: null,
          notes: null,
          openingBalance: "0",
          isActive: true,
          balance: "1200.00",
        },
      ],
    })[0].label;
    for (const text of [...labels, supplierLabel])
      expect(text).not.toMatch(/·\s*[٠-٩]|[٠-٩]\s*·/u);
  });

  it("writes worked time in the same digits as the rest of the tape", () => {
    expect(workedLabel(204)).not.toMatch(/[0-9]/);
  });

  it("totals only the shifts opened on the given Cairo day", () => {
    const shifts = [
      shift({
        id: 1,
        openedAt: "2026-08-02T06:00:00.000Z",
        totals: {
          ordersCount: 4,
          sales: "1000.50",
          discounts: "0.00",
          transferRequests: 0,
          refunds: "0.00",
          expenses: "50.00",
          wasteEntries: 0,
        },
      }),
      shift({
        id: 2,
        openedAt: "2026-08-02T14:00:00.000Z",
        totals: {
          ordersCount: 6,
          sales: "500.25",
          discounts: "0.00",
          transferRequests: 0,
          refunds: "0.00",
          expenses: "20.00",
          wasteEntries: 0,
        },
      }),
      shift({ id: 3, openedAt: "2026-08-01T14:00:00.000Z" }),
    ];
    const day = dayTape(shifts, "2026-08-02");
    expect(day.shiftCount).toBe(2);
    expect(day.lines).toEqual([
      { label: "المبيعات", value: formatMoney("1500.75") },
      { label: "الطلبات", value: "١٠" },
      { label: "المصروفات", value: formatMoney("70.00") },
    ]);
  });

  it("counts a shift opened late on a Cairo evening as that Cairo day", () => {
    // 22:30 UTC on the 1st is 00:30 on the 2nd in Cairo
    const late = shift({ id: 9, openedAt: "2026-08-01T22:30:00.000Z" });
    expect(dayTape([late], "2026-08-02").shiftCount).toBe(1);
  });

  it("raises negative stock above low stock above informational items", () => {
    const items = attentionItems({
      ...noAttention,
      role: "admin",
      cafeStock: [
        stockRow({ itemId: 1, isLowStock: true }),
        stockRow({ itemId: 2, isNegativeStock: true }),
      ],
      mainStock: [stockRow({ itemId: 3, isLowStock: true })],
      requests: [request("pending"), request("rejected")],
      suppliers: [
        { id: 1, name: "مورد", phone: null, address: null, notes: null, openingBalance: "0", isActive: true, balance: "1200.00" },
      ],
    });
    expect(items.map((item) => item.id)).toEqual([
      "cafe-negative",
      "transfers",
      "cafe-low",
      "main-low",
      "supplier-dues",
    ]);
    expect(items[0].tone).toBe("danger");
    expect(items[1].label).toBe("طلب تحويل واحد بانتظار موافقتك");
    expect(items[2].label).toBe("صنف واحد تحت حد التنبيه في الكافيه");
  });

  it("tells a cashier a transfer request waits on the manager instead", () => {
    const [item] = attentionItems({
      ...noAttention,
      role: "cashier",
      requests: [request("pending")],
    });
    expect(item.label).toBe("طلب تحويل واحد بانتظار موافقة المدير");
    expect(item.tone).toBe("info");
  });

  it("ignores inactive items when counting low stock", () => {
    expect(
      attentionItems({
        ...noAttention,
        role: "admin",
        cafeStock: [stockRow({ isActive: false, isLowStock: true })],
      }),
    ).toEqual([]);
  });

  it("says nothing when nothing needs doing", () => {
    expect(attentionItems({ ...noAttention, role: "admin" })).toEqual([]);
  });

  it("reads worked time in hours and minutes", () => {
    expect(workedLabel(45)).toBe("٤٥ دقيقة");
    expect(workedLabel(200)).toBe("٣ س ٢٠ د");
  });
});
