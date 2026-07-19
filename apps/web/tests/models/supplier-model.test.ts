import { describe, expect, it } from "vitest";
import type { Supplier } from "@cashier/shared";
import {
  supplierBalanceClass,
  supplierRequestBody,
} from "../../src/models/supplier-model";

const supplier: Supplier = {
  id: 1,
  name: "Supplier",
  phone: null,
  address: null,
  notes: null,
  openingBalance: "200.00",
  isActive: true,
  balance: "200.00",
};

describe("supplier form model", () => {
  it("omits an unchanged opening balance while editing", () => {
    expect(
      supplierRequestBody(
        {
          name: "Renamed",
          phone: "",
          address: "",
          notes: "",
          openingBalance: "200.00",
        },
        supplier,
      ),
    ).not.toHaveProperty("openingBalance");
  });

  it("includes a changed opening balance and every new supplier balance", () => {
    const form = {
      name: "Supplier",
      phone: "",
      address: "",
      notes: "",
      openingBalance: "250",
    };
    expect(supplierRequestBody(form, supplier)).toHaveProperty(
      "openingBalance",
      250,
    );
    expect(supplierRequestBody(form, null)).toHaveProperty(
      "openingBalance",
      250,
    );
  });
});

describe("supplier balance presentation", () => {
  it("distinguishes debt, settlement, and supplier credit", () => {
    expect(supplierBalanceClass("1")).toContain("text-danger");
    expect(supplierBalanceClass("0")).toContain("text-success");
    expect(supplierBalanceClass("-1")).toContain("text-accent");
  });
});
