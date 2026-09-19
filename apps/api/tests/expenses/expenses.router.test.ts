import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requireRole } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/error.js";
import type { ExpensesController } from "../../src/modules/expenses/expenses.controller.js";
import { ExpensesController as RealExpensesController } from "../../src/modules/expenses/expenses.controller.js";
import type { ExpensesService } from "../../src/modules/expenses/expenses.service.js";
import { expensesRouter } from "../../src/modules/expenses/expenses.router.js";

type Role = "admin" | "cashier";

function appWithStubs(controller: ExpensesController, role: Role = "cashier") {
  const app = express();
  app.use((req, _res, next) => {
    req.user = {
      id: role === "admin" ? 7 : 9,
      name: role === "admin" ? "Admin" : "Cashier",
      role,
    };
    next();
  });
  app.use(express.json(), expensesRouter(controller, requireRole("admin")));
  app.use(errorHandler);
  return app;
}

function stubController(
  overrides: Partial<Record<keyof ExpensesController, unknown>> = {},
) {
  const ok = vi.fn((_req: unknown, res: { json: (body: unknown) => void }) =>
    res.json({ ok: true }),
  );
  const created = vi.fn(
    (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) =>
      res.status(201).json({ ok: true }),
  );
  return {
    categories: vi.fn(ok),
    createCategory: vi.fn(created),
    updateCategory: vi.fn(ok),
    list: vi.fn(ok),
    create: vi.fn(created),
    ...overrides,
  } as unknown as ExpensesController;
}

const validExpense = {
  clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  categoryId: 1,
  amount: 12.5,
  expenseDate: "2026-07-20",
  note: null,
};

describe("expense route authorization", () => {
  it("blocks cashiers from managing categories", async () => {
    const controller = stubController();

    const responses = await Promise.all([
      request(appWithStubs(controller)).post("/categories").send({
        name: "x",
      }),
      request(appWithStubs(controller)).patch("/categories/1").send({
        name: "y",
      }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403]);
    expect(controller.createCategory).not.toHaveBeenCalled();
    expect(controller.updateCategory).not.toHaveBeenCalled();
  });

  it("lets cashiers reach categories, list, and create", async () => {
    const controller = stubController();

    const responses = await Promise.all([
      request(appWithStubs(controller)).get("/categories"),
      request(appWithStubs(controller)).get("/"),
      request(appWithStubs(controller)).post("/").send(validExpense),
    ]);

    expect(responses.every(({ status }) => status !== 403)).toBe(true);
    expect(controller.categories).toHaveBeenCalledTimes(1);
    expect(controller.list).toHaveBeenCalledTimes(1);
    expect(controller.create).toHaveBeenCalledTimes(1);
  });
});

describe("expense controller wiring", () => {
  it("returns 201 on create with the parsed input and actor", async () => {
    const service = {
      create: vi.fn(async () => ({ id: 9 })),
    } as unknown as ExpensesService;

    const response = await request(
      appWithStubs(new RealExpensesController(service)),
    )
      .post("/")
      .send(validExpense);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 9 });
    expect(service.create).toHaveBeenCalledWith(
      validExpense,
      expect.objectContaining({ id: 9, role: "cashier" }),
    );
  });

  it("requires an expense date from admins", async () => {
    const service = {
      create: vi.fn(async () => ({ id: 9 })),
    } as unknown as ExpensesService;
    const { expenseDate, ...withoutDate } = validExpense;

    const response = await request(
      appWithStubs(new RealExpensesController(service), "admin"),
    )
      .post("/")
      .send(withoutDate);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "تاريخ المصروف مطلوب" });
    expect(service.create).not.toHaveBeenCalled();
    void expenseDate;
  });

  it("returns 201 on category create and maps bad ids and bodies", async () => {
    const service = {
      createCategory: vi.fn(async () => ({ id: 2, name: "نظافة" })),
    } as unknown as ExpensesService;
    const adminApp = appWithStubs(
      new RealExpensesController(service),
      "admin",
    );

    const created = await request(adminApp)
      .post("/categories")
      .send({ name: "نظافة" });
    expect(created.status).toBe(201);
    expect(service.createCategory).toHaveBeenCalledWith("نظافة");

    const blank = await request(adminApp).post("/categories").send({
      name: "   ",
    });
    expect(blank.status).toBe(400);

    const badId = await request(adminApp).patch("/categories/abc").send({
      name: "x",
    });
    expect(badId.status).toBe(400);
  });
});
