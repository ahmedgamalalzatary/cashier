import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect } from "vitest";
import { it } from "../support/ids.js";
import { db } from "../support/api-setup.js";
import {
  batch,
  deviceIdFor,
  employeeNames,
  employeeRow,
  ingest,
  lastUploadAt,
  linkDevice,
  linkDeviceFor,
  outboxRows,
  refreshCheckpoint,
  syncIngestRows,
  type IngestRow,
} from "../support/online-ingest-fixtures.js";

beforeEach(refreshCheckpoint);

describe("online ingest uploads", () => {
  it("applies an uploaded row and acknowledges its exact sequence", async () => {
    const { branchId, token } = await linkDevice("فرع الرفع");
    const id = randomUUID();

    const response = await ingest(
      token,
      batch([
        {
          seq: 42,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: employeeRow(branchId, id, "أحمد"),
        },
      ]),
    ).expect(200);

    expect(response.body).toEqual({ generation: 0, acknowledgedSeqs: [42] });
    expect(await employeeNames(branchId)).toEqual(["أحمد"]);
  });

  it("keeps a repeated batch harmless", async () => {
    const { branchId, token } = await linkDevice("فرع التكرار");
    const id = randomUUID();
    const row = {
      seq: 7,
      table: "employees",
      op: "upsert",
      pk: { id, branch_id: branchId },
      row: employeeRow(branchId, id, "Repeated"),
    } satisfies IngestRow;

    const first = await ingest(token, batch([row])).expect(200);
    const second = await ingest(token, batch([row])).expect(200);

    expect(second.body).toEqual(first.body);
    expect(await employeeNames(branchId)).toEqual(["Repeated"]);
  });

  it("applies a late lower sequence that arrives after a newer one", async () => {
    const { branchId, token } = await linkDevice("فرع تسلسل متأخر");
    const first = randomUUID();
    const late = randomUUID();

    await ingest(
      token,
      batch([
        {
          seq: 100,
          table: "employees",
          op: "upsert",
          pk: { id: first, branch_id: branchId },
          row: employeeRow(branchId, first, "First"),
        },
      ]),
    ).expect(200);
    const response = await ingest(
      token,
      batch([
        {
          seq: 9,
          table: "employees",
          op: "upsert",
          pk: { id: late, branch_id: branchId },
          row: employeeRow(branchId, late, "Late"),
        },
      ]),
    ).expect(200);

    expect(response.body.acknowledgedSeqs).toEqual([9]);
    expect(await employeeNames(branchId)).toEqual(["First", "Late"]);
  });

  it("does not let a stale retry overwrite a newer version of the same row", async () => {
    const { branchId, token } = await linkDevice("فرع إعادة إرسال قديمة");
    const id = randomUUID();

    await ingest(
      token,
      batch([
        {
          seq: 50,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: employeeRow(branchId, id, "Newest"),
        },
      ]),
    ).expect(200);
    const response = await ingest(
      token,
      batch([
        {
          seq: 20,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: employeeRow(branchId, id, "Older"),
        },
      ]),
    ).expect(200);

    expect(response.body.acknowledgedSeqs).toEqual([20]);
    expect(await employeeNames(branchId)).toEqual(["Newest"]);
  });

  it("does not let a stale upsert bring back a deleted row", async () => {
    const { branchId, token } = await linkDevice("فرع حذف ثم إعادة إرسال");
    const id = randomUUID();
    const upsert = (seq: number, name: string): IngestRow => ({
      seq,
      table: "employees",
      op: "upsert",
      pk: { id, branch_id: branchId },
      row: employeeRow(branchId, id, name),
    });

    await ingest(token, batch([upsert(30, "Present")])).expect(200);
    await ingest(
      token,
      batch([
        {
          seq: 40,
          table: "employees",
          op: "delete",
          pk: { id, branch_id: branchId },
        },
      ]),
    ).expect(200);
    await ingest(token, batch([upsert(25, "Back from the past")])).expect(200);

    expect(await employeeNames(branchId)).toEqual([]);
  });

  it("deletes the uploaded row", async () => {
    const { branchId, token } = await linkDevice("فرع حذف");
    const id = randomUUID();

    await ingest(
      token,
      batch([
        {
          seq: 3,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: employeeRow(branchId, id, "Removed later"),
        },
      ]),
    ).expect(200);
    await ingest(
      token,
      batch([
        {
          seq: 4,
          table: "employees",
          op: "delete",
          pk: { id, branch_id: branchId },
        },
      ]),
    ).expect(200);

    expect(await employeeNames(branchId)).toEqual([]);
  });

  it("writes nothing into the online outbox", async () => {
    const { branchId, token } = await linkDevice("فرع بلا صدى");
    const id = randomUUID();

    await ingest(
      token,
      batch([
        {
          seq: 11,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: employeeRow(branchId, id, "No echo"),
        },
        {
          seq: 12,
          table: "employees",
          op: "delete",
          pk: { id, branch_id: branchId },
        },
      ]),
    ).expect(200);

    expect(await outboxRows()).toEqual([]);
  });

  it("records when the PC last uploaded", async () => {
    const { branchId, token } = await linkDevice("فرع وقت الرفع");

    expect(await lastUploadAt(branchId)).toBeNull();
    await ingest(token, batch([])).expect(200);

    expect(await lastUploadAt(branchId)).not.toBeNull();
  });

  it("allows ordinary values shared by two branches", async () => {
    const a = await linkDevice("Shared values A");
    const b = await linkDevice("Shared values B");
    for (const device of [a, b]) {
      const id = randomUUID();
      await ingest(
        device.token,
        batch([
          {
            seq: 1,
            table: "employees",
            op: "upsert",
            pk: { id, branch_id: device.branchId },
            row: employeeRow(device.branchId, id, "Same name"),
          },
        ]),
      ).expect(200);
    }
    expect(await employeeNames(a.branchId)).toEqual(["Same name"]);
    expect(await employeeNames(b.branchId)).toEqual(["Same name"]);
  });

  it("checks globally unique IDs even when every other field differs", async () => {
    const a = await linkDevice("Distinct A"),
      b = await linkDevice("Distinct B");
    const id = randomUUID();
    await ingest(
      a.token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: a.branchId },
          row: employeeRow(a.branchId, id, "Original"),
        },
      ]),
    ).expect(200);
    const row = {
      ...employeeRow(b.branchId, id, "Foreign"),
      is_active: 0,
      created_at: "2026-10-10 13:00:00",
    };
    await ingest(
      b.token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: b.branchId },
          row,
        },
      ]),
    ).expect(422);
    expect(await employeeNames(a.branchId)).toEqual(["Original"]);
  });

  it("does not let a slow older upload overwrite a newer one", async () => {
    const { branchId, token } = await linkDevice("تعارض متزامن");
    const id = randomUUID();

    // Two uploads of the same row racing each other, the older one started
    // first: only the newer value may survive.
    const slow = ingest(
      token,
      batch([
        {
          seq: 20,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: employeeRow(branchId, id, "قديم"),
        },
      ]),
    );
    const fast = ingest(
      token,
      batch([
        {
          seq: 30,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: employeeRow(branchId, id, "جديد"),
        },
      ]),
    );
    const results = await Promise.all([slow, fast]);

    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(await employeeNames(branchId)).toEqual(["جديد"]);
    const [version] = await db
      .select({ lastSeq: syncIngestRows.lastSeq })
      .from(syncIngestRows)
      .where(eq(syncIngestRows.deviceId, await deviceIdFor(branchId)));
    expect(version?.lastSeq).toBe(30);
  });

  it("can re-link a PC that has already uploaded", async () => {
    const { branchId, token } = await linkDevice("إعادة ربط بعد رفع");
    const id = randomUUID();

    await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: employeeRow(branchId, id, "قبل الربط"),
        },
      ]),
    ).expect(200);

    // Replacing the PC deletes the old device; its dedup rows must go with it.
    const relinked = await linkDeviceFor(branchId);
    expect(relinked.status).toBe(201);

    // The replacement starts a clean namespace and can send sequence 1 again.
    await ingest(
      relinked.body.deviceToken as string,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: employeeRow(branchId, id, "بعد الربط"),
        },
      ]),
    ).expect(200);

    expect(await employeeNames(branchId)).toEqual(["بعد الربط"]);
  });
});
