import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import OrderPage from "../../../src/app/orders/detail/page";
import type { OrderDetail } from "@cashier/shared";

const hooks = vi.hoisted(() => ({
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
  useSearchParams: () => ({ get: () => "019a-order" }),
}));
vi.mock("@cashier/web-core/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { role: "admin" } }),
}));
vi.mock("@/services/orders-service", () => ({ getOrder: vi.fn() }));

const order = {
  id: "019a-order",
  orderNumber: "1012",
  cashierId: "c1",
  cashierName: "كاشير",
  shiftId: null,
  subtotal: "100.00",
  discountType: null,
  discountValue: null,
  discountAmount: "0.00",
  total: "100.00",
  cashReceived: "100.00",
  changeAmount: "0.00",
  totalCost: "60.00",
  isNegativeStock: false,
  isAdminSale: false,
  createdAt: "2026-10-15T14:00:00",
  lines: [
    {
      id: "l1",
      type: "item",
      recipeId: null,
      recipeSizeId: null,
      itemId: "i1",
      externalProductId: null,
      externalSizeId: null,
      productName: "قهوة",
      sizeName: null,
      quantity: "1",
      unitPrice: "100.00",
      lineSubtotal: "100.00",
      totalCost: "60.00",
      hasStockDeficit: false,
      modifiers: [],
      allocations: [],
    },
  ],
} as unknown as OrderDetail;

function buildDetail() {
  hooks.cursor = 0;
  hooks.effects = [];
  const page = OrderPage() as {
    props: { children: ReactElement };
  };
  const child = page.props.children;
  return (child.type as () => ReactElement)();
}

function renderDetail() {
  hooks.cursor = 0;
  hooks.effects = [];
  hooks.state = [order, "", false, ""];
  const page = OrderPage() as {
    props: { children: ReactElement };
  };
  const child = page.props.children;
  return (child.type as () => ReactElement)();
}

type Pairs = ReactElement;

function propsOf(node: unknown): Record<string, unknown> {
  return (node as { props?: Record<string, unknown> }).props ?? {};
}

function elements(node: ReactNode): Pairs[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== "object" || !("type" in node)) return [];
  const element = node as Pairs;
  const walk: unknown[] = Object.values(propsOf(element)).filter(
    (value) => typeof value === "object" || typeof value === "string",
  );
  return [element, ...walk.flatMap((value) => elements(value as ReactNode))];
}

function text(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(propsOf(node).children as ReactNode);
}

describe("admin refund on the order page", () => {
  it("shows the refund button to admins too", () => {
    const detail = renderDetail();
    const html = renderToStaticMarkup(detail);
    expect(html).toContain("مرتجع");
  });

  it("opens the refund modal when an admin clicks it", () => {
    hooks.cursor = 0;
    hooks.state = [order, "", false, ""];
    const detail = buildDetail();
    const all = elements(detail);
    const refund = all.find(
      (el) =>
        "onClick" in propsOf(el) &&
        text(propsOf(el).children as ReactNode).includes("مرتجع"),
    );
    expect(refund).toBeDefined();
    (propsOf(refund).onClick as () => void)();

    // re-render with the click applied: index 2 (refunding) was set to true
    hooks.cursor = 0;
    const open = buildDetail();
    const markup = renderToStaticMarkup(open);
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("المرتجع");
  });
});
