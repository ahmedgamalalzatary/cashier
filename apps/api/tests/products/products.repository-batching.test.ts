import { drizzle } from "drizzle-orm/mysql-proxy";
import { describe, expect, it } from "vitest";
import type { Db } from "../../src/db/index.js";
import * as schema from "../../src/db/schema.js";
import { ProductsRepository } from "../../src/modules/products/products.repository.js";

const INSERT_CHUNK_SIZE = 250;

function recordingDb() {
  const statements: string[] = [];
  const inner = drizzle(
    async (sql, params, mode) => {
      statements.push(sql);
      if (mode === "execute") {
        return { rows: [{ insertId: 0, affectedRows: 1 }] };
      }
      const text = sql.toLowerCase();
      if (
        text.includes("from `external_catalog_sync`") &&
        text.includes("select")
      ) {
        return { rows: [{ lastSuccessfulSyncAt: new Date("2026-08-21") }] };
      }
      if (
        text.includes("from `external_products`") &&
        text.includes("for update")
      ) {
        return { rows: [{ externalId: 1 }] };
      }
      if (
        text.includes("from `external_product_sizes`") &&
        text.includes("for update")
      ) {
        return { rows: [] };
      }
      if (
        text.includes("from `external_modifier_options`") &&
        text.includes("for update")
      ) {
        return { rows: [] };
      }
      if (text.includes("from `items`")) {
        return {
          rows: Array.from({ length: INSERT_CHUNK_SIZE + 1 }, (_, index) => [
            index + 1,
            1,
          ]),
        };
      }
      return { rows: [] };
    },
    { schema, mode: "default" },
  );
  const db = Object.assign(inner, {
    transaction: async (run: (tx: typeof inner) => Promise<unknown>) =>
      run(inner),
  }) as unknown as Db;
  return { db, statements };
}

function insertStatements(statements: string[], table: string) {
  return statements.filter((sql) =>
    sql.toLowerCase().includes(`insert into \`${table}\``),
  );
}

function catalogCategory(index: number) {
  return {
    externalId: index,
    nameAr: `صنف ${index}`,
    nameEn: `Cat ${index}`,
    descriptionAr: null,
    descriptionEn: null,
    isActive: true,
    isVisible: true,
    displayOrder: index,
  };
}

describe("ProductsRepository batching boundaries", () => {
  it("chunks multi-row catalog and ingredient inserts", async () => {
    const { db, statements } = recordingDb();
    const repository = new ProductsRepository(db, false);

    await repository.applyCatalog({
      categories: Array.from({ length: INSERT_CHUNK_SIZE + 1 }, (_, index) =>
        catalogCategory(index + 1),
      ),
      products: [],
    });

    const categoryInserts = insertStatements(statements, "external_categories");
    expect(categoryInserts).toHaveLength(2);

    statements.length = 0;
    await repository.saveStockSetup(1, {
      baseIngredients: Array.from(
        { length: INSERT_CHUNK_SIZE + 1 },
        (_, index) => ({
          itemId: index + 1,
          quantity: 1,
        }),
      ),
      sizes: [],
      modifiers: [],
    });

    const ingredientInserts = insertStatements(
      statements,
      "external_product_ingredients",
    );
    expect(ingredientInserts).toHaveLength(2);
  });

  it("filters ingredient selects through current catalog parents", async () => {
    const { db, statements } = recordingDb();
    await new ProductsRepository(db, false).getCatalog();

    const ingredientSql = statements.filter((sql) =>
      /external_product_ingredients|external_size_ingredients|external_modifier_ingredients/.test(
        sql.toLowerCase(),
      ),
    );
    expect(ingredientSql).toHaveLength(3);
    for (const sql of ingredientSql) {
      expect(sql.toLowerCase()).toMatch(/`is_current`\s*=\s*/);
    }
  });
});
