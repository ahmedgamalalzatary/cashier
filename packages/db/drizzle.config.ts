import { config } from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs this as CJS (no import.meta.dirname); cwd is packages/db
config({ path: path.resolve(process.cwd(), '../../.env') });

export default defineConfig({
  dialect: 'mysql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
