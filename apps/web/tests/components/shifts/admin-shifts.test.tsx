import { testId } from "@cashier/shared/test-support";
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
vi.mock("@cashier/web-core/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: testId(1), role: "admin" } }),
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
  "@cashier/web-core/components/ui/button",
  async () => import("@cashier/web-core/components/ui/button"),
);
vi.mock(
  "@cashier/web-core/components/ui/modal",
  async () => import("@cashier/web-core/components/ui/modal"),
);
vi.mock(
  "@cashier/web-core/components/ui/field",
  async () => import("@cashier/web-core/components/ui/field"),
);
vi.mock(
  "@cashier/web-core/components/ui/badge",
  async () => import("@cashier/web-core/components/ui/badge"),
);
vi.mock(
  "@cashier/web-core/components/ui/page-header",
  async () => import("@cashier/web-core/components/ui/page-header"),
);
vi.mock(
  "@cashier/web-core/components/ui/icon-button",
  async () => import("@cashier/web-core/components/ui/icon-button"),
);
vi.mock(
  "@cashier/web-core/lib/format",
  async () => import("@cashier/web-core/lib/format"),
);
vi.mock(
  "@/services/shifts-service",
  async () => import("../../../src/services/shifts-service"),
);
vi.mock(
  "@cashier/web-core/services/reports-service",
  async () => import("@cashier/web-core/services/reports-service"),
);
vi.mock(
  "@cashier/web-core/lib/api",
  async () => import("@cashier/web-core/lib/api"),
);

function stateValues(values: unknown[]) {
  useStateMock.mockImplementation((initial: unknown) => [
    values.length ? values.shift() : initial,
    vi.fn(),
  ]);
}
describe("shift administration and history", () => {
  beforeEach(() => useStateMock.mockReset());
  it("shows the system actor and expected cash for an uncounted auto-close event", () => {
    stateValues([
      0,
      [
        shiftFixture({
          status: "closed",
          events: [
            {
              id: testId(1),
              action: "auto_close",
              actorUserId: null,
              note: null,
              openingFloat: null,
              actualCash: null,
              expectedCash: "137.00",
              overShort: null,
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
    const event = html.slice(html.indexOf("<ol"), html.indexOf("</ol>"));
    expect(event).toContain("النظام");
    expect(event).toContain("المتوقع:");
    expect(event).toContain("١٣٧٫٠٠");
    expect(event).not.toContain("المستخدم #");
  });
  it("shows both concurrent shifts with separate admin closing actions", () => {
    stateValues([
      [
        shiftFixture(),
        shiftFixture({ id: testId(42), cashierUserId: testId(10), cashierName: "Cashier Two" }),
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
          { id: testId(41), cashierName: "Cashier One", sales: "20.00" },
          { id: testId(42), cashierName: "Cashier Two", sales: "40.00" },
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
              id: testId(1),
              action: "admin_close",
              actorUserId: testId(1),
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
