import { config } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// single .env at the repo root shared by all apps
export const rootDir = path.resolve(import.meta.dirname, '../../..');

const runtimeEnvSchema = z.object({
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .url('DATABASE_URL must be a valid URL')
    .refine(
      (value) => value.startsWith('mysql://') || value.startsWith('mysql2://'),
      {
        message: 'DATABASE_URL must use mysql:// or mysql2://',
      },
    ),
  JWT_SECRET: z
    .string({ required_error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must contain at least 32 characters')
    .refine((value) => value !== 'change-me', {
      message: 'JWT_SECRET must not use the example value',
    }),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  CORS_ORIGIN: z
    .string()
    .url('CORS_ORIGIN must be a valid URL')
    .refine(
      (value) => {
        try {
          return new URL(value).origin === value;
        } catch {
          return false;
        }
      },
      { message: 'CORS_ORIGIN must contain only an origin' },
    )
    .default('http://localhost:3000'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  EXTERNAL_ORDERS_BASE_URL: z
    .string({ required_error: 'EXTERNAL_ORDERS_BASE_URL is required' })
    .url('EXTERNAL_ORDERS_BASE_URL must be a valid URL')
    .transform((value) => value.replace(/\/+$/, ''))
    .refine((value) => new URL(value).origin === value, {
      message: 'EXTERNAL_ORDERS_BASE_URL must contain only an origin',
    })
    .refine((value) => new URL(value).protocol === 'https:', {
      message: 'EXTERNAL_ORDERS_BASE_URL must use HTTPS',
    }),
  EXTERNAL_ORDERS_PHONE_NUMBER: z
    .string({ required_error: 'EXTERNAL_ORDERS_PHONE_NUMBER is required' })
    .regex(
      /^\+?\d{8,15}$/,
      'EXTERNAL_ORDERS_PHONE_NUMBER must be a valid phone number',
    ),
  EXTERNAL_ORDERS_PASSWORD: z
    .string({ required_error: 'EXTERNAL_ORDERS_PASSWORD is required' })
    .min(1, 'EXTERNAL_ORDERS_PASSWORD is required'),
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export function parseRuntimeEnv(
  environment: Record<string, string | undefined>,
): RuntimeEnv {
  const result = runtimeEnvSchema.safeParse(environment);
  if (result.success) return result.data;
  const details = result.error.issues
    .map(
      (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
    )
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

type LoadRuntimeEnvOptions = {
  envFile?: string;
  environment?: Record<string, string | undefined>;
};

export function loadRuntimeEnv({
  envFile = path.join(rootDir, '.env'),
  environment,
}: LoadRuntimeEnvOptions = {}) {
  const injectedEnvironment = environment
    ? Object.fromEntries(
        Object.entries(environment).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      )
    : undefined;
  const loaded = injectedEnvironment
    ? config({ path: envFile, processEnv: injectedEnvironment })
    : config({ path: envFile });
  const loadError = loaded.error as NodeJS.ErrnoException | undefined;
  if (loadError && loadError.code !== 'ENOENT')
    throw new Error(`Unable to load environment file: ${loadError.message}`);
  return parseRuntimeEnv(injectedEnvironment ?? process.env);
}
