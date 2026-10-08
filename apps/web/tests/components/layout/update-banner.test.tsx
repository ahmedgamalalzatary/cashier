import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { UpdateBannerView } from "../../../src/components/layout/update-banner";

type Node = ReactElement<{
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}>;

function text(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text((node as Node).props.children);
}
function button(node: ReactNode): Node | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map(button).find(Boolean);
  const element = node as Node;
  if (element.type === "button") return element;
  return button(element.props.children);
}

describe("update banner", () => {
  it("stays hidden until an update is available", () => {
    expect(
      UpdateBannerView({
        version: null,
        installing: false,
        onInstall: vi.fn(),
      }),
    ).toBeNull();
  });

  it("offers the new version and installs it on request", () => {
    const onInstall = vi.fn();
    const banner = UpdateBannerView({
      version: "0.2.3",
      installing: false,
      onInstall,
    });
    expect(text(banner)).toContain("0.2.3");
    const action = button(banner)!;
    expect(text(action)).toContain("تحديث الآن");
    action.props.onClick!();
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it("cannot be pressed twice while Cashier closes to install", () => {
    const banner = UpdateBannerView({
      version: "0.2.3",
      installing: true,
      onInstall: vi.fn(),
    });
    expect(button(banner)!.props.disabled).toBe(true);
  });
});
