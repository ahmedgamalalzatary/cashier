import { loadOnlineEnv } from "./env.js";
import { createApp } from "./app.js";
import { createDb, syncConfiguredAdmin } from "@cashier/db";

const environment = loadOnlineEnv();
const db = createDb(environment.DATABASE_URL);

// The super-admin comes from .env.production and is synchronized on every
// start; sessions survive unless the password actually changed (plan Q7).
const syncResult = await syncConfiguredAdmin(db, {
  name: environment.ADMIN_NAME,
  username: environment.ADMIN_USERNAME,
  password: environment.ADMIN_PASSWORD,
});
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