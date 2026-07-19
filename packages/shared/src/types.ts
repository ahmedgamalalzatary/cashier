// API response shapes shared between apps/api and apps/web

export type Role = 'admin' | 'cashier';

export type AuthUser = {
  id: number;
  name: string;
  role: Role;
};

export type Session = {
  token: string;
  user: AuthUser;
};

export type Supplier = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  openingBalance: string;
  isActive: boolean;
  balance: string;
};

export type SupplierPayment = {
  id: number;
  supplierId: number;
  amount: string;
  paidAt: string;
  notes: string | null;
};

export type Category = {
  id: number;
  name: string;
  parentId: number | null;
  isActive: boolean;
  /** ISO timestamp — Date on the server, serialized to string over JSON */
  createdAt: string;
};
