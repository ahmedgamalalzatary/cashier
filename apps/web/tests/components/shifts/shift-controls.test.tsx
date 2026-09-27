import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShiftTape } from "../../../src/components/home/shift-tape";

vi.mock("@/lib/cairo-date", async () => import("../../../src/lib/cairo-date"));
vi.mock(
  "@/models/home-model",
  async () => import("../../../src/models/home-model"),
);
vi.mock(
  "@/components/ui/button",
  async () => import("../../../src/components/ui/button"),
);
vi.mock(
  "@/components/ui/field",
  async () => import("../../../src/components/ui/field"),
);
vi.mock(
  "@/components/ui/modal",
  async () => import("../../../src/components/ui/modal"),
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
