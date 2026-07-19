import { z } from "zod";
import { ITEM_TYPES } from "@cashier/shared";

const MAX_QUANTITY = 99_999_999_999.999;
const MAX_CONVERSION_FACTOR = 99_999_999.999999;
const hasDecimalPlaces = (places: number) => (value: number) =>
  Math.abs(value * 10 ** places - Math.round(value * 10 ** places)) < 1e-6;

const quantity = z.coerce
  .number()
  .finite()
  .min(0)
  .max(MAX_QUANTITY)
  .refine(hasDecimalPlaces(3), {
    message: "الكمية تقبل ثلاث خانات عشرية كحد أقصى",
  });

const conversionFactor = z.coerce
  .number()
  .finite()
  .positive()
  .max(MAX_CONVERSION_FACTOR)
  .refine(hasDecimalPlaces(6), {
    message: "معامل التحويل يقبل ست خانات عشرية كحد أقصى",
  });

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().min(1).max(maximum).nullish(),
  );

const itemFields = z.object({
  name: z.string().trim().min(1).max(191),
  categoryId: z.coerce.number().int().positive(),
  type: z.enum(ITEM_TYPES),
  stockUnit: z.string().trim().min(1).max(50),
  purchaseUnit: optionalText(50),
  purchaseToStockFactor: conversionFactor.nullish(),
  mainMinimumLevel: quantity.default(0),
  cafeMinimumLevel: quantity.default(0),
});

export function hasValidPurchaseUnitConfiguration(data: {
  purchaseUnit?: string | null;
  purchaseToStockFactor?: number | null;
}) {
  return Boolean(data.purchaseUnit) === (data.purchaseToStockFactor != null);
}

export const itemInput = itemFields.refine(hasValidPurchaseUnitConfiguration, {
  message: "وحدة الشراء ومعامل التحويل مطلوبان معاً",
  path: ["purchaseUnit"],
});

export const itemUpdateInput = itemFields
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "لا توجد بيانات للتعديل",
  });

export type ItemInput = z.infer<typeof itemInput>;
export type ItemUpdateInput = z.infer<typeof itemUpdateInput>;
