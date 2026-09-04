import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "src/modules/products/products.repository.ts"),
  "utf8",
);

describe("ProductsRepository batching boundaries", () => {
  it("chunks multi-row catalog and ingredient inserts", () => {
    expect(source).toContain("INSERT_CHUNK_SIZE");
    expect(source).toContain(
      "for (const categoryChunk of chunks(categoryRows))",
    );
    expect(source).toContain(
      "for (const ingredientChunk of chunks(baseIngredientRows))",
    );
    expect(source).toContain(
      "for (const ingredientChunk of chunks(sizeIngredientRows))",
    );
    expect(source).toContain(
      "for (const ingredientChunk of chunks(modifierIngredientRows))",
    );
  });

  it("filters ingredient selects through current catalog parents", () => {
    expect(source).toContain("eq(externalProducts.isCurrent, true)");
    expect(source).toContain("eq(externalProductSizes.isCurrent, true)");
    expect(source).toContain("eq(externalModifierOptions.isCurrent, true)");
  });
});
