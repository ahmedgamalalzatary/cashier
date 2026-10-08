import { it, testId, TEST_BRANCH_ID } from "../support/ids.js";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { branches, branchValues, orders, users, withBranch } from "@cashier/db";
import { signToken } from "../../../../packages/server-core/src/middleware/auth.js";
import { createApp } from "../../../../apps/online-api/src/app.js";
import { appOptions, db } from "../support/api-setup.js";
import { createUser } from "../support/api-helpers.js";

const OTHER_BRANCH_ID = testId(900);
const app = createApp(db, {
  ...appOptions,
  corsOrigins: ["https://cashier.biscofa.tech"],
});

async function addBranch(id: string, name: string) {
  await db.insert(branches).values({ id, name });
}

async function signIn(credentials: { username: string; password: string }) {
  return request(app).post("/api/auth/login").send({ role: "admin", ...credentials });
}

async function addSale(branchId: string, total: string, at: string) {
  const [admin] = await db.select().from(users).where(eq(users.role, "admin"));
  await withBranch(branchId, () =>
    db.insert(orders).values(branchValues({
      orderNumber: randomUUID().slice(0, 12),
      clientRequestId: randomUUID(),
      requestFingerprint: "online-fixture",
      cashierId: admin.id,
      subtotal: total,
      total,
      cashReceived: total,
      changeAmount: "0.00",
      createdAt: new Date(at),
    })),
  );
}

async function signInAndRead(credentials: { username: string; password: string }) {
  const login = await signIn(credentials);
  expect(login.status).toBe(200);
  return {
    Authorization: `Bearer ${login.body.token}`,
  };
}

describe("online branch scoping", () => {
  it("lets a super-admin read the reports of any branch", async () => {
    await addBranch(OTHER_BRANCH_ID, "Other branch");
    const auth = await signInAndRead(
      await createUser("admin", "super", { isSuperAdmin: true }),
    );
    await addSale(OTHER_BRANCH_ID, "250.00", "2026-09-11T08:00:00Z");

    const other = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(auth)
      .set("X-Branch-Id", OTHER_BRANCH_ID);

    expect(other.status).toBe(200);
    expect(Number(other.body.sales.byDay[0].sales)).toBe(250);
  });

  it("refuses an admin a branch it is not assigned to", async () => {
    await addBranch(OTHER_BRANCH_ID, "Other branch");
    const auth = await signInAndRead(await createUser("admin", "assigned"));
    await addSale(OTHER_BRANCH_ID, "250.00", "2026-09-11T08:00:00Z");
    await addSale(TEST_BRANCH_ID, "75.00", "2026-09-11T08:00:00Z");

    const own = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(auth)
      .set("X-Branch-Id", TEST_BRANCH_ID);
    const forbidden = await request(app)
      .get("/api/reports?from=2026-09-11&to=2026-09-11")
      .set(auth)
      .set("X-Branch-Id", OTHER_BRANCH_ID);

    expect(Number(own.body.sales.byDay[0].sales)).toBe(75);
    expect(forbidden.status).toBe(403);
  });

  it("offers a super-admin every branch and an admin only its own", async () => {
    await addBranch(OTHER_BRANCH_ID, "Other branch");
    const superAuth = await signInAndRead(
      await createUser("admin", "super", { isSuperAdmin: true }),
    );
    const adminAuth = await signInAndRead(await createUser("admin", "assigned"));

    const forSuper = await request(app).get("/api/branches").set(superAuth);
    const forAdmin = await request(app).get("/api/branches").set(adminAuth);

    expect(forSuper.status).toBe(200);
    expect(forSuper.body.map((row: { id: string }) => row.id)).toEqual([
      TEST_BRANCH_ID,
      OTHER_BRANCH_ID,
    ]);
    expect(forAdmin.body.map((row: { id: string }) => row.id)).toEqual([
      TEST_BRANCH_ID,
    ]);
  });
});

describe("online cashiers have no access", () => {
  it("refuses a cashier login", async () => {
    const credentials = await createUser("cashier", "cashier");

    const login = await request(app)
      .post("/api/auth/login")
      .send({ role: "cashier", ...credentials });

    expect(login.status).toBe(401);
    expect(login.body).not.toHaveProperty("token");
  });

  it("refuses a cashier session that was issued elsewhere", async () => {
    const credentials = await createUser("cashier", "cashier");
    const [cashier] = await db
      .select()
      .from(users)
      .where(eq(users.username, credentials.username));
    const token = signToken(
      {
        id: cashier.id,
        name: cashier.name,
        role: "cashier",
        branchId: TEST_BRANCH_ID,
        isSuperAdmin: false,
      },
      cashier.tokenVersion,
      appOptions.jwtSecret!,
    );

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(me.status).toBe(401);
  });
});