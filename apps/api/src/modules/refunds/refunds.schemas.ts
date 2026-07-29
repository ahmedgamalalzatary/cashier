import { z } from "zod";

const quantity = z.coerce
  .number()
  .finite()
  .positive()
  .max(99_999_999_999.999)
  .refine((value) => Number(value.toFixed(3)) === value, {
    message: "الكمية تقبل ثلاث خانات عشرية كحد أقصى",
  });

const refundLineInput = z.object({
  orderLineId: z.coerce.number().int().positive(),
  quantity,
  stockAction: z
    .enum(["return_to_stock", "not_returnable"])
    .nullish()
    .transform((value) => value ?? null),
});

export const refundInput = z
  .object({
    clientRequestId: z.string().uuid(),
    orderId: z.coerce.number().int().positive(),
    reason: z.string().trim().min(2).max(500),
    lines: z.array(refundLineInput).min(1).max(100),
  })
  .superRefine((value, context) => {
    const seen = new Set<number>();
    value.lines.forEach((line, index) => {
      if (seen.has(line.orderLineId)) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "orderLineId"],
          message: "لا يمكن تكرار بند الطلب",
        });
      }
      seen.add(line.orderLineId);
    });
  });

export type RefundInput = z.infer<typeof refundInput>;
