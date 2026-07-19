import { config } from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

config({ path: path.resolve(import.meta.dirname, '../../.env') });

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
