import { it, testId } from "../support/ids.js";
import request from "supertest";
import { describe, expect } from "vitest";
import { createApp } from "../../../../apps/api/src/app.js";
import { appOptions, db } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";

const app = createApp(db, appOptions);

describe("branch workspaces", () => {
  it("retains the existing workspace as Main Branch", async () => {
    const auth = await loginAs(app, "admin");
    const response = await request(app).get("/api/branches").set(auth);
    expect(response.status).toBe(200);
    expect(response.body).toContainEqual(
      expect.objectContaining({
        id: testId(1),
        name: "الفرع الرئيسي",
        isActive: true,
      }),
    );
  });

  it("lets admins create, rename, archive, and restore a branch", async () => {
    const auth = await loginAs(app, "admin");
    const created = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "فرع المعادي" });
    expect(created.status).toBe(201);
    expect(created.body.id).toEqual(
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    );
    const id = created.body.id as string;

    const renamed = await request(app)
      .put(`/api/branches/${id}`)
      .set(auth)
      .send({ name: "فرع المعادي الجديد" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("فرع المعادي الجديد");
    await request(app).delete(`/api/branches/${id}`).set(auth).expect(200);
    const archived = await request(app).get("/api/branches").set(auth);
    expect(archived.body).toContainEqual(
      expect.objectContaining({ id, isActive: false }),
    );
    const restored = await request(app)
      .put(`/api/branches/${id}`)
      .set(auth)
      .send({ isActive: true });
    expect(restored.status).toBe(200);
    expect(restored.body.isActive).toBe(true);
  });

  it("restricts cashiers to their assigned branch and blocks branch management", async () => {
    const admin = await loginAs(app, "admin");
    const cashier = await loginAs(app, "cashier");
    const created = await request(app)
      .post("/api/branches")
      .set(admin)
      .send({ name: "فرع آخر" });
    expect(created.status).toBe(201);
    const response = await request(app).get("/api/branches").set(cashier);
    expect(response.status).toBe(200);
    expect(response.body.map((branch: { id: string }) => branch.id)).toEqual([
      testId(1),
    ]);
    await request(app)
      .post("/api/branches")
      .set(cashier)
      .send({ name: "ممنوع" })
      .expect(403);
    await request(app)
      .get("/api/orders")
      .set(cashier)
      .set("X-Branch-Id", String(created.body.id))
      .expect(403);
  });

  it("rejects invalid branch names and unknown selected branches", async () => {
    const auth = await loginAs(app, "admin");
    await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: " " })
      .expect(400);
    await request(app)
      .get("/api/orders")
      .set(auth)
      .set("X-Branch-Id", testId(999999))
      .expect(404);
    await request(app)
      .get("/api/orders")
      .set(auth)
      .set("X-Branch-Id", "invalid")
      .expect(400);
  });
});
