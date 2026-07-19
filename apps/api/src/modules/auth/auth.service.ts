import bcrypt from 'bcryptjs';
import { HttpError } from '../../middleware/error.js';
import { signToken, type AuthUser } from '../../middleware/auth.js';
import type { AuthRepository } from './auth.repository.js';
import type { LoginInput } from './auth.schemas.js';

export class AuthService {
  constructor(private repo: AuthRepository) {}

  async login({ username, password }: LoginInput) {
    const user = await this.repo.findByUsername(username);
    // same error for unknown user and wrong password — no username probing
    const invalid = new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
    if (!user || !user.isActive) throw invalid;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw invalid;
    const authUser: AuthUser = { id: user.id, name: user.name, role: user.role };
    return { token: signToken(authUser), user: authUser };
  }
}
