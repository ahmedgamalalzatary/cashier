import { eq } from "drizzle-orm";
import { branches, linkCodes } from "@cashier/db";
import { createHash } from "node:crypto";
import request from "supertest";
import { describe, expect } from "vitest";
import { it } from "../support/ids.js";
import { createApp } from "../../../../apps/online-api/src/app.js";

// The stored hash is what the PC will look up in Phase 9, so the test proves the
// value on disk matches SHA-256 of the code that was handed out.
const hashCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");
import { db } from "../support/api-setup.js";
import { createUser } from "../support/api-helpers.js";

const onlineApp = createApp(db, {
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: ["https://cashier.biscofa.tech"],
});

type OnlineAuth = { Authorization: string };

async function loginAsAdmin(
  username: string,
  options: { isSuperAdmin?: boolean },
): Promise<OnlineAuth> {
  const creds = await createUser("admin", username, options);
  const res = await request(onlineApp).post("/api/auth/login").send(creds);
  return { Authorization: `Bearer ${res.body.token}` };
}

async function createBranch(name: string) {
  const [branch] = await db.insert(branches).values({ name }).$returningId();
  return branch.id;
}

const rowForHash = (codeHash: string) =>
  db
    .select()
    .from(linkCodes)
    .where(eq(linkCodes.codeHash, codeHash))
    .then((rows) => rows[0]);

describe("online link codes", () => {
  it("stores only the hash of the code it just handed out", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const branch = await createBranch("فرع الكود");

    const response = await request(onlineApp)
      .post("/api/link-codes")
      .set(owner)
      .send({ branchId: branch })
      .expect(201);

    const row = await rowForHash(hashCode(response.body.code));

    expect(row.branchId).toBe(branch);
    expect(row.usedAt).toBeNull();
    expect(JSON.stringify(row)).not.toContain(response.body.code);
  });

  it("expires a stored code 24 hours out", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const branch = await createBranch("فرع الصلاحية");

    const response = await request(onlineApp)
      .post("/api/link-codes")
      .set(owner)
      .send({ branchId: branch })
      .expect(201);

    const row = await rowForHash(hashCode(response.body.code));
    const ttl = row.expiresAt.getTime() - Date.now();

    expect(ttl).toBeGreaterThan(24 * 60 * 60 * 1000 - 60_000);
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("gives a different code every time it is asked", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const branch = await createBranch("فرع التكرار");

    const first = await request(onlineApp)
      .post("/api/link-codes")
      .set(owner)
      .send({ branchId: branch })
      .expect(201);
    const second = await request(onlineApp)
      .post("/api/link-codes")
      .set(owner)
      .send({ branchId: branch })
      .expect(201);

    expect(second.body.code).not.toBe(first.body.code);
  });

  it("never hands out a code containing a look-alike character", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const branch = await createBranch("فرع الوضوح");

    const response = await request(onlineApp)
      .post("/api/link-codes")
      .set(owner)
      .send({ branchId: branch })
      .expect(201);

    expect(response.body.code).toMatch(
      /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/,
    );
  });

  it("refuses to mint a code for a branch that does not exist", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });

    await request(onlineApp)
      .post("/api/link-codes")
      .set(owner)
      .send({ branchId: "019a0000-0000-7000-8000-000000000099" })
      .expect(404);
  });

  it("refuses to mint a code for an archived branch", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const [branch] = await db
      .insert(branches)
      .values({ name: "فرع مؤرشف", isActive: false })
      .$returningId();

    await request(onlineApp)
      .post("/api/link-codes")
      .set(owner)
      .send({ branchId: branch.id })
      .expect(404);
  });

  it("cancels the branch's unused code when a new one is made", async () => {
    const owner = await loginAsAdmin("owner", { isSuperAdmin: true });
    const branch = await createBranch("فرع الكود الجديد");
    const other = await createBranch("فرع آخر");
    const mint = (branchId: string) =>
      request(onlineApp)
        .post("/api/link-codes")
        .set(owner)
        .send({ branchId })
        .expect(201)
        .then((response) => response.body.code as string);
    const otherCode = await mint(other);
    const first = await mint(branch);

    const second = await mint(branch);

    expect(await rowForHash(hashCode(first))).toBeUndefined();
    expect(await rowForHash(hashCode(second))).toBeDefined();
    // another branch's code is untouched
    expect(await rowForHash(hashCode(otherCode))).toBeDefined();
  });

  it("refuses minting from an admin that is not the super-admin", async () => {
    const manager = await loginAsAdmin("manager", { isSuperAdmin: false });
    const branch = await createBranch("فرع المدير");

    await request(onlineApp)
      .post("/api/link-codes")
      .set(manager)
      .send({ branchId: branch })
      .expect(403);
  });
});
