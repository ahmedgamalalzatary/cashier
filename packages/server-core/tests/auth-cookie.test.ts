import { testId } from "@cashier/shared/test-support";
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { readRequestToken, setAuthCookie, signToken } from '../src/middleware/auth.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function requestWithCookie(cookie: string): Request {
  return { headers: { cookie } } as Request;
}

describe('readRequestToken', () => {
  it('returns undefined for a malformed cookie value instead of throwing', () => {
    expect(() =>
      readRequestToken(requestWithCookie('cashier.token=%E0%A4%A')),
    ).not.toThrow();
    expect(
      readRequestToken(requestWithCookie('cashier.token=%E0%A4%A')),
    ).toBeUndefined();
  });

  it('still decodes a valid cookie value', () => {
    expect(
      readRequestToken(requestWithCookie('cashier.token=abc%20def')),
     ).toBe('abc def');
  });
});

describe('auth token lifetime', () => {
  const user = { id: testId(1), username: 'admin', role: 'admin' } as never;

  it('signs tokens that last 30 days', () => {
    const token = signToken(user, 0, 'secret');
    const payload = jwt.decode(token) as { iat: number; exp: number };
    expect((payload.exp - payload.iat) * 1000).toBe(THIRTY_DAYS_MS);
  });

  it('sets the auth cookie maxAge to 30 days', () => {
    const cookie = vi.fn();
    setAuthCookie({ secure: false } as Request, { cookie } as unknown as Response, 't');
    expect(cookie.mock.calls[0][2].maxAge).toBe(THIRTY_DAYS_MS);
  });
});
