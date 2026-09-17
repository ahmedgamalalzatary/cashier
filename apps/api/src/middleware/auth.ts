import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { users } from '../db/schema.js';
import { HttpError } from './error.js';
import type { AuthUser } from '@cashier/shared';

declare global {
  // Express request fields are extended globally by the framework's type definitions.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type AuthToken = AuthUser & { tokenVersion: number };

export const AUTH_COOKIE_NAME = 'cashier.token';
const AUTH_COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function signToken(
  user: AuthUser,
  tokenVersion: number,
  jwtSecret: string,
) {
  return jwt.sign({ ...user, tokenVersion }, jwtSecret, { expiresIn: '12h' });
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  const entry = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!entry) return undefined;
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function authCookieOptions(req: Request) {
  return {
    httpOnly: true,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
    sameSite: 'lax' as const,
    // localhost dev stays http; TLS-terminating deployments (trust proxy)
    // automatically upgrade the cookie to Secure.
    secure: req.secure,
  };
}

export function setAuthCookie(req: Request, res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions(req));
}

export function clearAuthCookie(req: Request, res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieOptions(req), maxAge: 0 });
}

export function readRequestToken(req: Request) {
  const fromCookie = readCookie(req.headers.cookie, AUTH_COOKIE_NAME);
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

export function authenticate(db: Db, jwtSecret: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = readRequestToken(req);
    if (!token) throw new HttpError(401, 'يجب تسجيل الدخول');

    let payload: AuthToken;
    try {
      payload = jwt.verify(token, jwtSecret) as AuthToken;
    } catch {
      throw new HttpError(401, 'انتهت الجلسة — سجّل الدخول من جديد');
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.id))
      .limit(1);
    if (!user?.isActive || payload.tokenVersion !== user.tokenVersion)
      throw new HttpError(401, 'انتهت الجلسة — سجّل الدخول من جديد');
    req.user = { id: user.id, name: user.name, role: user.role };
    next();
  };
}

export function requireRole(role: AuthUser['role']) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, 'يجب تسجيل الدخول');
    if (req.user.role !== role)
      throw new HttpError(403, 'لا تملك صلاحية الوصول');
    next();
  };
}
