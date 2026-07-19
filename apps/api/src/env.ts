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

export function loadRuntimeEnv() {
  const loaded = config({ path: path.join(rootDir, '.env') });
  if (loaded.error)
    throw new Error(`Unable to load root .env: ${loaded.error.message}`);
  return parseRuntimeEnv(process.env);
}
