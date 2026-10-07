// Creates the initial admin user if no users exist. Run: pnpm db:seed
// This entry point stays in the API because it needs the API's runtime
// environment (root .env + full validation); the seeding itself lives in
// @cashier/db so the online API can reuse it.
import { loadRuntimeEnv } from '../env.js';
import { createDb, getAdminSeedConfig, seedAdmin } from '@cashier/db';

const environment = loadRuntimeEnv();
const db = createDb(environment.DATABASE_URL);
const admin = getAdminSeedConfig(process.env);
const action = await seedAdmin(db, admin);
console.log(
  `${action === 'created' ? 'Created' : 'Updated'} configured admin user: ${admin.username}`,
);
process.exit(0);
