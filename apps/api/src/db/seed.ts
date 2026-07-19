// Creates the initial admin user if no users exist. Run: pnpm db:seed
import { loadRuntimeEnv } from '../env.js';
import { createDb } from './index.js';
import { getAdminSeedConfig } from './seed-config.js';
import { seedAdmin } from './seed-admin.js';

const environment = loadRuntimeEnv();
const db = createDb(environment.DATABASE_URL);
const admin = getAdminSeedConfig(process.env);
const action = await seedAdmin(db, admin);
console.log(
  `${action === 'created' ? 'Created' : 'Updated'} configured admin user: ${admin.username}`,
);
process.exit(0);
