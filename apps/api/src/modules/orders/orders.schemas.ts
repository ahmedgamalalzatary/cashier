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

const externalProductLine = z
  .object({
    type: z.literal("external_product"),
    externalProductId: z.coerce.number().int().positive(),
    externalSizeId: z.coerce.number().int().positive().nullable(),
    quantity: z.coerce.number().int().positive().max(999),
    modifiers: z
      .array(
        z.object({
          externalModifierOptionId: z.coerce.number().int().positive(),
          quantity: z.coerce.number().int().positive().max(20),
        }),
      )
      .max(100),
  })
  .strict()
  .refine(
    (line) =>
      new Set(
        line.modifiers.map((modifier) => modifier.externalModifierOptionId),
      ).size === line.modifiers.length,
    { message: "لا يمكن تكرار الإضافة في نفس بند الطلب", path: ["modifiers"] },
  );

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
  lines: z.array(externalProductLine).min(1).max(100),
  discount: discount.nullish().transform((value) => value ?? null),
  cashReceived: money,
});

export type OrderInput = z.infer<typeof orderInput>;
export type OrderLineInput = OrderInput["lines"][number];
