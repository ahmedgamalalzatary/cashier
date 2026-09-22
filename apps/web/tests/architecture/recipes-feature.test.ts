import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("recipes feature boundaries", () => {
  it("provides the recipes implementation instead of a placeholder", () => {
    const page = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/recipes/page.tsx"),
      "utf8",
    );
    expect(page).not.toContain("ComingSoonPage");
    expect(page).toContain("listRecipes");
    expect(page).toContain("listPreparations");
  });

  it("provides a dedicated immutable preparation detail route", () => {
    expect(
      fs.existsSync(
        path.resolve(
          process.cwd(),
          "src/app/recipes/preparations/detail/page.tsx",
        ),
      ),
    ).toBe(true);
  });
});
