import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { employees, expenseCategories } from "@cashier/db";
import request from "supertest";
import { beforeEach, describe, expect } from "vitest";
import { it } from "../support/ids.js";
import { db } from "../support/api-setup.js";
import {
  batch,
  employeeNames,
  employeeRow,
  ingest,
  linkDevice,
  onlineApp,
  refreshCheckpoint,
} from "../support/online-ingest-fixtures.js";

beforeEach(refreshCheckpoint);

describe("online ingest backup lifecycle", () => {
  it("publishes restored identities atomically even when a natural key is reused", async () => {
    const { branchId, token } = await linkDevice("Restore identity swap");
    const oldId = randomUUID(),
      restoredId = randomUUID();
    const category = (id: string) => ({
      id,
      branch_id: branchId,
      name: "Daily",
      is_active: 1,
      created_at: "2026-10-09 12:34:56",
    });
    const entry = (id: string) => ({
      seq: 1,
      table: "expense_categories",
      op: "upsert" as const,
      pk: { id, branch_id: branchId },
      row: category(id),
    });
    await ingest(token, batch([entry(oldId)])).expect(200);
    const begin = await request(onlineApp)
      .post("/api/device/backup-generation")
      .set("Authorization", `Device ${token}`)
      .send({ requestId: randomUUID(), minimumGeneration: 0, replace: true })
      .expect(200);
    await ingest(
      token,
      batch([entry(restoredId)], { generation: begin.body.generation }),
    ).expect(200);
    expect(
      (
        await db
          .select()
          .from(expenseCategories)
          .where(eq(expenseCategories.branchId, branchId))
      ).map((row) => row.id),
    ).toEqual([oldId]);
    await request(onlineApp)
      .post("/api/device/backup-generation/complete")
      .set("Authorization", `Device ${token}`)
      .send({ generation: begin.body.generation })
      .expect(200);
    expect(
      (
        await db
          .select()
          .from(expenseCategories)
          .where(eq(expenseCategories.branchId, branchId))
      ).map((row) => row.id),
    ).toEqual([restoredId]);
  });

  it("replaces the entire branch backup only when explicitly requested", async () => {
    const { branchId, token } = await linkDevice("Explicit replacement");
    await db
      .insert(employees)
      .values({ branchId, name: "Online-only history" });
    const response = await request(onlineApp)
      .post("/api/device/backup-generation")
      .set("Authorization", `Device ${token}`)
      .send({
        requestId: randomUUID(),
        minimumGeneration: 0,
        replace: true,
        replaceAll: true,
      })
      .expect(200);
    await request(onlineApp)
      .post("/api/device/backup-generation/complete")
      .set("Authorization", `Device ${token}`)
      .send({ generation: response.body.generation })
      .expect(200);
    expect(await employeeNames(branchId)).toEqual([]);
  });

  it("preserves existing branch history on an empty replacement PC's first backup", async () => {
    const { branchId, token } = await linkDevice("Initial merge");
    const id = randomUUID();
    await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: employeeRow(branchId, id, "Existing history"),
        },
      ]),
    ).expect(200);
    const response = await request(onlineApp)
      .post("/api/device/backup-generation")
      .set("Authorization", `Device ${token}`)
      .send({ requestId: randomUUID(), minimumGeneration: 0 })
      .expect(200);
    await request(onlineApp)
      .post("/api/device/backup-generation/complete")
      .set("Authorization", `Device ${token}`)
      .send({ generation: response.body.generation })
      .expect(200);
    expect(await employeeNames(branchId)).toEqual(["Existing history"]);
  });

  it("reconciles restored device rows without erasing unowned historical rows", async () => {
    const { branchId, token } = await linkDevice("Owned restore");
    const id = randomUUID();
    await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: employeeRow(branchId, id, "This device's absent row"),
        },
      ]),
    ).expect(200);
    await db
      .insert(employees)
      .values({ branchId, name: "Earlier PC's history" });
    const response = await request(onlineApp)
      .post("/api/device/backup-generation")
      .set("Authorization", `Device ${token}`)
      .send({ requestId: randomUUID(), minimumGeneration: 0, replace: true })
      .expect(200);
    await request(onlineApp)
      .post("/api/device/backup-generation/complete")
      .set("Authorization", `Device ${token}`)
      .send({ generation: response.body.generation })
      .expect(200);
    expect(await employeeNames(branchId)).toEqual(["Earlier PC's history"]);
  });

  it("removes every absent device row past one delete batch and keeps unowned history", async () => {
    const { branchId, token } = await linkDevice("Many owned rows");
    const rows = Array.from({ length: 600 }, (_, index) => {
      const id = randomUUID();
      return {
        seq: index + 1,
        table: "employees",
        op: "upsert" as const,
        pk: { id, branch_id: branchId },
        row: employeeRow(branchId, id, `Owned ${index}`),
      };
    });
    await ingest(token, batch(rows.slice(0, 300))).expect(200);
    await ingest(token, batch(rows.slice(300))).expect(200);
    await db
      .insert(employees)
      .values({ branchId, name: "Earlier PC's history" });
    const response = await request(onlineApp)
      .post("/api/device/backup-generation")
      .set("Authorization", `Device ${token}`)
      .send({ requestId: randomUUID(), minimumGeneration: 0, replace: true })
      .expect(200);
    await request(onlineApp)
      .post("/api/device/backup-generation/complete")
      .set("Authorization", `Device ${token}`)
      .send({ generation: response.body.generation })
      .expect(200);
    expect(await employeeNames(branchId)).toEqual(["Earlier PC's history"]);
  });

  it("allocates a generation idempotently and safely reuses restored sequences", async () => {
    const { branchId, token } = await linkDevice("Restore generation");
    const original = randomUUID(),
      restored = randomUUID();
    await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id: original, branch_id: branchId },
          row: employeeRow(branchId, original, "Before restore"),
        },
      ]),
    ).expect(200);
    const requestId = randomUUID();
    const begin = () =>
      request(onlineApp)
        .post("/api/device/backup-generation")
        .set("Authorization", `Device ${token}`)
        .send({ requestId, minimumGeneration: 0, replace: true });
    const first = await begin().expect(200);
    expect(first.body.generation).toBeGreaterThan(0);
    expect((await begin().expect(200)).body).toEqual(first.body);
    const generation = first.body.generation;
    await ingest(
      token,
      batch(
        [
          {
            seq: 1,
            table: "employees",
            op: "upsert",
            pk: { id: restored, branch_id: branchId },
            row: employeeRow(branchId, restored, "After restore"),
          },
        ],
        { generation },
      ),
    ).expect(200);
    await ingest(
      token,
      batch([
        {
          seq: 100,
          table: "employees",
          op: "upsert",
          pk: { id: original, branch_id: branchId },
          row: employeeRow(branchId, original, "Stale generation"),
        },
      ]),
    ).expect(409);
    await request(onlineApp)
      .post("/api/device/backup-generation/complete")
      .set("Authorization", `Device ${token}`)
      .send({ generation })
      .expect(200);
    expect(await employeeNames(branchId)).toEqual(["After restore"]);
  });
});
