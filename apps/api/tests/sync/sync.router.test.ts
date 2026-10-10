import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Db } from "@cashier/db";
import { HttpError, requireRole } from "@cashier/server-core";
import { createSyncModule } from "../../src/modules/sync/sync.module.js";

/** Stands in for authenticate on the local API; the role check is real. */
const asRole = (role: "admin" | "cashier" | null) =>
  function fakeAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
    if (role === null) throw new HttpError(401, "Sign in first.");
    (req as express.Request & { user: { role: string } }).user = { role };
    next();
  };

const app = (db: Db, upload: () => Promise<unknown>, role: "admin" | "cashier" | null) => {
  const built = express();
  built.use(express.json());
  built.use(asRole(role));
  // Both routes are admin-only (plan 7.6).
  built.use(requireRole("admin"));
  built.use(createSyncModule(db, upload));
  built.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error instanceof HttpError ? error.status : 500;
    res.status(status).json({
      error: error instanceof Error ? error.message : "Upload failed.",
    });
  });
  return built;
};

/** A database double that answers only what the sync routes read. */
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

const ok = vi.fn(async () => ({ uploaded: 2, pending: 0 }));

describe("sync status route", () => {
  it("refuses an unauthenticated request", async () => {
    const res = await request(app(fakeDb(), ok, null)).get("/status");
    expect(res.status).toBe(401);
  });

  it("tells an admin the last success and the pending count", async () => {
    const res = await request(app(fakeDb(), ok, "admin")).get("/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      lastSuccessAt: "2026-10-09T10:00:00.000Z",
      lastAttemptAt: null,
      lastError: null,
      pending: 3,
    });
  });

  it("refuses a cashier", async () => {
    const res = await request(app(fakeDb(), ok, "cashier")).get("/status");
    expect(res.status).toBe(403);
  });
});

describe("upload now route", () => {
  it("refuses a cashier", async () => {
    const upload = vi.fn();
    const res = await request(app(fakeDb(), upload, "cashier")).post("/upload-now");

    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });

  it("starts an upload for an admin", async () => {
    const upload = vi.fn(async () => ({ uploaded: 2, pending: 0 }));
    const res = await request(app(fakeDb(), upload, "admin")).post("/upload-now");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uploaded: 2, pending: 0 });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("reports a failed upload instead of pretending it worked", async () => {
    const upload = vi.fn(async () => {
      throw new Error("This PC was unlinked from the Cashier site.");
    });
    const res = await request(app(fakeDb(), upload, "admin")).post("/upload-now");

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("unlinked");
  });

  it("answers an empty queue without contacting the site", async () => {
    const upload = vi.fn(async () => ({ uploaded: 0, pending: 0 }));
    const res = await request(app(fakeDb(0), upload, "admin")).post("/upload-now");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uploaded: 0, pending: 0 });
  });
});