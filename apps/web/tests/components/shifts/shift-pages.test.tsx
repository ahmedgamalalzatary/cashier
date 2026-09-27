import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PosPage from "../../../src/app/pos/page";

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: 9, role: "cashier", name: "Cashier" } }),
}));
vi.mock(
  "@/components/shifts/cashier-shift-controls",
  async () => import("../../../src/components/shifts/cashier-shift-controls"),
);
vi.mock(
  "@/components/pos/order-receipt",
  async () => import("../../../src/components/pos/order-receipt"),
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
vi.mock("@/lib/format", async () => import("../../../src/lib/format"));
vi.mock(
  "@/models/catalog-refresh",
  async () => import("../../../src/models/catalog-refresh"),
);
vi.mock(
  "@/models/pos-model",
  async () => import("../../../src/models/pos-model"),
);
vi.mock(
  "@/services/orders-service",
  async () => import("../../../src/services/orders-service"),
);
vi.mock(
  "@/services/shifts-service",
  async () => import("../../../src/services/shifts-service"),
);
vi.mock(
  "@/services/products-service",
  async () => import("../../../src/services/products-service"),
);

describe("cashier POS shift entry points", () => {
  it("renders direct open and history controls, disabled until POS finishes loading", () => {
    const html = renderToStaticMarkup(<PosPage />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>فتح وردية<\/button>/);
    expect(html).toContain("سجل وردياتي");
    expect(html).not.toContain('href="/shifts"');
  });
});
