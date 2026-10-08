import type { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { adminBranches, branches } from "@cashier/db";
import { withBranch } from "@cashier/db";
import { HttpError } from "./error.js";
import { idParam } from "./validation.js";

export function selectBranch(db: Db, localBranchId?: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, "يجب تسجيل الدخول");
    const header = req.get("X-Branch-Id");
    if (header !== undefined && !idParam.safeParse(header).success) {
      throw new HttpError(400, "الفرع المحدد غير صحيح");
    }
    const branchId = localBranchId ?? header ?? req.user.branchId;
    if (!branchId) throw new HttpError(400, "الفرع المحدد غير صحيح");
    if (localBranchId && header !== undefined && header !== localBranchId)
      throw new HttpError(403, "لا يمكنك الوصول إلى فرع آخر من هذا الجهاز");
    if (req.user.role === "cashier" && branchId !== req.user.branchId) {
      throw new HttpError(403, "لا يمكنك الوصول إلى فرع آخر");
    }
    if (req.user.role === "admin" && !req.user.isSuperAdmin) {
      const [assignment] = await db
        .select()
        .from(adminBranches)
        .where(
          and(
            eq(adminBranches.adminUserId, req.user.id),
            eq(adminBranches.branchId, branchId),
          ),
        )
        .limit(1);
      if (!assignment)
        throw new HttpError(403, "هذا الحساب غير معيّن لهذا الفرع");
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
