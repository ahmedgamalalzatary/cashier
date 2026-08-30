import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadRuntimeEnv, parseRuntimeEnv, rootDir } from '../../../src/env.js';

const valid = {
  DATABASE_URL: 'mysql://cashier:password@localhost:3306/cashier',
  JWT_SECRET: 'a-production-secret-with-at-least-32-characters',
  PORT: '4000',
  CORS_ORIGIN: 'http://localhost:3000',
  EXTERNAL_ORDERS_BASE_URL: 'https://orders.example.com',
  EXTERNAL_ORDERS_PHONE_NUMBER: '01234567890',
  EXTERNAL_ORDERS_PASSWORD: 'server-only-password',
};

describe('runtime environment', () => {
  it('loads injected environment variables when the env file is absent', () => {
    expect(
      loadRuntimeEnv({
        envFile: path.join(rootDir, '.env.docker-missing-test'),
        environment: { ...valid, PORT: '4321' },
      }),
    ).toMatchObject({
      DATABASE_URL: valid.DATABASE_URL,
      JWT_SECRET: valid.JWT_SECRET,
      PORT: 4321,
      CORS_ORIGIN: [valid.CORS_ORIGIN],
      EXTERNAL_ORDERS_BASE_URL: valid.EXTERNAL_ORDERS_BASE_URL,
      EXTERNAL_ORDERS_PHONE_NUMBER: valid.EXTERNAL_ORDERS_PHONE_NUMBER,
    });
  });

  it('parses and normalizes a complete valid configuration', () => {
    expect(parseRuntimeEnv(valid)).toMatchObject({
      DATABASE_URL: valid.DATABASE_URL,
      JWT_SECRET: valid.JWT_SECRET,
      PORT: 4000,
      CORS_ORIGIN: [valid.CORS_ORIGIN],
      EXTERNAL_ORDERS_BASE_URL: valid.EXTERNAL_ORDERS_BASE_URL,
      EXTERNAL_ORDERS_PHONE_NUMBER: valid.EXTERNAL_ORDERS_PHONE_NUMBER,
    });
  });

  it('parses multiple comma-separated CORS origins', () => {
    expect(
      parseRuntimeEnv({
        ...valid,
        CORS_ORIGIN:
          'https://cashier.bittech.site, http://localhost:3000',
      }).CORS_ORIGIN,
    ).toEqual([
      'https://cashier.bittech.site',
      'http://localhost:3000',
    ]);
  });

  it.each([
    [{ ...valid, DATABASE_URL: undefined }, 'DATABASE_URL'],
    [{ ...valid, DATABASE_URL: 'not-a-url' }, 'DATABASE_URL'],
    [{ ...valid, JWT_SECRET: undefined }, 'JWT_SECRET'],
    [{ ...valid, JWT_SECRET: 'change-me' }, 'JWT_SECRET'],
    [{ ...valid, PORT: '70000' }, 'PORT'],
    [{ ...valid, CORS_ORIGIN: 'not-an-origin' }, 'CORS_ORIGIN'],
    [{ ...valid, CORS_ORIGIN: `${valid.CORS_ORIGIN},` }, 'CORS_ORIGIN'],
    [
      { ...valid, EXTERNAL_ORDERS_BASE_URL: undefined },
      'EXTERNAL_ORDERS_BASE_URL',
    ],
    [
      { ...valid, EXTERNAL_ORDERS_BASE_URL: 'not-a-url' },
      'EXTERNAL_ORDERS_BASE_URL',
    ],
    [
      { ...valid, EXTERNAL_ORDERS_BASE_URL: 'https://orders.example.com/api/' },
      'EXTERNAL_ORDERS_BASE_URL',
    ],
    [
      { ...valid, EXTERNAL_ORDERS_BASE_URL: 'http://orders.example.com' },
      'EXTERNAL_ORDERS_BASE_URL',
    ],
    [
      { ...valid, EXTERNAL_ORDERS_PHONE_NUMBER: undefined },
      'EXTERNAL_ORDERS_PHONE_NUMBER',
    ],
    [
      { ...valid, EXTERNAL_ORDERS_PASSWORD: undefined },
      'EXTERNAL_ORDERS_PASSWORD',
    ],
  ])('rejects unsafe configuration %#', (environment, field) => {
    expect(() => parseRuntimeEnv(environment)).toThrow(field);
  });
});
