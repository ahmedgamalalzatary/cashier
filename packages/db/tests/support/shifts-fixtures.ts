import request from "supertest";
import { createApp } from "../../../../apps/api/src/app.js";
import { appOptions, db } from "./api-setup.js";
import { loginAs } from "./api-helpers.js";
import { testId } from "./ids.js";

export const app = () => createApp(db, appOptions);

export async function createCashier(
  username = "shift-cashier",
  employeeName = "كاشير الوردية",
  existingAdminAuthorization?: { Authorization: string },
  branchId = testId(1),
) {
  const adminAuthorization =
    existingAdminAuthorization ?? (await loginAs(app(), "admin"));
  const employee = await request(app())
    .post("/api/employees")
    .set(adminAuthorization)
    .set("X-Branch-Id", String(branchId))
    .send({ name: employeeName });
  const access = await request(app())
    .post(`/api/employees/${employee.body.id}/cashier-access`)
    .set(adminAuthorization)
    .set("X-Branch-Id", String(branchId))
    .send({ username, password: "secret123" });
  const login = await request(app())
    .post("/api/auth/login")
    .send({ role: "cashier", username, password: "secret123" });
  return {
    employeeId: employee.body.id as string,
    userId: access.body.userId as string,
    authorization: {
      Authorization: `Bearer ${login.body.token}`,
    },
    adminAuthorization,
  };
}
