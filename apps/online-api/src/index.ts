import { loadOnlineEnv } from "./env.js";
import { createApp } from "./app.js";
import { createDb, getAdminSeedConfig, syncConfiguredAdmin } from "@cashier/db";

const environment = loadOnlineEnv();
const db = createDb(environment.DATABASE_URL);

// The super-admin comes from .env.production and is synchronized on every
// start; sessions survive unless the password actually changed (plan Q7).
// The configured seed is built through getAdminSeedConfig so this start also
// warns about a password bcrypt cannot hold, the way the other API does.
const syncResult = await syncConfiguredAdmin(
  db,
  getAdminSeedConfig({
    ADMIN_NAME: environment.ADMIN_NAME,
    ADMIN_USERNAME: environment.ADMIN_USERNAME,
    ADMIN_PASSWORD: environment.ADMIN_PASSWORD,
  }),
);
if (syncResult !== "unchanged") {
  console.log(`Admin account ${syncResult} from environment configuration`);
}

createApp(db, {
  jwtSecret: environment.JWT_SECRET,
  corsOrigins: environment.CORS_ORIGIN,
  trustProxy: environment.TRUST_PROXY,
}).listen(environment.PORT, () => {
  console.log(`Online API listening on http://localhost:${environment.PORT}`);
});
