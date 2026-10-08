import bcrypt from "bcryptjs";
import { resolveAccess, type Access } from "../../access.js";
import { HttpError } from "../../middleware/error.js";
import { signToken } from "../../middleware/auth.js";
import { toAuthUser } from "./auth-user.js";
import type { AuthRepository } from "./auth.repository.js";
import type { LoginInput } from "./auth.schemas.js";

const DUMMY_PASSWORD_HASH =
  "$2b$10$wwlsALurZKzPIweY9o6D5e6qXOYOu1TNLB2AFMFb//vhE74irekS2";
type ComparePassword = (password: string, hash: string) => Promise<boolean>;

export class AuthService {
  private readonly branchId?: string;
  private readonly online: boolean;

  constructor(
    private repo: AuthRepository,
    private jwtSecret: string,
    private comparePassword: ComparePassword = bcrypt.compare,
    access?: Access,
  ) {
    const resolved = resolveAccess(access);
    this.branchId = resolved.branchId;
    this.online = resolved.online;
  }

  async login({ username, password, role }: LoginInput) {
    const user = await this.repo.findByUsername(
      username,
      role,
      this.branchId,
    );
    // same error for unknown user and wrong password — no username probing
    const invalid = new HttpError(401, "اسم المستخدم أو كلمة المرور غير صحيحة");
    const ok = await this.comparePassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (
      !user ||
      !user.isActive ||
      !ok ||
      (user.role === "cashier" && !user.branchIsActive)
    )
      throw invalid;
    // Checked after the password so a wrong password never reveals which
    // usernames belong to cashiers.
    if (this.online && user.role === "cashier")
      throw new HttpError(401, "لا يملك الكاشير صلاحية الدخول عبر الإنترنت");
    if (
      this.branchId &&
      (user.role === "cashier"
        ? user.branchId !== this.branchId
        : !user.isSuperAdmin &&
          !(await this.repo.isAdminAssigned(user.id, this.branchId)))
    )
      throw new HttpError(
        403,
        "هذا الحساب غير مسموح له بالدخول إلى فرع هذا الجهاز",
      );
    const authUser = toAuthUser(user);
    return {
      token: signToken(authUser, user.tokenVersion, this.jwtSecret),
      user: authUser,
    };
  }
}
