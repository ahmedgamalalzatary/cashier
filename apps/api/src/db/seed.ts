// Creates the initial admin user if no users exist. Run: pnpm db:seed
import '../env.js';
import { createDb } from './index.js';
import { getAdminSeedConfig } from './seed-config.js';
import { seedAdmin } from './seed-admin.js';

const db = createDb();
const admin = getAdminSeedConfig(process.env);
const action = await seedAdmin(db, admin);
console.log(`${action === 'created' ? 'Created' : 'Updated'} configured admin user: ${admin.username}`);
process.exit(0);
