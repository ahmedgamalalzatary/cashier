import { describe, expect, it } from "vitest";
import * as db from "../src/index.js";

describe("@cashier/db public surface", () => {
  it("exposes the client, branch scoping, and shared HttpError", () => {
    expect(typeof db.createDb).toBe("function");
    expect(typeof db.closeDb).toBe("function");
    expect(typeof db.branchCondition).toBe("function");
    expect(typeof db.branchTransaction).toBe("function");
    expect(typeof db.branchTable).toBe("function");
    expect(typeof db.branchValues).toBe("function");
    expect(typeof db.withBranch).toBe("function");
    expect(typeof db.currentBranchId).toBe("function");
    expect(typeof db.HttpError).toBe("function");
  });

  it("exposes the admin seed helpers", () => {
    expect(typeof db.seedAdmin).toBe("function");
    expect(typeof db.syncConfiguredAdmin).toBe("function");
    expect(typeof db.getAdminSeedConfig).toBe("function");
  });

  it("exposes every business table by name", () => {
    for (const table of [
      "branches",
      "employees",
      "users",
      "shifts",
      "orders",
      "items",
      "expenses",
    ]) {
      expect(db, `missing table export: ${table}`).toHaveProperty(table);
    }
  });

  it("raises the same HttpError class the API error handler checks", async () => {
    // the api re-exports this class; a second copy would break `instanceof`
    // in the error middleware, which is how 404/409 responses are produced
    const { HttpError } = await import("../src/http-error.js");
    expect(db.HttpError).toBe(HttpError);
    expect(new db.HttpError(404, "غير موجود")).toBeInstanceOf(Error);
  });
});
