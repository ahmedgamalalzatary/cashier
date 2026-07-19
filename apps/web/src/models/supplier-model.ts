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
  const openingBalance = Number(form.openingBalance) || 0;
  return {
    name: form.name,
    phone: form.phone,
    address: form.address,
    notes: form.notes,
    ...(!supplier || openingBalance.toFixed(2) !== supplier.openingBalance
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
