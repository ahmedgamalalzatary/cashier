import { testId } from "@cashier/shared/test-support";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PosPage from "../../../src/app/pos/page";

const { cursor } = vi.hoisted(() => ({ cursor: { value: 0 } }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) => {
      const index = cursor.value++;
      return react.useState(
        index === 0
          ? {
              products: [],
              categories: [],
              stale: false,
              lastSuccessfulSyncAt: null,
              syncError: null,
              localCategories: [
                { id: testId(1), name: "مشروبات", parentId: null },
                { id: testId(2), name: "قهوة", parentId: testId(1) },
              ],
              localProducts: [
                {
                  id: testId(9),
                  name: "تركي سنجل",
                  categoryId: testId(2),
                  sellingPrice: "35.00",
                  stockUnit: "فنجان",
                },
              ],
            }
          : initial === true
            ? false
            : initial,
      );
    },
  };
});
vi.mock("@cashier/web-core/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: testId(9), role: "cashier", name: "Cashier" } }),
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
vi.mock("@cashier/web-core/lib/format", async () => import("@cashier/web-core/lib/format"));
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

describe("local POS catalog", () => {
  it("shows the local menu product, selling price, stock unit and main-category controls", () => {
    cursor.value = 0;
    const html = renderToStaticMarkup(<PosPage />);
    expect(html).toContain("تركي سنجل");
    expect(html).toContain("٣٥");
    expect(html).toContain("فنجان");
    expect(html).toContain("مشروبات");
  });
});
