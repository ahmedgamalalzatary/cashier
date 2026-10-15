import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderPrintButton } from "../../../src/components/orders/order-print-button";
import { getOrder } from "../../../src/services/orders-service";
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
  useEffect: (callback: () => unknown) => {
    hooks.effects.push(callback);
  },
}));
vi.mock("@/services/orders-service", () => ({ getOrder: vi.fn() }));

const order = {
  id: "o1",
  orderNumber: "55",
  cashierId: "c1",
  cashierName: "كاشير",
  shiftId: null,
  subtotal: "0",
  discountType: null,
  discountValue: null,
  discountAmount: "0.00",
  total: "0.00",
  cashReceived: "0.00",
  changeAmount: "0.00",
  totalCost: "0.00",
  isNegativeStock: false,
  isAdminSale: false,
  createdAt: "2026-10-15T14:00:00",
  lines: [],
} as unknown as OrderDetail;

function propsOf(node: unknown): Record<string, unknown> {
  return (node as { props?: Record<string, unknown> }).props ?? {};
}

function elements(node: ReactNode): ReactElement[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== "object" || !("type" in node)) return [];
  const element = node as ReactElement;
  const walk: unknown[] = Object.values(propsOf(element)).filter(
    (value) => typeof value === "object" || typeof value === "string",
  );
  return [element, ...walk.flatMap((value) => elements(value as ReactNode))];
}

function render(orderState: unknown, loading: unknown) {
  hooks.cursor = 0;
  hooks.effects = [];
  hooks.state = [orderState, loading];
  return renderToStaticMarkup(
    <OrderPrintButton orderId="o1" orderNumber="55" onFail={vi.fn()} />,
  );
}

describe("printing a receipt from an order row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { print: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("carries a per-row print icon", () => {
    expect(render(null, false)).toContain('aria-label="طباعة الطلب 55"');
  });

  it("does not disable the icon while the page is idle", () => {
    expect(render(null, false)).not.toContain("disabled=");
  });

  it("loads the order detail and starts printing", async () => {
    hooks.cursor = 0;
    hooks.state = [null, false];
    vi.mocked(getOrder).mockResolvedValue(order);
    const button = OrderPrintButton({
      orderId: "o1",
      orderNumber: "55",
      onFail: vi.fn(),
    });
    const icon = elements(button).find(
      (el) => "onClick" in propsOf(el),
    )!;
    (propsOf(icon).onClick as () => void)();
    expect(getOrder).toHaveBeenCalledExactlyOnceWith("o1");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // the order was committed before the dialog opened, then printing ran
    expect(window.print).toHaveBeenCalledOnce();
    expect(hooks.state[1]).toBe(false);
    expect(hooks.state[0]).toEqual(order);
  });

  it("cannot start twice while the order is loading", () => {
    const markup = render(null, true);
    expect(markup).toContain("disabled=");
  });

  it("reports a load failure to the page banner", async () => {
    hooks.cursor = 0;
    hooks.state = [null, false];
    vi.mocked(getOrder).mockRejectedValue(new Error("تعذر تحميل الطلب"));
    const onFail = vi.fn();
    const button = OrderPrintButton({
      orderId: "o1",
      orderNumber: "55",
      onFail,
    });
    const icon = elements(button).find(
      (el) => "onClick" in propsOf(el),
    )!;
    (propsOf(icon).onClick as () => void)();
    await new Promise((resolve) => setTimeout(resolve));
    expect(onFail).toHaveBeenLastCalledWith("تعذر تحميل الطلب");
    expect(hooks.state[1]).toBe(false);
  });
});
