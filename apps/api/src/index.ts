import { loadRuntimeEnv } from './env.js';
import { createApp } from './app.js';
import { createDb, getAdminSeedConfig, syncConfiguredAdmin } from '@cashier/db';

const environment = loadRuntimeEnv();
const db = createDb(environment.DATABASE_URL);

const syncResult = await syncConfiguredAdmin(db, getAdminSeedConfig(process.env));
if (syncResult !== 'unchanged') {
  console.log(`Admin account ${syncResult} from environment configuration`);
}

createApp(db, {
  jwtSecret: environment.JWT_SECRET,
  corsOrigins: environment.CORS_ORIGIN,
  trustProxy: environment.TRUST_PROXY,
}).listen(environment.PORT, () => {
  console.log(`API listening on http://localhost:${environment.PORT}`);
});
