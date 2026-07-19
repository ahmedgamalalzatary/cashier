import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { unfinishedModules } from "../../src/components/layout/unfinished-modules";

describe("recipes feature boundaries", () => {
  it("replaces the placeholder and removes recipes from unfinished modules", () => {
    const page = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/recipes/page.tsx"),
      "utf8",
    );
    expect(page).not.toContain("ComingSoonPage");
    expect(page).toContain("listRecipes");
    expect(page).toContain("listPreparations");
    expect(unfinishedModules).not.toHaveProperty("recipes");
  });

  it("provides a dedicated immutable preparation detail route", () => {
    expect(
      fs.existsSync(
        path.resolve(
          process.cwd(),
          "src/app/recipes/preparations/[id]/page.tsx",
        ),
      ),
    ).toBe(true);
  });
});
