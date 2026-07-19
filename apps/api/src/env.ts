import { config } from 'dotenv';
import path from 'node:path';

// single .env at the repo root shared by all apps
export const rootDir = path.resolve(import.meta.dirname, '../../..');
config({ path: path.join(rootDir, '.env') });
