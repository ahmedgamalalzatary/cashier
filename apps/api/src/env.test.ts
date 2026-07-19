import { describe, expect, it } from 'vitest';
import { parseRuntimeEnv } from './env.js';

const valid = {
  DATABASE_URL: 'mysql://cashier:password@localhost:3306/cashier',
  JWT_SECRET: 'a-production-secret-with-at-least-32-characters',
  PORT: '4000',
  CORS_ORIGIN: 'http://localhost:3000',
};

describe('runtime environment', () => {
  it('parses and normalizes a complete valid configuration', () => {
    expect(parseRuntimeEnv(valid)).toMatchObject({
      DATABASE_URL: valid.DATABASE_URL,
      JWT_SECRET: valid.JWT_SECRET,
      PORT: 4000,
      CORS_ORIGIN: valid.CORS_ORIGIN,
    });
  });

  it.each([
    [{ ...valid, DATABASE_URL: undefined }, 'DATABASE_URL'],
    [{ ...valid, DATABASE_URL: 'not-a-url' }, 'DATABASE_URL'],
    [{ ...valid, JWT_SECRET: undefined }, 'JWT_SECRET'],
    [{ ...valid, JWT_SECRET: 'change-me' }, 'JWT_SECRET'],
    [{ ...valid, PORT: '70000' }, 'PORT'],
    [{ ...valid, CORS_ORIGIN: 'not-an-origin' }, 'CORS_ORIGIN'],
  ])('rejects unsafe configuration %#', (environment, field) => {
    expect(() => parseRuntimeEnv(environment)).toThrow(field);
  });
});
