import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppShellHeaderView } from "../../../src/components/layout/app-shell";

type Node = ReactElement<{
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
}>;

function elements(node: ReactNode): Node[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  const element = node as Node;
  return [
    element,
    ...elements(
      (element.props as { children?: ReactNode }).children ?? null,
    ),
  ];
}

describe("app shell mobile header", () => {
  it("puts the menu button first so it lands on the drawer's side (RTL right edge)", () => {
    const header = AppShellHeaderView({
      navOpen: false,
      onOpen: vi.fn(),
    });
    const children = (header as Node).props.children as ReactNode[];
    const topLevel = children.filter(
      (child): child is Node =>
        typeof child === "object" && child !== null,
    );
    expect(topLevel.length).toBe(2);
    expect(topLevel.findIndex((el) => el.type === "button")).toBeLessThan(
      topLevel.findIndex((el) => el.type === "span"),
    );
  });

  it("opens the drawer from the button", () => {
    const onOpen = vi.fn();
    const header = AppShellHeaderView({ navOpen: false, onOpen });
    const button = elements(header).find((el) => el.type === "button")!;
    button.props.onClick!();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("uses an inline-start margin so the button hugs the right edge in RTL", () => {
    const header = AppShellHeaderView({ navOpen: false, onOpen: vi.fn() });
    const button = elements(header).find((el) => el.type === "button")!;
    expect(button.props.className).toContain("-ms-2");
    expect(button.props.className).not.toContain("-me-2");
  });
});
