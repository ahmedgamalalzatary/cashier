import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { readRequestToken } from '../../../src/middleware/auth.js';

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
