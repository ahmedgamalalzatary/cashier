import type { AuthUser } from "@cashier/shared";

type AuthUserRow = {
  id: number;
  name: string;
  role: AuthUser["role"];
  branchId: number;
  isSuperAdmin: boolean;
};

export function toAuthUser(user: AuthUserRow): AuthUser {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    branchId: user.role === "cashier" ? user.branchId : null,
    isSuperAdmin: user.isSuperAdmin,
  };
}