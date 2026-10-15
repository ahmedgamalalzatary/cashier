import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { users } from "@cashier/db";
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
  otherBranchId,
  refreshCheckpoint,
  serverCheckpoint,
  sha256,
} from "../support/online-ingest-fixtures.js";

beforeEach(refreshCheckpoint);

describe("online ingest validation", () => {
  it("rejects an unknown or obsolete schema checkpoint", async () => {
    const { token } = await linkDevice("Unknown schema");
    await ingest(token, batch([], { migrationCheckpoint: 0 })).expect(409);
  });

  it("requires a device token", async () => {
    await request(onlineApp)
      .post("/api/device/ingest")
      .send(batch([]))
      .expect(401);
  });

  it("refuses a row that belongs to another branch", async () => {
    const { token } = await linkDevice("فرع آخر");
    const id = randomUUID();

    await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: otherBranchId },
          row: employeeRow(otherBranchId, id, "Other branch"),
        },
      ]),
    ).expect(422);

    expect(await employeeNames(otherBranchId)).toEqual([]);
  });

  it("refuses a table that does not upload", async () => {
    const { branchId, token } = await linkDevice("فرع جدول غير معروف");

    await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "link_codes",
          op: "upsert",
          pk: { code_hash: sha256("x"), branch_id: branchId },
          row: {},
        },
      ]),
    ).expect(422);
  });

  it("refuses an admin account row, which never leaves the PC", async () => {
    const { branchId, token } = await linkDevice("فرع حساب مدير");
    const id = randomUUID();

    await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "users",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: {
            id,
            branch_id: branchId,
            name: "Manager",
            username: "manager",
            password_hash: "admin-hash",
            token_version: 0,
            role: "admin",
            is_active: 1,
            is_super_admin: 0,
            created_at: "2026-10-09 12:34:56",
            employee_id: null,
          },
        },
      ]),
    ).expect(422);
  });

  it("refuses a row that names a column the table does not have", async () => {
    const { branchId, token } = await linkDevice("فرع عمود غير معروف");
    const id = randomUUID();

    await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: { ...employeeRow(branchId, id, "Injected"), secret_column: "x" },
        },
      ]),
    ).expect(422);
  });

  it("applies nothing and acknowledges nothing when one row is refused", async () => {
    const { branchId, token } = await linkDevice("فرع دفعة مرفوضة");
    const good = randomUUID();
    const bad = randomUUID();

    const response = await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id: good, branch_id: branchId },
          row: employeeRow(branchId, good, "Good"),
        },
        {
          seq: 2,
          table: "employees",
          op: "upsert",
          pk: { id: bad, branch_id: otherBranchId },
          row: employeeRow(otherBranchId, bad, "Bad"),
        },
      ]),
    );

    expect(response.status).toBe(422);
    expect(await employeeNames(branchId)).toEqual([]);
  });

  it("refuses a batch from a newer schema", async () => {
    const { token } = await linkDevice("فرع إصدار أحدث");

    await ingest(
      token,
      batch([], { migrationCheckpoint: (await serverCheckpoint()) + 1 }),
    ).expect(409);
  });

  it("accepts a batch from the schema the server is on", async () => {
    const { token } = await linkDevice("فرع إصدار مطابق");

    await ingest(
      token,
      batch([], { migrationCheckpoint: await serverCheckpoint() }),
    ).expect(200);
  });

  it("refuses to move another branch's row into this branch", async () => {
    const { branchId: other, token: otherToken } =
      await linkDevice("الفرع الأصلي");
    const { branchId: mine, token: mineToken } = await linkDevice("فرعي");
    const foreign = randomUUID();

    await ingest(
      otherToken,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id: foreign, branch_id: other },
          row: employeeRow(other, foreign, "موظف الغريب"),
        },
      ]),
    ).expect(200);

    // Claiming a key that already belongs to the other branch must be refused,
    // not silently reassigned through ON DUPLICATE KEY UPDATE.
    await ingest(
      mineToken,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id: foreign, branch_id: mine },
          row: employeeRow(mine, foreign, "مُختطَف"),
        },
      ]),
    ).expect(422);

    expect(await employeeNames(other)).toEqual(["موظف الغريب"]);
    expect(await employeeNames(mine)).toEqual([]);
  });

  it("refuses a row that collides with a unique column owned elsewhere", async () => {
    const { branchId: other, token: otherToken } =
      await linkDevice("مالك الموظف");
    const { branchId: mine, token: mineToken } = await linkDevice("حساب مكرر");
    const employee = randomUUID();
    const cashier = (branchId: string, id: string, username: string) => ({
      id,
      branch_id: branchId,
      name: username,
      username,
      password_hash: "cashier-hash",
      token_version: 0,
      role: "cashier",
      is_active: 1,
      is_super_admin: 0,
      created_at: "2026-10-09 12:34:56",
      employee_id: employee,
    });
    const owned = randomUUID();
    await ingest(
      otherToken,
      batch([
        {
          seq: 1,
          table: "users",
          op: "upsert",
          pk: { id: owned, branch_id: other },
          row: cashier(other, owned, "owner"),
        },
      ]),
    ).expect(200);

    // Same key in pk and row, so only users_employee_id_uidx can catch it.
    const claimed = randomUUID();
    const response = await ingest(
      mineToken,
      batch([
        {
          seq: 1,
          table: "users",
          op: "upsert",
          pk: { id: claimed, branch_id: mine },
          row: cashier(mine, claimed, "claimer"),
        },
      ]),
    ).expect(422);

    expect(response.body.error).toBe("الصف المرفوع يتعارض مع صف يخص فرعاً آخر");
    const holders = await db
      .select({ branchId: users.branchId })
      .from(users)
      .where(eq(users.employeeId, employee));
    expect(holders).toEqual([{ branchId: other }]);
  });

  it("rejects extra keys that are not part of the row", async () => {
    const { branchId, token } = await linkDevice("مفاتيح زائدة");
    const id = randomUUID();

    await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId },
          row: { ...employeeRow(branchId, id, "سليم"), injected: "قيمة" },
        },
      ]),
    ).expect(422);

    expect(await employeeNames(branchId)).toEqual([]);
  });

  it("rejects a key that disagrees with the row it claims to identify", async () => {
    const { branchId, token } = await linkDevice("هوية مختلفة");
    const real = randomUUID();

    await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id: randomUUID(), branch_id: branchId },
          row: employeeRow(branchId, real, "متناقض"),
        },
      ]),
    ).expect(422);

    expect(await employeeNames(branchId)).toEqual([]);
  });

  it("rejects keys that are not part of the canonical key", async () => {
    const { branchId, token } = await linkDevice("مفتاح زائد");
    const id = randomUUID();

    await ingest(
      token,
      batch([
        {
          seq: 1,
          table: "employees",
          op: "upsert",
          pk: { id, branch_id: branchId, name: "مفتاح غير قياسي" },
          row: employeeRow(branchId, id, "مرفوض"),
        },
      ]),
    ).expect(422);

    expect(await employeeNames(branchId)).toEqual([]);
  });

  it("accepts a large batch that the default body limit would refuse", async () => {
    const { branchId, token } = await linkDevice("دفعة كبيرة");
    // Comfortably past Express's 100 KB default, inside the agreed 2 MB.
    const rows = Array.from({ length: 30 }, (_, index) => {
      const id = randomUUID();
      return {
        seq: index + 1,
        table: "employees",
        op: "upsert" as const,
        pk: { id, branch_id: branchId },
        row: {
          ...employeeRow(branchId, id, `كبير-${index}`),
          notes: "س".repeat(4_000),
        },
      };
    });

    const response = await ingest(token, batch(rows));
    expect(response.status, JSON.stringify(response.body)).toBe(200);

    expect((await employeeNames(branchId)).length).toBe(30);
  });

  it("refuses a batch past the 2 MB ceiling with a clear error", async () => {
    const { branchId, token } = await linkDevice("دفعة ضخمة");
    const rows = Array.from({ length: 30 }, (_, index) => ({
      seq: index + 1,
      table: "employees",
      op: "upsert" as const,
      pk: { id: randomUUID(), branch_id: branchId },
      row: {
        ...employeeRow(branchId, randomUUID(), `ضخم-${index}`),
        notes: "س".repeat(70_000),
      },
    }));

    const response = await ingest(token, batch(rows));

    expect(response.status).toBe(413);
  });
});
