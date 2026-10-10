import { Router, type NextFunction, type Request, type Response } from "express";
import { HttpError } from "@cashier/server-core";
import type { Db } from "@cashier/db";
import { readSyncStatus } from "../../desktop/upload.js";

/**
 * The backup card on the PC (plan 7.6): admins see when the last upload
 * succeeded, how much is still waiting, and can start one now. A failure is
 * reported plainly; nothing here can block selling.
 */
export function createSyncModule(
  db: Db,
  upload: () => Promise<{ uploaded: number; pending: number }>,
) {
  const router = Router();

  router.get("/status", async (_req, res) => {
    const status = await readSyncStatus(db);
    res.json({
      lastSuccessAt: status.lastSuccessAt?.toISOString() ?? null,
      lastAttemptAt: status.lastAttemptAt?.toISOString() ?? null,
      lastError: status.lastError,
      pending: status.pending,
    });
  });

  router.post("/upload-now", async (_req, res, next: NextFunction) => {
    try {
      res.json(await upload());
    } catch (error) {
      // 503: the button did not do what it promised, and nothing was lost.
      next(
        new HttpError(
          503,
          error instanceof Error
            ? error.message
            : "تعذر رفع النسخة الاحتياطية. لم يُفقد أي بيانات.",
        ),
      );
    }
  });

  return router;
}

/** The admin's recovery tool: queue everything again (plan 10.4). */
export function createResendModule(
  resend: () => Promise<{ queued: number }>,
  upload: () => Promise<{ uploaded: number; pending: number }>,
) {
  const router = Router();
  router.post("/resend-all", async (_req, res, next: NextFunction) => {
    try {
      const { queued } = await resend();
      // Sending starts right away; the queue may be far larger than one batch.
      const result = await upload();
      res.json({ queued, ...result });
    } catch (error) {
      next(
        new HttpError(
          503,
          error instanceof Error
            ? error.message
            : "تعذر إعادة إرسال النسخة الاحتياطية.",
        ),
      );
    }
  });
  return router;
}

export type SyncRouter = Router;
export type { Request, Response };