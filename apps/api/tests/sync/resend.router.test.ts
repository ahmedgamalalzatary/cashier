import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Db } from "@cashier/db";
import { HttpError, requireRole } from "@cashier/server-core";
import { createSyncModule } from "../../src/modules/sync/sync.module.js";
import { createResendModule } from "../../src/modules/sync/sync.module.js";

const asRole = (role: "admin" | "cashier" | null) =>
  function fakeAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
    if (role === null) throw new HttpError(401, "Sign in first.");
    (req as express.Request & { user: { role: string } }).user = { role };
    next();
  };

const app = (
  db: Db,
  parts: {
    upload?: () => Promise<unknown>;
    resend?: () => Promise<{ queued: number }>;
  },
  role: "admin" | "cashier" | null = "admin",
) => {
  const built = express();
  built.use(express.json());
  built.use(asRole(role));
  built.use(requireRole("admin"));
  built.use(createSyncModule(db, parts.upload as never));
  built.use(createResendModule(parts.resend ?? (async () => ({ queued: 0 })), parts.upload as never));
  built.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = error instanceof HttpError ? error.status : 500;
      res
        .status(status)
        .json({ error: error instanceof Error ? error.message : "Failed." });
    },
  );
  return built;
};

function fakeDb(pending = 3) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              lastUploadedSeq: 12,
              lastSuccessAt: new Date("2026-10-09T10:00:00Z"),
              lastAttemptAt: null,
              lastError: null,
            },
          ],
        }),
      }),
    }),
    $client: { query: async () => [[{ pending }], []] },
  } as unknown as Db;
}

describe("resend everything route", () => {
  it("refuses a cashier", async () => {
    const resend = vi.fn();
    const res = await request(
      app(fakeDb(), { upload: vi.fn(), resend }, "cashier"),
    ).post("/resend-all");

    expect(res.status).toBe(403);
    expect(resend).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated request", async () => {
    const res = await request(
      app(fakeDb(), { upload: vi.fn(), resend: vi.fn() }, null),
    ).post("/resend-all");
    expect(res.status).toBe(401);
  });

  it("queues everything again and starts sending", async () => {
    const resend = vi.fn(async () => ({ queued: 500 }));
    const upload = vi.fn(async () => ({ uploaded: 500, pending: 0 }));

    const res = await request(app(fakeDb(), { upload, resend })).post(
      "/resend-all",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ queued: 500, uploaded: 500, pending: 0 });
    expect(resend).toHaveBeenCalledOnce();
  });

  it("reports a failed rebuild instead of pretending it worked", async () => {
    const resend = vi.fn(async () => {
      throw new Error("The database is busy.");
    });
    const res = await request(
      app(fakeDb(), { upload: vi.fn(), resend }),
    ).post("/resend-all");

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("busy");
  });
});