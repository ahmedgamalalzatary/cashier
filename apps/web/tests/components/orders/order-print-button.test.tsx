import type { ReactElement, ReactNode } from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
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

const page = readFileSync(
  new URL("../../../src/app/orders/page.tsx", import.meta.url),
  "utf8",
);

describe("printing a receipt from an order row", () => {
  it("carries a per-row print icon", () => {
    hooks.cursor = 0;
    hooks.state = [false, null];
    const markup = renderToStaticMarkup(
      <OrderPrintButton
        orderId="o1"
        orderNumber="55"
        onFail={vi.fn()}
        onOrder={vi.fn()}
      />,
    );
    expect(markup).toContain('aria-label="طباعة الطلب 55"');
  });

  it("renders no receipt itself; the list owns the single active one", () => {
    hooks.cursor = 0;
    hooks.state = [false, { id: "o1" }];
    const markup = renderToStaticMarkup(
      <OrderPrintButton
        orderId="o1"
        orderNumber="55"
        onFail={vi.fn()}
        onOrder={vi.fn()}
      />,
    );
    expect(markup).not.toContain("PrintSlip");
    expect(
      elements(
        OrderPrintButton({
          orderId: "o1",
          orderNumber: "55",
          onFail: vi.fn(),
          onOrder: vi.fn(),
        }),
      ).some((el) => typeof el.type === "function" && el.type.name === "PrintSlip"),
    ).toBe(false);
  });

  it("hands the loaded order to the list for printing", async () => {
    hooks.cursor = 0;
    hooks.state = [false, null];
    vi.mocked(getOrder).mockResolvedValue(order);
    const onOrder = vi.fn();
    const button = OrderPrintButton({
      orderId: "o1",
      orderNumber: "55",
      onFail: vi.fn(),
      onOrder,
    });
    const icon = elements(button).find((el) => "onClick" in propsOf(el))!;
    (propsOf(icon).onClick as () => void)();
    expect(getOrder).toHaveBeenCalledExactlyOnceWith("o1");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onOrder).toHaveBeenCalledExactlyOnceWith(order);
  });

  it("reports a load failure to the page banner", async () => {
    hooks.cursor = 0;
    hooks.state = [false, null];
    vi.mocked(getOrder).mockRejectedValue(new Error("تعذر تحميل الطلب"));
    const onFail = vi.fn();
    const button = OrderPrintButton({
      orderId: "o1",
      orderNumber: "55",
      onFail,
      onOrder: vi.fn(),
    });
    const icon = elements(button).find((el) => "onClick" in propsOf(el))!;
    (propsOf(icon).onClick as () => void)();
    await new Promise((resolve) => setTimeout(resolve));
    expect(onFail).toHaveBeenLastCalledWith("تعذر تحميل الطلب");
  });

  it("keeps one active receipt for the whole list and clears it after printing", () => {
    // one printing state at page level, not inside each row's button
    expect(page).toContain("usePrintSlip<OrderDetail>()");
    expect(page).toContain("<OrderPrintButton");
    expect(page.match(/<PrintSlip>/g)?.length ?? 0).toBe(1);
    // the shared hook clears on afterprint, never right after window.print()
    expect(page).not.toContain("setPrinting(null)");
  });

  it("forgets the print banner once a later print reaches the dialog", () => {
    const printNow = page.match(
      /const printNow = \(order: OrderDetail\) => \{[\s\S]*?\};/,
    )?.[0];
    expect(printNow).toContain('setPrintError("")');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
