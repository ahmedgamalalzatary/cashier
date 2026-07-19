import type { Supplier } from "@cashier/shared";

export type SupplierFormState = {
  name: string;
  phone: string;
  address: string;
  notes: string;
  openingBalance: string;
};

export function supplierRequestBody(
  form: SupplierFormState,
  supplier: Supplier | null,
) {
  const rawOpeningBalance = form.openingBalance.trim();
  const openingBalance =
    rawOpeningBalance === "" ? undefined : Number(rawOpeningBalance);
  if (openingBalance !== undefined && !Number.isFinite(openingBalance)) {
    throw new Error("الرصيد الافتتاحي غير صالح");
  }
  return {
    name: form.name,
    phone: form.phone,
    address: form.address,
    notes: form.notes,
    ...(openingBalance !== undefined &&
    (!supplier || openingBalance.toFixed(2) !== supplier.openingBalance)
      ? { openingBalance }
      : {}),
  };
}

export function supplierBalanceClass(balance: string) {
  const value = Number(balance);
  if (value > 0) return "text-danger font-medium";
  if (value < 0) return "text-accent font-medium";
  return "text-success";
}
