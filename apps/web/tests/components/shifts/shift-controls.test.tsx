import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShiftTape } from "../../../src/components/home/shift-tape";

vi.mock("@cashier/web-core/lib/cairo-date", async () => import("@cashier/web-core/lib/cairo-date"));
vi.mock(
  "@/models/home-model",
  async () => import("../../../src/models/home-model"),
);
vi.mock(
  "@cashier/web-core/components/ui/button",
  async () => import("@cashier/web-core/components/ui/button"),
);
vi.mock(
  "@cashier/web-core/components/ui/field",
  async () => import("@cashier/web-core/components/ui/field"),
);
vi.mock(
  "@cashier/web-core/components/ui/modal",
  async () => import("@cashier/web-core/components/ui/modal"),
);

describe("cashier controls on Home", () => {
  it("offers opening a shift directly without linking to the admin Shifts page", () => {
    const html = renderToStaticMarkup(
      <ShiftTape role="cashier" current={null} shifts={[]} />,
    );
    expect(html).toMatch(/<button[^>]*>[^<]*فتح وردية/);
    expect(html).not.toContain('href="/shifts"');
  });
});
