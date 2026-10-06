import bcrypt from "bcryptjs";
import request from "supertest";
import type { Express } from "express";
import { employees, users } from "../src/db/schema.js";
import { db } from "./setup.js";

type AdminOptions = { isSuperAdmin?: boolean };

export async function createUser(
  role: "admin" | "cashier",
  username = role,
  options: AdminOptions = {},
) {
  let employeeId: number | null = null;
  if (role === "cashier") {
    const [employee] = await db.insert(employees).values({ name: "كاشير" });
    employeeId = employee.insertId;
  }
  await db.insert(users).values({
    name: role === "admin" ? "مدير" : "كاشير",
    username,
    passwordHash: bcrypt.hashSync("secret123", 4),
    role,
    isSuperAdmin: role === "admin" ? (options.isSuperAdmin ?? false) : false,
    employeeId,
  });
  return { username, password: "secret123" };
}

export async function loginAs(
  app: Express,
  role: "admin" | "cashier",
  options: AdminOptions = {},
) {
  const creds = await createUser(
    role,
    role,
    role === "admin" ? { isSuperAdmin: true, ...options } : {},
  );
  const res = await request(app).post("/api/auth/login").send(creds);
  return { Authorization: `Bearer ${res.body.token}` } as const;
}
