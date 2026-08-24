import { z } from "zod";

const hasDecimalPlaces = (places: number) => (value: number) =>
  Math.abs(Number(value.toFixed(places)) - value) <= 1e-9;

const money = z.coerce
  .number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .refine(hasDecimalPlaces(2), {
    message: "المبلغ يقبل خانتين عشريتين كحد أقصى",
  });

const stockQuantity = z.coerce
  .number()
  .finite()
  .positive()
  .max(99_999_999_999.999)
  .refine(hasDecimalPlaces(3), {
    message: "الكمية تقبل ثلاث خانات عشرية كحد أقصى",
  });

const recipeLine = z.object({
  type: z.literal("recipe"),
  recipeSizeId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive().max(999),
});

const itemLine = z.object({
  type: z.literal("item"),
  itemId: z.coerce.number().int().positive(),
  quantity: stockQuantity,
});

const discount = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("percent"),
    value: money.refine((value) => value > 0 && value <= 100, {
      message: "نسبة الخصم يجب أن تكون أكبر من صفر ولا تتجاوز 100",
    }),
  }),
  z.object({
    type: z.literal("fixed"),
    value: money.refine((value) => value > 0, {
      message: "قيمة الخصم يجب أن تكون أكبر من صفر",
    }),
  }),
]);

export const orderInput = z.object({
  clientRequestId: z.string().uuid(),
  lines: z
    .array(z.discriminatedUnion("type", [recipeLine, itemLine]))
    .min(1)
    .max(100),
  discount: discount.nullish().transform((value) => value ?? null),
  cashReceived: money,
});

export type OrderInput = z.infer<typeof orderInput>;
export type OrderLineInput = OrderInput["lines"][number];
