import { createHash, randomBytes } from "node:crypto";
import { branches, devices } from "@cashier/db";
import request from "supertest";
import { describe, expect } from "vitest";
import { it } from "../support/ids.js";
import { createApp } from "../../../../apps/online-api/src/app.js";
import { db } from "../support/api-setup.js";
import { createUser } from "../support/api-helpers.js";

// The super-admin's view of which desktop versions are still out in the shops.
const onlineApp = createApp(db, {
  jwtSecret: process.env.JWT_SECRET,
  corsOrigins: ["https://cashier.biscofa.tech"],
});

async function loginAsAdmin(username: string, isSuperAdmin: boolean) {
  const creds = await createUser("admin", username, { isSuperAdmin });
  const res = await request(onlineApp).post("/api/auth/login").send(creds);
  return { Authorization: `Bearer ${res.body.token}` };
}

/** A linked PC, the way /api/device/link leaves it. */
async function linkedPc(name: string) {
  const [branch] = await db.insert(branches).values({ name }).$returningId();
  const token = randomBytes(32).toString("hex");
  await db.insert(devices).values({
    branchId: branch.id,
    tokenHash: createHash("sha256").update(token).digest("hex"),
  });
  return { branchId: branch.id, token };
}

describe("desktop versions in use", () => {
  it("shows the super-admin each linked PC's version, last contact and last backup", async () => {
    const reporting = await linkedPc("فرع يحدّث");
    const silent = await linkedPc("فرع لم يتصل");
    await request(onlineApp)
      .get("/api/device/accounts")
      .set("Authorization", `Device ${reporting.token}`)
      .set("X-Cashier-Version", "0.2.5")
      .expect(200);
    const auth = await loginAsAdmin("owner", true);

    const response = await request(onlineApp)
      .get("/api/devices")
      .set(auth)
      .expect(200);

    const byBranch = new Map(
      (response.body as Array<{ branchId: string }>).map((row) => [
        row.branchId,
        row,
      ]),
    );
    expect(byBranch.get(reporting.branchId)).toEqual({
      branchId: reporting.branchId,
      appVersion: "0.2.5",
      linkedAt: expect.any(String),
      lastSeenAt: expect.any(String),
      lastUploadAt: null,
    });
    expect(byBranch.get(silent.branchId)).toEqual({
      branchId: silent.branchId,
      appVersion: null,
      linkedAt: expect.any(String),
      lastSeenAt: null,
      lastUploadAt: null,
    });
  });

  it("is for the super-admin only", async () => {
    const auth = await loginAsAdmin("branch-admin", false);

    await request(onlineApp).get("/api/devices").set(auth).expect(403);
    await request(onlineApp).get("/api/devices").expect(401);
  });
});
