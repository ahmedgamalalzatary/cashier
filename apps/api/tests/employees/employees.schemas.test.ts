import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import {
  cashierAccessInput,
  employeeIdParam,
  employeeInput,
  employeeUpdateInput,
} from "../../src/modules/employees/employees.schemas.js";

const base = {
  name: "أحمد",
  payRate: 5000,
};

describe("employee schemas", () => {
  it("stores the monthly salary on its own, with no pay type", () => {
    const parsed = employeeInput.parse(base);
    expect(parsed).toMatchObject({ name: "أحمد", payRate: 5000 });
    expect(parsed.payType).toBeUndefined();
  });

  it("treats an absent salary as a salary that was never set", () => {
    expect(employeeInput.parse({ name: "أحمد" }).payRate).toBeNull();
    expect(employeeInput.parse({ name: "أحمد", payRate: null }).payRate).toBeNull();
  });

  it("rejects any pay type because payroll is monthly only", () => {
    for (const payType of ["monthly", "daily", "hourly"]) {
      expect(employeeInput.safeParse({ ...base, payType }).success).toBe(false);
    }
    expect(employeeUpdateInput.safeParse({ payType: null }).success).toBe(false);
  });

  it("validates hire dates and pay-rate cents", () => {
    expect(
      employeeInput.safeParse({ ...base, hireDate: "2026-02-30" }).success,
    ).toBe(false);
    expect(employeeInput.parse({ ...base, hireDate: "" }).hireDate).toBeNull();
    expect(
      employeeInput.parse({ ...base, hireDate: "2026-02-28" }).hireDate,
    ).toBe("2026-02-28");
    expect(employeeInput.safeParse({ ...base, payRate: 10.123 }).success).toBe(
      false,
    );
  });

  it("rejects empty updates and deactivation through PUT", () => {
    expect(employeeUpdateInput.safeParse({}).success).toBe(false);
    expect(employeeUpdateInput.safeParse({ isActive: false }).success).toBe(
      false,
    );
    expect(employeeUpdateInput.parse({ isActive: true })).toEqual({
      isActive: true,
    });
    expect(employeeUpdateInput.parse({ payRate: 200 })).toEqual({
      payRate: 200,
    });
    // clearing the salary is a normal update, not an empty one
    expect(employeeUpdateInput.parse({ payRate: null })).toEqual({
      payRate: null,
    });
  });

  it("validates cashier access and id params", () => {
    expect(
      cashierAccessInput.safeParse({ username: "c", password: "short" })
        .success,
    ).toBe(false);
    expect(
      cashierAccessInput.parse({
        username: "cashier-1",
        password: "secret-123",
      }).username,
    ).toBe("cashier-1");
    expect(employeeIdParam.safeParse(0).success).toBe(false);
    expect(employeeIdParam.safeParse("abc").success).toBe(false);
    expect(employeeIdParam.parse(testId(5))).toBe(testId(5));
  });
});
