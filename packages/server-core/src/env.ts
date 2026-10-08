import { z } from "zod";

const corsOriginSchema = z
  .string()
  .url("CORS_ORIGIN must contain valid URLs")
  .refine(
    (value) => {
      // Tauri uses a custom origin on platforms without the Windows HTTP scheme.
      if (value === "tauri://localhost") return true;
      try {
        return new URL(value).origin === value;
      } catch {
        return false;
      }
    },
    { message: "CORS_ORIGIN entries must contain only an origin" },
  );

/**
 * The settings every Cashier API needs (plan section 7.3). Each API adds only
 * what is specific to it: the shop API adds the external-orders settings it
 * syncs from, the online API adds the super-admin it seeds from the VPS
 * environment file.
 */
export const commonRuntimeEnv = {
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .url("DATABASE_URL must be a valid URL")
    .refine(
      (value) => value.startsWith("mysql://") || value.startsWith("mysql2://"),
      { message: "DATABASE_URL must use mysql:// or mysql2://" },
    ),
  JWT_SECRET: z
    .string({ required_error: "JWT_SECRET is required" })
    .min(32, "JWT_SECRET must contain at least 32 characters")
    .refine((value) => value !== "change-me", {
      message: "JWT_SECRET must not use the example value",
    }),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim()))
    .pipe(z.array(corsOriginSchema).min(1)),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
};