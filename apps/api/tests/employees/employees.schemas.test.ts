import { describe, expect, it } from "vitest";
import {
  cashierAccessInput,
  employeeIdParam,
  employeeInput,
  employeeUpdateInput,
} from "../../src/modules/employees/employees.schemas.js";

const base = {
  name: "أحمد",
  payType: "monthly",
  payRate: 5000,
};

describe("employee schemas", () => {
  it("requires pay type and rate together", () => {
    expect(employeeInput.parse(base)).toMatchObject({ payType: "monthly" });
    expect(
      employeeInput.safeParse({ name: "أحمد" }).success,
    ).toBe(true);
    expect(
      employeeInput.safeParse({ ...base, payType: undefined }).success,
    ).toBe(false);
    expect(
      employeeInput.safeParse({ ...base, payRate: undefined }).success,
    ).toBe(false);
  });

  it("validates hire dates and pay-rate cents", () => {
    expect(
      employeeInput.safeParse({ ...base, hireDate: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      employeeInput.parse({ ...base, hireDate: "" }).hireDate,
    ).toBeNull();
    expect(employeeInput.parse({ ...base, hireDate: "2026-02-28" }).hireDate).toBe(
      "2026-02-28",
    );
    expect(
      employeeInput.safeParse({ ...base, payRate: 10.123 }).success,
    ).toBe(false);
  });

  it("rejects empty updates and deactivation through PUT", () => {
    expect(employeeUpdateInput.safeParse({}).success).toBe(false);
    expect(employeeUpdateInput.safeParse({ isActive: false }).success).toBe(
      false,
    );
    expect(employeeUpdateInput.parse({ isActive: true })).toEqual({
      isActive: true,
    });
    expect(
      employeeUpdateInput.safeParse({ payType: "daily" }).success,
    ).toBe(false);
  });

  it("validates cashier access and id params", () => {
    expect(
      cashierAccessInput.safeParse({ username: "c", password: "short" })
        .success,
    ).toBe(false);
    expect(
      cashierAccessInput.parse({ username: "cashier-1", password: "secret-123" })
        .username,
    ).toBe("cashier-1");
    expect(employeeIdParam.safeParse(0).success).toBe(false);
    expect(employeeIdParam.safeParse("abc").success).toBe(false);
    expect(employeeIdParam.parse("5")).toBe(5);
  });
});
