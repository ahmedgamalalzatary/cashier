import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shiftFixture } from "../../fixtures/shift";
import ShiftsPage from "../../../src/app/shifts/page";
import { ShiftHistory } from "../../../src/components/shifts/shift-history";
import { AdminMetrics } from "../../../src/components/home/admin-metrics";

const { useStateMock } = vi.hoisted(() => ({ useStateMock: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: useStateMock,
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: 1, role: "admin" } }),
}));
vi.mock(
  "@/components/shifts/shift-action-modal",
  async () => import("../../../src/components/shifts/shift-action-modal"),
);
vi.mock(
  "@/components/shifts/shift-history",
  async () => import("../../../src/components/shifts/shift-history"),
);
vi.mock(
  "@/components/ui/button",
  async () => import("../../../src/components/ui/button"),
);
vi.mock(
  "@/components/ui/modal",
  async () => import("../../../src/components/ui/modal"),
);
vi.mock(
  "@/components/ui/field",
  async () => import("../../../src/components/ui/field"),
);
vi.mock(
  "@/components/ui/badge",
  async () => import("../../../src/components/ui/badge"),
);
vi.mock(
  "@/components/ui/page-header",
  async () => import("../../../src/components/ui/page-header"),
);
vi.mock(
  "@/components/ui/icon-button",
  async () => import("../../../src/components/ui/icon-button"),
);
vi.mock("@/lib/format", async () => import("../../../src/lib/format"));
vi.mock(
  "@/services/shifts-service",
  async () => import("../../../src/services/shifts-service"),
);
vi.mock(
  "@/services/reports-service",
  async () => import("../../../src/services/reports-service"),
);
vi.mock("@/lib/api", async () => import("../../../src/lib/api"));

function stateValues(values: unknown[]) {
  useStateMock.mockImplementation((initial: unknown) => [
    values.length ? values.shift() : initial,
    vi.fn(),
  ]);
}
describe("shift administration and history", () => {
  beforeEach(() => useStateMock.mockReset());
  it("shows both concurrent shifts with separate admin closing actions", () => {
    stateValues([
      [
        shiftFixture(),
        shiftFixture({ id: 42, cashierUserId: 10, cashierName: "Cashier Two" }),
      ],
      0,
      false,
      "",
      null,
    ]);
    const html = renderToStaticMarkup(<ShiftsPage />);
    expect(html).toContain("Cashier One");
    expect(html).toContain("Cashier Two");
    expect(html.match(/إغلاق إداري/g)).toHaveLength(2);
  });
  it("shows every concurrent shift in the Home dashboard", () => {
    stateValues([
      {
        summary: null,
        openShifts: [
          { id: 41, cashierName: "Cashier One", sales: "20.00" },
          { id: 42, cashierName: "Cashier Two", sales: "40.00" },
        ],
        stock: [],
      },
      "",
    ]);
    const html = renderToStaticMarkup(<AdminMetrics />);
    expect(html).toContain("Cashier One");
    expect(html).toContain("Cashier Two");
  });
  it("shows older shift details and audit notes with navigation back to the first page", () => {
    stateValues([
      100,
      [
        shiftFixture({
          status: "closed",
          actualCash: "120.00",
          expectedCash: "120.00",
          overShort: "0.00",
          events: [
            {
              id: 1,
              action: "admin_close",
              actorUserId: 1,
              note: "Cashier left early",
              openingFloat: "100.00",
              actualCash: "120.00",
              expectedCash: "120.00",
              overShort: "0.00",
              occurredAt: "2026-09-27T09:00:00Z",
            },
          ],
        }),
      ],
      false,
      "",
      0,
    ]);
    const html = renderToStaticMarkup(<ShiftHistory />);
    expect(html).toContain("Cashier left early");
    expect(html).toContain("صفحة 2");
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*>السابق<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>التالي<\/button>/);
  });
});
