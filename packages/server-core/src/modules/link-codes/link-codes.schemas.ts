import { z } from "zod";

export const linkCodeInput = z.object({
  branchId: z.string().uuid(),
});
