import { z } from "zod";

const realDate = z
  .string()
  .date()
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day));
    return date.toISOString().slice(0, 10) === value;
  }, "التاريخ غير صحيح");

export const reportRangeQuery = z
  .object({ from: realDate, to: realDate })
  .refine(({ from, to }) => from <= to, {
    message: "تاريخ البداية يجب ألا يكون بعد تاريخ النهاية",
    path: ["to"],
  });

export type ReportRange = z.infer<typeof reportRangeQuery>;
