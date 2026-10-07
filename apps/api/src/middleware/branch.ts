import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { branches } from "@cashier/db";
import { withBranch } from "@cashier/db";
import { HttpError } from "./error.js";

export function selectBranch(db: Db) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, "يجب تسجيل الدخول");
    const header = req.get("X-Branch-Id");
    if (header !== undefined && !/^[1-9]\d*$/.test(header)) {
      throw new HttpError(400, "الفرع المحدد غير صحيح");
    }
    const branchId =
      header === undefined ? (req.user.branchId ?? 1) : Number(header);
    if (!Number.isSafeInteger(branchId))
      throw new HttpError(400, "الفرع المحدد غير صحيح");
    if (req.user.role === "cashier" && branchId !== req.user.branchId) {
      throw new HttpError(403, "لا يمكنك الوصول إلى فرع آخر");
    }
    const [branch] = await db
      .select()
      .from(branches)
      .where(eq(branches.id, branchId));
    if (!branch) throw new HttpError(404, "الفرع غير موجود");
    if (
      !branch.isActive &&
      (req.user.role === "cashier" || req.method !== "GET")
    ) {
      throw new HttpError(409, "الفرع مؤرشف؛ أعد تفعيله قبل تسجيل أي حركة");
    }
    withBranch(branchId, next, req.method !== "GET");
  };
}
