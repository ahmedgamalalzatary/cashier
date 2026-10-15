export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  openingBalance: string;
  isActive: boolean;
  balance: string;
};

export type SupplierPayment = {
  id: string;
  supplierId: string;
  amount: string;
  paidAt: string;
  notes: string | null;
};

export type SupplierStatementMovement = {
  id: string;
  type: "purchase" | "payment";
  referenceId: string;
  date: string;
  description: string;
  /** Signed amount: purchases increase debt, payments reduce it. */
  amount: string;
  balanceAfter: string;
};

export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  /** ISO timestamp — Date on the server, serialized to string over JSON */
  createdAt: string;
};
