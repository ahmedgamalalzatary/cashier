import { z } from "zod";
import { HttpError } from "../../middleware/error.js";
import type { ExternalBackendClient } from "./external-backend.client.js";

const SQL_INT_MAX = 2_147_483_647;
const MAX_MONEY = 9_999_999_999.99;

const moneySchema = z
  .union([
    z.number().finite().nonnegative(),
    z.string().regex(/^\d+(?:\.\d+)?$/),
  ])
  .refine((value) => {
    const fraction = String(value).split(".")[1] ?? "";
    return Number(value) <= MAX_MONEY && fraction.length <= 2;
  });
const positiveId = z.number().int().positive().max(SQL_INT_MAX);
const localizedName = z.string().trim().min(1).max(191);
const optionalText = z
  .string()
  .max(10_000)
  .nullish()
  .transform((value) => value ?? null);
const localDateTime = z
  .string()
  .max(40)
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})?$/,
  )
  .refine((value) => {
    const hasZone = value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);
    return Number.isFinite(new Date(hasZone ? value : `${value}Z`).getTime());
  });

const categoriesSchema = z.array(
  z.object({
    id: positiveId,
    nameAr: localizedName,
    nameEn: localizedName,
    descriptionAr: optionalText,
    descriptionEn: optionalText,
    isActive: z.boolean(),
    isVisible: z.boolean(),
    displayOrder: z.number().int().min(-SQL_INT_MAX).max(SQL_INT_MAX),
  }),
);

// A migration on the external backend dropped the old modifier `Name` column
// without a backfill, so groups and options can come back with the properties
// omitted or blank. Accepting them as null lets the healthy part of the
// catalog sync; the affected products are quarantined as unsellable instead.
const missingName = z
  .string()
  .max(191)
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length === 0 ? null : trimmed;
  });

const optionSchema = z.object({
  id: positiveId,
  nameAr: missingName,
  nameEn: missingName,
  extraPrice: moneySchema,
});

const groupSchema = z.object({
  id: positiveId,
  nameAr: missingName,
  nameEn: missingName,
  isRequired: z.boolean(),
  maxSelections: z.number().int().nonnegative().max(SQL_INT_MAX),
  options: z.array(optionSchema),
});

const sizeSchema = z.object({
  id: positiveId,
  nameAr: localizedName,
  nameEn: localizedName,
  price: moneySchema,
  isDefault: z.boolean(),
});

const productsSchema = z.array(
  z.object({
    id: positiveId,
    nameAr: localizedName,
    nameEn: localizedName,
    descriptionAr: optionalText,
    descriptionEn: optionalText,
    price: moneySchema,
    discountPercentage: moneySchema
      .refine((value) => Number(value) <= 100)
      .nullish()
      .transform((value) => value ?? null),
    discountStart: localDateTime
      .nullish()
      .transform((value) => value ?? null),
    discountEnd: localDateTime
      .nullish()
      .transform((value) => value ?? null),
    calories: z.number().int().nonnegative().max(SQL_INT_MAX),
    pointsReward: z.number().int().nonnegative().max(SQL_INT_MAX),
    isAvailable: z.boolean(),
    isVisible: z.boolean(),
    imageUrl: z
      .string()
      .max(2048)
      .url()
      .nullish()
      .transform((value) => value ?? null),
    categoryName: localizedName,
    sizes: z.array(sizeSchema),
    modifierGroups: z.array(groupSchema),
  }),
);

const money = (value: number | string) => Number(value).toFixed(2);
const duplicated = (ids: number[]) => new Set(ids).size !== ids.length;

export type ExternalCatalog = Awaited<ReturnType<ExternalCatalogClient["load"]>>;

export class ExternalCatalogClient {
  constructor(private readonly backend: ExternalBackendClient) {}

  async load() {
    const categories = await this.backend.get(
      "/api/admin/categories",
      categoriesSchema,
    );
    const products = await this.backend.get(
      "/api/admin/products",
      productsSchema,
    );

    const sizes = products.flatMap((product) => product.sizes);
    const groups = products.flatMap((product) => product.modifierGroups);
    const options = groups.flatMap((group) => group.options);
    if (
      duplicated(categories.map((category) => category.id)) ||
      duplicated(products.map((product) => product.id)) ||
      duplicated(sizes.map((size) => size.id)) ||
      duplicated(groups.map((group) => group.id)) ||
      duplicated(options.map((option) => option.id))
    ) {
      throw new HttpError(502, "معرّفات بيانات الكتالوج الخارجي مكررة");
    }

    return {
      categories: categories.map((category) => ({
        externalId: category.id,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        descriptionAr: category.descriptionAr,
        descriptionEn: category.descriptionEn,
        isActive: category.isActive,
        isVisible: category.isVisible,
        displayOrder: category.displayOrder,
      })),
      products: products.map((product) => {
        const categoryMatches = categories.filter(
          (category) =>
            category.nameAr === product.categoryName ||
            category.nameEn === product.categoryName,
        );
        if (categoryMatches.length !== 1) {
          throw new HttpError(
            502,
            "تعذر تحديد تصنيف أحد المنتجات الخارجية",
          );
        }
        return {
          externalId: product.id,
          externalCategoryId: categoryMatches[0]!.id,
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          descriptionAr: product.descriptionAr,
          descriptionEn: product.descriptionEn,
          price: money(product.price),
          discountPercentage:
            product.discountPercentage == null
              ? null
              : money(product.discountPercentage),
          discountStart: product.discountStart,
          discountEnd: product.discountEnd,
          calories: product.calories,
          pointsReward: product.pointsReward,
          isAvailable: product.isAvailable,
          isVisible: product.isVisible,
          imageUrl: product.imageUrl,
          sizes: product.sizes.map((size) => ({
            externalId: size.id,
            nameAr: size.nameAr,
            nameEn: size.nameEn,
            price: money(size.price),
            isDefault: size.isDefault,
          })),
          modifierGroups: product.modifierGroups.map((group) => ({
            externalId: group.id,
            nameAr: group.nameAr,
            nameEn: group.nameEn,
            isRequired: group.isRequired,
            maxSelections: group.maxSelections,
            options: group.options.map((option) => ({
              externalId: option.id,
              nameAr: option.nameAr,
              nameEn: option.nameEn,
              extraPrice: money(option.extraPrice),
            })),
          })),
        };
      }),
    };
  }
}
