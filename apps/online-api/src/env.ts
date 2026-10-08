import { config } from "dotenv";
import path from "node:path";
import { z } from "zod";
import { commonRuntimeEnv } from "@cashier/server-core";

// single .env at the repo root in development; on the VPS the Compose
// environment file supplies these values.
export const rootDir = path.resolve(import.meta.dirname, "../../..");

const onlineEnvSchema = z.object({
  ...commonRuntimeEnv,
  // The online API has its own port so it never collides with a local shop API.
  PORT: z.coerce.number().int().min(1).max(65_535).default(4001),
  // The super-admin the VPS keeps in .env.production (plan 7.3, D5).
  ADMIN_NAME: z.string().trim().min(1).max(191).default("المدير"),
  ADMIN_USERNAME: z
    .string({ required_error: "ADMIN_USERNAME is required" })
    .trim()
    .min(1, "ADMIN_USERNAME is required")
    .max(100),
  ADMIN_PASSWORD: z
    .string({ required_error: "ADMIN_PASSWORD is required" })
    .min(1, "ADMIN_PASSWORD is required")
    .max(255),
});

export type OnlineEnv = z.infer<typeof onlineEnvSchema>;

export function parseOnlineEnv(
  environment: Record<string, string | undefined>,
): OnlineEnv {
  const result = onlineEnvSchema.safeParse(environment);
  if (result.success) return result.data;
  const details = result.error.issues
    .map(
      (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
    )
    .join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

type LoadOnlineEnvOptions = {
  envFile?: string;
  environment?: Record<string, string | undefined>;
};

export function loadOnlineEnv({
  envFile = path.join(rootDir, ".env"),
  environment,
}: LoadOnlineEnvOptions = {}) {
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
  if (loadError && loadError.code !== "ENOENT")
    throw new Error(`Unable to load environment file: ${loadError.message}`);
  return parseOnlineEnv(injectedEnvironment ?? process.env);
}