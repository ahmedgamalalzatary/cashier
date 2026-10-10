import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { Db } from "@cashier/db";

vi.mock("../../src/desktop/resend.js", () => ({
  captureEverything: async () => 5,
}));
vi.mock("../../src/desktop/upload.js", async (original) => ({
  ...(await original<typeof import("../../src/desktop/upload.js")>()),
  uploadPending: async () => ({ uploaded: 5, pending: 0 }),
}));

import { createBackupClient } from "../../src/desktop/backup-client.js";

const token = "device-token";
const deviceHash = createHash("sha256").update(token).digest("hex");
const directories: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) {
    if (!directory.startsWith(path.join(os.tmpdir(), "cashier-backup-client-")))
      throw new Error("Unexpected test directory");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

/** A PC whose last backup finished and whose database still agrees with it. */
function setup(saved: Record<string, unknown>) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cashier-backup-client-"),
  );
  directories.push(directory);
  fs.writeFileSync(
    path.join(directory, "backup-generation.json"),
    JSON.stringify({ deviceHash, ...saved }),
  );
  const state = {
    id: 1,
    backupGeneration: 3,
    lastUploadedSeq: 40,
    bootstrappedAt: new Date(),
  };
  const clearedQueue = vi.fn();
  const resolved = <T>(value: T) => Promise.resolve(value);
  const db = {
    select: () => ({ from: () => ({ where: () => resolved([state]) }) }),
    update: () => ({ set: () => ({ where: () => resolved(undefined) }) }),
    insert: () => ({
      values: () => ({ onDuplicateKeyUpdate: () => resolved(undefined) }),
    }),
    transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        select: () => ({ from: () => ({ for: () => resolved([]) }) }),
        delete: () => {
          clearedQueue();
          return resolved(undefined);
        },
        insert: () => ({
          values: () => ({ onDuplicateKeyUpdate: () => resolved(undefined) }),
        }),
      }),
  } as unknown as Db;
  const requests: Array<{ endpoint: string; body: Record<string, unknown> }> =
    [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const endpoint = url.split("/device/")[1];
      requests.push({ endpoint, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ generation: 4 }), { status: 200 });
    }),
  );
  const client = createBackupClient(
    db,
    directory,
    {
      apiUrl: "http://online/api",
      deviceToken: token,
      appVersion: "test",
      migrationCheckpoint: 100,
    },
    () => {},
  );
  const record = () =>
    JSON.parse(
      fs.readFileSync(path.join(directory, "backup-generation.json"), "utf8"),
    ) as Record<string, unknown>;
  return { client, requests, clearedQueue, record };
}

const finished = { generation: 3, acknowledgedSeq: 40, phase: "ready" };

it("starts a fresh replacement backup after the database was restored", async () => {
  const { client, requests, clearedQueue, record } = setup({
    ...finished,
    requiresReset: true,
  });

  await client.uploadNow();

  expect(requests[0]).toMatchObject({
    endpoint: "backup-generation",
    body: { minimumGeneration: 3, replace: true, replaceAll: false },
  });
  expect(clearedQueue).toHaveBeenCalledOnce();
  expect(requests.at(-1)).toEqual({
    endpoint: "backup-generation/complete",
    body: { generation: 4 },
  });
  expect(record()).toMatchObject({ generation: 4, phase: "ready" });
  expect(record()).not.toHaveProperty("requiresReset");
});

it("keeps the current backup when nothing was restored", async () => {
  const { client, requests, clearedQueue, record } = setup(finished);

  await client.uploadNow();

  expect(requests).toEqual([]);
  expect(clearedQueue).not.toHaveBeenCalled();
  expect(record()).toMatchObject(finished);
});
