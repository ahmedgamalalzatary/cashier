import type { Shift } from "@cashier/shared";

export function shiftFixture(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 41,
    status: "open",
    cashierUserId: 9,
    employeeId: 3,
    cashierName: "Cashier One",
    openingFloat: "100.00",
    openedAt: "2026-09-27T08:00:00Z",
    closedAt: null,
    closedByUserId: null,
    actualCash: null,
    expectedCash: null,
    overShort: null,
    workedMinutes: 5,
    totals: {
      ordersCount: 1,
      sales: "20.00",
      discounts: "0.00",
      transferRequests: 0,
      refunds: "0.00",
      expenses: "0.00",
      wasteEntries: 0,
    },
    events: [],
    ...overrides,
  };
}
