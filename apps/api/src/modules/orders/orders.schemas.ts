import { z } from "zod";

const money = z.coerce.number().finite().min(0).max(9_999_999_999.99).refine(
  (value) => Math.abs(Number(value.toFixed(2)) - value) <= 1e-9,
);
const discount = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("percent"),
    value: money.refine((value) => value > 0 && value <= 100),
  }),
  z.object({
    type: z.literal("fixed"),
    value: money.refine((value) => value > 0),
  }),
]);

export const orderInput = z.object({
  clientRequestId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        variantId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().positive().max(999),
      }),
    )
    .min(1)
    .max(100),
  discount: discount.nullish().transform((value) => value ?? null),
  cashReceived: money,
});

export type OrderInput = z.infer<typeof orderInput>;
export type OrderLineInput = OrderInput["lines"][number];
