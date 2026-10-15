import { it, testId } from "../support/ids.js";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { describe, expect } from "vitest";
import { createApp } from "../../../../apps/api/src/app.js";
import { appOptions, db } from "../support/api-setup.js";
import { loginAs } from "../support/api-helpers.js";

const app = createApp(db, appOptions);

describe("branch data isolation", () => {
  it("isolates staff, suppliers, purchases, inventory, expenses, and reports", async () => {
    const auth = await loginAs(app, "admin");
    const category = await request(app)
      .post("/api/categories")
      .set(auth)
      .send({ name: "Main stock" })
      .expect(201);
    const supplier = await request(app)
      .post("/api/suppliers")
      .set(auth)
      .send({ name: "Main supplier" })
      .expect(201);
    const item = await request(app)
      .post("/api/items")
      .set(auth)
      .send({
        name: "Main milk",
        categoryId: category.body.id,
        type: "raw",
        stockUnit: "litre",
      })
      .expect(201);
    const employee = await request(app)
      .post("/api/employees")
      .set(auth)
      .send({ name: "Main employee", payRate: 1000 })
      .expect(201);
    const expenseCategory = await request(app)
      .post("/api/expenses/categories")
      .set(auth)
      .send({ name: "Main expense" })
      .expect(201);
    await request(app)
      .post("/api/expenses")
      .set(auth)
      .send({
        clientRequestId: randomUUID(),
        categoryId: expenseCategory.body.id,
        amount: 5,
        expenseDate: "2026-09-01",
      })
      .expect(201);
    const purchase = await request(app)
      .post("/api/purchases")
      .set(auth)
      .send({
        clientRequestId: randomUUID(),
        supplierId: supplier.body.id,
        purchasedAt: "2026-09-01",
        lines: [
          {
            itemId: item.body.id,
            quantity: 2,
            unitMode: "stock",
            unitPrice: 10,
          },
        ],
      })
      .expect(201);
    const branch = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "Empty workspace" })
      .expect(201);
    const other = { ...auth, "X-Branch-Id": String(branch.body.id) };
    for (const path of [
      "/api/categories",
      "/api/suppliers",
      "/api/items",
      "/api/employees",
      "/api/purchases",
      "/api/expenses",
      "/api/expenses/categories",
      "/api/inventory/main/stock",
    ]) {
      const response = await request(app).get(path).set(other);
      expect(response.status, path).toBe(200);
      expect(response.body, path).toEqual([]);
    }
    for (const path of [
      `/api/suppliers/${supplier.body.id}`,
      `/api/purchases/${purchase.body.id}`,
    ]) {
      await request(app).get(path).set(other).expect(404);
    }
    await request(app)
      .put(`/api/employees/${employee.body.id}`)
      .set(other)
      .send({ name: "Cross-branch edit" })
      .expect(404);
    const report = await request(app)
      .get("/api/reports?from=2026-09-01&to=2026-09-30")
      .set(other)
      .expect(200);
    expect(report.body.stock.current).toEqual([]);
    expect(report.body.money.cashFlow).toEqual([]);
    expect(report.body.employees.activity).toEqual([]);
    expect(report.body.suppliers.summary).toEqual([]);
  });

  it("allows independent item numbering and rejects another branch's references", async () => {
    const auth = await loginAs(app, "admin");
    const firstCategory = await request(app)
      .post("/api/categories")
      .set(auth)
      .send({ name: "First category" })
      .expect(201);
    await request(app)
      .post("/api/items")
      .set(auth)
      .send({
        name: "First item",
        categoryId: firstCategory.body.id,
        type: "raw",
        stockUnit: "kg",
      })
      .expect(201);
    const branch = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "Second workspace" })
      .expect(201);
    const other = { ...auth, "X-Branch-Id": String(branch.body.id) };
    const secondCategory = await request(app)
      .post("/api/categories")
      .set(other)
      .send({ name: "Second category" })
      .expect(201);
    await request(app)
      .post("/api/items")
      .set(other)
      .send({
        name: "Second item",
        categoryId: secondCategory.body.id,
        type: "raw",
        stockUnit: "kg",
      })
      .expect(201);
    const firstItems = await request(app)
      .get("/api/items")
      .set(auth)
      .expect(200);
    const secondItems = await request(app)
      .get("/api/items")
      .set(other)
      .expect(200);
    expect(
      firstItems.body.map((row: { name: string; code: number }) => [
        row.name,
        row.code,
      ]),
    ).toEqual([["First item", 1]]);
    expect(
      secondItems.body.map((row: { name: string; code: number }) => [
        row.name,
        row.code,
      ]),
    ).toEqual([["Second item", 1]]);
    await request(app)
      .post("/api/items")
      .set(other)
      .send({
        name: "Forbidden item",
        categoryId: firstCategory.body.id,
        type: "raw",
        stockUnit: "kg",
      })
      .expect(400);
  });

  it("assigns cashier access to the employee's workspace", async () => {
    const auth = await loginAs(app, "admin");
    const branch = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "Cashier workspace" })
      .expect(201);
    const other = { ...auth, "X-Branch-Id": String(branch.body.id) };
    const employee = await request(app)
      .post("/api/employees")
      .set(other)
      .send({ name: "Branch cashier" })
      .expect(201);
    await request(app)
      .post(`/api/employees/${employee.body.id}/cashier-access`)
      .set(other)
      .send({ username: "other-cashier", password: "secret123" })
      .expect(201);
    const login = await request(app)
      .post("/api/auth/login")
      .send({
        role: "cashier",
        username: "other-cashier",
        password: "secret123",
      })
      .expect(200);
    expect(login.body.user.branchId).toBe(branch.body.id);
    const cashier = { Authorization: `Bearer ${login.body.token}` };
    const visible = await request(app)
      .get("/api/branches")
      .set(cashier)
      .expect(200);
    expect(visible.body.map((row: { id: string }) => row.id)).toEqual([
      branch.body.id,
    ]);
    await request(app)
      .get("/api/orders")
      .set(cashier)
      .set("X-Branch-Id", testId(1))
      .expect(403);
    const mainUsers = await request(app)
      .get("/api/users")
      .set(auth)
      .expect(200);
    expect(
      mainUsers.body.some(
        (row: { username: string }) => row.username === "other-cashier",
      ),
    ).toBe(false);
    const branchUsers = await request(app)
      .get("/api/users")
      .set(other)
      .expect(200);
    expect(
      branchUsers.body.some(
        (row: { username: string }) => row.username === "other-cashier",
      ),
    ).toBe(true);
  });

  it("blocks archived-branch login while retaining its employee records", async () => {
    const auth = await loginAs(app, "admin");
    const branch = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "Archived workspace" })
      .expect(201);
    const other = { ...auth, "X-Branch-Id": String(branch.body.id) };
    const employee = await request(app)
      .post("/api/employees")
      .set(other)
      .send({ name: "Archived cashier" })
      .expect(201);
    await request(app)
      .post(`/api/employees/${employee.body.id}/cashier-access`)
      .set(other)
      .send({ username: "archived-cashier", password: "secret123" })
      .expect(201);
    await request(app)
      .delete(`/api/branches/${branch.body.id}`)
      .set(auth)
      .expect(200);
    await request(app)
      .post("/api/auth/login")
      .send({
        role: "cashier",
        username: "archived-cashier",
        password: "secret123",
      })
      .expect(401);
    const retained = await request(app)
      .get("/api/employees")
      .set(other)
      .expect(200);
    expect(retained.body.map((row: { id: string }) => row.id)).toEqual([
      employee.body.id,
    ]);
    await request(app)
      .post("/api/employees")
      .set(other)
      .send({ name: "Forbidden write" })
      .expect(409);
  });

  it("keeps item history and admin transfers inside the selected workspace", async () => {
    const auth = await loginAs(app, "admin");
    const branch = await request(app)
      .post("/api/branches")
      .set(auth)
      .send({ name: "Stock workspace" })
      .expect(201);
    const other = { ...auth, "X-Branch-Id": String(branch.body.id) };
    const category = await request(app)
      .post("/api/categories")
      .set(other)
      .send({ name: "Other stock" })
      .expect(201);
    const supplier = await request(app)
      .post("/api/suppliers")
      .set(other)
      .send({ name: "Other supplier" })
      .expect(201);
    const item = await request(app)
      .post("/api/items")
      .set(other)
      .send({
        name: "Other milk",
        categoryId: category.body.id,
        type: "raw",
        stockUnit: "litre",
      })
      .expect(201);
    await request(app)
      .post("/api/purchases")
      .set(other)
      .send({
        clientRequestId: randomUUID(),
        supplierId: supplier.body.id,
        purchasedAt: "2026-09-01",
        lines: [
          {
            itemId: item.body.id,
            quantity: 5,
            unitMode: "stock",
            unitPrice: 10,
          },
        ],
      })
      .expect(201);
    const items = await request(app).get("/api/items").set(other).expect(200);
    expect(items.body[0].hasStockHistory).toBe(true);
    const transfer = await request(app)
      .post("/api/transfers/direct")
      .set(other)
      .send({ lines: [{ itemId: item.body.id, quantity: 3 }] })
      .expect(201);
    const transfers = await request(app)
      .get("/api/transfers")
      .set(other)
      .expect(200);
    expect(transfer.body.transferId).toEqual(
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    );
    expect(transfers.body.map((row: { id: string }) => row.id)).toEqual([
      transfer.body.transferId,
    ]);
    const cafe = await request(app)
      .get("/api/inventory/cafe/stock")
      .set(other)
      .expect(200);
    expect(cafe.body[0].quantity).toBe("3.000");
    await request(app)
      .get(`/api/transfers/${transfer.body.transferId}`)
      .set(auth)
      .expect(404);
    const main = await request(app).get("/api/transfers").set(auth).expect(200);
    expect(main.body).toEqual([]);
    const output = await request(app)
      .post("/api/items")
      .set(other)
      .send({
        name: "Prepared milk",
        categoryId: category.body.id,
        type: "prepared",
        stockUnit: "litre",
      })
      .expect(201);
    const recipe = await request(app)
      .post("/api/recipes")
      .set(other)
      .send({
        name: "Other recipe",
        categoryId: category.body.id,
        type: "prepared",
        outputItemId: output.body.id,
        baseYield: 2,
        ingredients: [{ itemId: item.body.id, quantity: 1 }],
      })
      .expect(201);
    const prepared = await request(app)
      .post(`/api/recipes/${recipe.body.id}/prepare`)
      .set(other)
      .send({ quantity: 2 })
      .expect(201);
    const preparations = await request(app)
      .get("/api/recipes/preparations")
      .set(other)
      .expect(200);
    expect(preparations.body.map((row: { id: string }) => row.id)).toEqual([
      prepared.body.preparationId,
    ]);
    const mainPreparations = await request(app)
      .get("/api/recipes/preparations")
      .set(auth)
      .expect(200);
    expect(mainPreparations.body).toEqual([]);
  });
});
