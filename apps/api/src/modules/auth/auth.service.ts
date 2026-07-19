import bcrypt from "bcryptjs";
import { HttpError } from "../../middleware/error.js";
import { signToken } from "../../middleware/auth.js";
import type { AuthUser } from "@cashier/shared";
import type { AuthRepository } from "./auth.repository.js";
import type { ChangePasswordInput, LoginInput } from "./auth.schemas.js";

const DUMMY_PASSWORD_HASH =
  "$2b$10$wwlsALurZKzPIweY9o6D5e6qXOYOu1TNLB2AFMFb//vhE74irekS2";
type ComparePassword = (password: string, hash: string) => Promise<boolean>;

export class AuthService {
  constructor(
    private repo: AuthRepository,
    private jwtSecret: string,
    private comparePassword: ComparePassword = bcrypt.compare,
  ) {}

  async login({ username, password }: LoginInput) {
    const user = await this.repo.findByUsername(username);
    // same error for unknown user and wrong password — no username probing
    const invalid = new HttpError(401, "اسم المستخدم أو كلمة المرور غير صحيحة");
    const ok = await this.comparePassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !user.isActive || !ok) throw invalid;
    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      role: user.role,
    };
    return { token: signToken(authUser, this.jwtSecret), user: authUser };
  }

  async changePassword(userId: number, input: ChangePasswordInput) {
    const user = await this.repo.findById(userId);
    if (!user?.isActive)
      throw new HttpError(401, "انتهت الجلسة — سجّل الدخول من جديد");
    if (
      !(await this.comparePassword(input.currentPassword, user.passwordHash))
    ) {
      throw new HttpError(400, "كلمة المرور الحالية غير صحيحة");
    }
    await this.repo.updatePassword(
      userId,
      await bcrypt.hash(input.newPassword, 10),
    );
  }
}
