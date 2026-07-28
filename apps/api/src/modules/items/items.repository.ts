import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  categories,
  categoryColors,
  categorySizes,
  items,
  products,
} from "../../db/schema.js";
import type { ItemUpdateInput, VariantInput } from "./items.schemas.js";

export class ItemsRepository {
  constructor(private db: Db) {}

  transaction<T>(fn: (repo: ItemsRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn(new ItemsRepository(tx as unknown as Db)),
    );
  }

  async list() {
    const rows = await this.db
      .select({
        id: products.id,
        name: products.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
        isActive: products.isActive,
        createdAt: products.createdAt,
        variantId: items.id,
        code: items.code,
        barcode: items.barcode,
        colorId: items.colorId,
        colorName: categoryColors.name,
        sizeId: items.sizeId,
        sizeName: categorySizes.name,
        sellingPrice: items.sellingPrice,
        mainMinimumLevel: items.mainMinimumLevel,
        shopMinimumLevel: items.shopMinimumLevel,
        variantIsActive: items.isActive,
        hasStockHistory: sql<number>`EXISTS (
          SELECT 1 FROM stock_movements stock_history
          WHERE stock_history.variant_id = ${items.id}
        )`,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(items, eq(items.productId, products.id))
      .leftJoin(categoryColors, eq(items.colorId, categoryColors.id))
      .leftJoin(categorySizes, eq(items.sizeId, categorySizes.id))
      .orderBy(products.name, categoryColors.name, categorySizes.name);
    const grouped = new Map<number, {
      id: number;
      name: string;
      categoryId: number;
      categoryName: string;
      isActive: boolean;
      createdAt: Date;
      variants: Array<Record<string, unknown>>;
    }>();
    for (const row of rows) {
      let product = grouped.get(row.id);
      if (!product) {
        product = {
          id: row.id,
          name: row.name,
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          isActive: row.isActive,
          createdAt: row.createdAt,
          variants: [],
        };
        grouped.set(row.id, product);
      }
      if (row.variantId !== null) {
        product.variants.push({
          id: row.variantId,
          code: row.code,
          barcode: row.barcode,
          colorId: row.colorId,
          colorName: row.colorName,
          sizeId: row.sizeId,
          sizeName: row.sizeName,
          sellingPrice: row.sellingPrice,
          mainMinimumLevel: row.mainMinimumLevel,
          shopMinimumLevel: row.shopMinimumLevel,
          isActive: row.variantIsActive,
          hasStockHistory: Boolean(row.hasStockHistory),
        });
      }
    }
    return [...grouped.values()];
  }

  async findProductForUpdate(id: number) {
    const [row] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .for("update");
    return row;
  }

  lockCategories(ids: number[]) {
    return this.db
      .select()
      .from(categories)
      .where(inArray(categories.id, [...new Set(ids)].sort((a, b) => a - b)))
      .orderBy(categories.id)
      .for("update");
  }

  async categoryHasChildren(categoryId: number) {
    const [row] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, categoryId))
      .limit(1);
    return Boolean(row);
  }

  lockOptions(categoryId: number, colorIds: number[], sizeIds: number[]) {
    return Promise.all([
      this.db
        .select()
        .from(categoryColors)
        .where(
          and(
            eq(categoryColors.categoryId, categoryId),
            inArray(categoryColors.id, colorIds),
          ),
        )
        .for("update"),
      this.db
        .select()
        .from(categorySizes)
        .where(
          and(
            eq(categorySizes.categoryId, categoryId),
            inArray(categorySizes.id, sizeIds),
          ),
        )
        .for("update"),
    ]);
  }

  async nextItemCodes(count: number) {
    const [row] = await this.db
      .select({ maximum: sql<number | null>`MAX(${items.code})` })
      .from(items)
      .for("update");
    const start = (row?.maximum ?? 0) + 1;
    return Array.from({ length: count }, (_, index) => start + index);
  }

  async createProduct(name: string, categoryId: number) {
    const [result] = await this.db
      .insert(products)
      .values({ name, categoryId });
    return result.insertId;
  }

  async createVariants(
    productId: number,
    variants: VariantInput[],
    codes: number[],
  ) {
    await this.db.insert(items).values(
      variants.map((variant, index) => ({
        productId,
        colorId: variant.colorId,
        sizeId: variant.sizeId,
        code: codes[index]!,
        barcode: variant.barcode ?? null,
        sellingPrice: variant.sellingPrice.toFixed(2),
        isActive: variant.isActive ?? true,
      })),
    );
  }

  lockVariantsForProduct(productId: number, variantIds: number[]) {
    return this.db
      .select({ id: items.id })
      .from(items)
      .where(
        and(
          eq(items.productId, productId),
          inArray(items.id, [...new Set(variantIds)].sort((a, b) => a - b)),
        ),
      )
      .orderBy(items.id)
      .for("update");
  }

  async updateVariants(
    productId: number,
    variants: Array<VariantInput & { id: number }>,
  ) {
    for (const variant of variants) {
      await this.db
        .update(items)
        .set({
          barcode: variant.barcode ?? null,
          sellingPrice: variant.sellingPrice.toFixed(2),
          isActive: variant.isActive ?? true,
        })
        .where(and(eq(items.id, variant.id), eq(items.productId, productId)));
    }
  }

  async updateProduct(id: number, data: ItemUpdateInput) {
    const { variants: _variants, ...values } = data;
    const [result] = await this.db
      .update(products)
      .set(values)
      .where(eq(products.id, id));
    return result.affectedRows > 0;
  }

  async deactivateProduct(id: number) {
    await this.db
      .update(products)
      .set({ isActive: false })
      .where(eq(products.id, id));
    await this.db
      .update(items)
      .set({ isActive: false })
      .where(eq(items.productId, id));
  }
}
