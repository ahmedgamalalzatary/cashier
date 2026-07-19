import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { users } from '../db/schema.js';
import { HttpError } from './error.js';

export type AuthUser = {
  id: number;
  name: string;
  role: 'admin' | 'cashier';
};

declare global {
  // Express request fields are extended globally by the framework's type definitions.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: '12h' });
}

export function authenticate(db: Db) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new HttpError(401, 'يجب تسجيل الدخول');

    let payload: AuthUser;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
    } catch {
      throw new HttpError(401, 'انتهت الجلسة — سجّل الدخول من جديد');
    }

    const [user] = await db.select().from(users).where(eq(users.id, payload.id)).limit(1);
    if (!user?.isActive) throw new HttpError(401, 'انتهت الجلسة — سجّل الدخول من جديد');
    req.user = { id: user.id, name: user.name, role: user.role };
    next();
  };
}

export function requireRole(role: AuthUser['role']) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, 'يجب تسجيل الدخول');
    if (req.user.role !== role) throw new HttpError(403, 'لا تملك صلاحية الوصول');
    next();
  };
}
