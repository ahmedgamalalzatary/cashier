import bcrypt from "bcryptjs";
import request from "supertest";
import type { Express } from "express";
import {
  adminBranches,
  currentBranchId,
  employees,
  users,
  branchValues,
} from "@cashier/db";
import { db } from "./api-setup.js";

type AdminOptions = { isSuperAdmin?: boolean };

export async function createUser(
  role: "admin" | "cashier",
  username = role,
  options: AdminOptions = {},
) {
  let employeeId: string | null = null;
  if (role === "cashier") {
    const [employee] = await db
      .insert(employees)
      .values(branchValues({ name: "كاشير" }))
      .$returningId();
    employeeId = employee.id;
  }
  const [user] = await db
    .insert(users)
    .values({
      branchId: role === "cashier" ? currentBranchId() : null,
      name: role === "admin" ? "مدير" : "كاشير",
      username,
      passwordHash: bcrypt.hashSync("secret123", 4),
      role,
      isSuperAdmin: role === "admin" ? (options.isSuperAdmin ?? false) : false,
      employeeId,
    })
    .$returningId();
  if (role === "admin" && !options.isSuperAdmin) {
    await db
      .insert(adminBranches)
      .values({ adminUserId: user.id, branchId: currentBranchId() });
  }
  return { username, password: "secret123", role };
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
  return {
    Authorization: `Bearer ${res.body.token}`,
    "X-Branch-Id": currentBranchId(),
  } as const;
}
