import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrderPage from "../../src/app/orders/detail/page";
import PurchasePage from "../../src/app/purchases/detail/page";
import SupplierPage from "../../src/app/suppliers/statement/page";
import TransferPage from "../../src/app/transfers/detail/page";
import PreparationPage from "../../src/app/recipes/preparations/detail/page";
import { getOrder } from "../../src/services/orders-service";
import { getPurchase } from "../../src/services/purchases-service";
import { getSupplierStatement } from "../../src/services/suppliers-service";
import { getTransfer } from "../../src/services/transfers-service";
import { getPreparation } from "../../src/services/recipes-service";

const hooks = vi.hoisted(() => ({
  id: null as string | null,
  state: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => unknown>,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.state.length) hooks.state[index] = initial;
    return [
      hooks.state[index],
      (value: unknown) => {
        hooks.state[index] = value;
      },
    ];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => unknown) => {
    hooks.effects.push(callback);
  },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => hooks.id }),
}));
vi.mock("@cashier/web-core/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { role: "admin" } }),
}));
vi.mock("@/services/orders-service", () => ({ getOrder: vi.fn() }));
vi.mock("@/services/purchases-service", () => ({ getPurchase: vi.fn() }));
vi.mock("@/services/suppliers-service", () => ({
  getSupplierStatement: vi.fn(),
}));
vi.mock("@/services/transfers-service", () => ({ getTransfer: vi.fn() }));
vi.mock("@/services/recipes-service", () => ({ getPreparation: vi.fn() }));

const cases = [
  { name: "order", Page: OrderPage, request: getOrder },
  { name: "purchase", Page: PurchasePage, request: getPurchase },
  { name: "supplier", Page: SupplierPage, request: getSupplierStatement },
  { name: "transfer", Page: TransferPage, request: getTransfer },
  { name: "preparation", Page: PreparationPage, request: getPreparation },
];
const id = "019a1234-5678-7000-8000-000000000301";

function render(Page: () => ReactElement) {
  hooks.cursor = 0;
  hooks.effects = [];
  const child = (Page().props as { children: ReactElement }).children;
  return (child.type as () => ReactElement)();
}

beforeEach(() => {
  hooks.state = [];
  hooks.id = null;
  vi.clearAllMocks();
  for (const { request } of cases)
    vi.mocked(request).mockReturnValue(new Promise<never>(() => {}));
  vi.stubGlobal("window", {
    setTimeout: (callback: () => void) => {
      callback();
      return 1;
    },
    clearTimeout: () => {},
  });
});
afterEach(() => vi.unstubAllGlobals());

describe.each(cases)("$name detail UUID navigation", ({ Page, request }) => {
  it("passes the query UUID unchanged to the service", () => {
    hooks.id = id;
    render(Page);
    hooks.effects.forEach((effect) => effect());
    expect(request).toHaveBeenCalledExactlyOnceWith(id);
  });

  it("shows an error without requesting a fabricated ID when the query is absent", () => {
    render(Page);
    hooks.effects.forEach((effect) => effect());
    const html = renderToStaticMarkup(render(Page));
    expect(request).not.toHaveBeenCalled();
    expect(html).toContain('role="alert"');
    expect(html).toContain("لم يتم تحديد السجل");
  });
});
