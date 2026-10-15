export type Role = "admin" | "cashier";

export type AuthUser = {
  id: string;
  name: string;
  role: Role;
  /** Cashiers belong to one branch; admins can select any branch. */
  branchId?: string | null;
  /** Only the configured admin from server settings can manage admin accounts. */
  isSuperAdmin: boolean;
};

export type Branch = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

/** What online knows about the PC linked to a branch (desktop versions in use). */
export type DeviceStatus = {
  branchId: string;
  /** The desktop version the PC last reported; null until it first calls online. */
  appVersion: string | null;
  linkedAt: string;
  lastSeenAt: string | null;
  lastUploadAt: string | null;
};

export type Session = {
  token: string;
  user: AuthUser;
};

export type ManagedUser = AuthUser & {
  username: string;
  isActive: boolean;
  /** ISO timestamp — Date on the server, serialized to string over JSON */
  createdAt: string;
};

export type CashierAccess = {
  userId: string;
  username: string;
  isActive: boolean;
};

export type Employee = {
  id: string;
  name: string;
  phone: string | null;
  jobTitle: string | null;
  hireDate: string | null;
  /** monthly salary — null means the salary was never set */
  payRate: string | null;
  notes: string | null;
  isActive: boolean;
  cashierAccess: CashierAccess | null;
  createdAt: string;
};
