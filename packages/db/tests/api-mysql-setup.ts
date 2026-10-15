import { prepareScratchDatabases } from "./support/scratch-database.js";
import { migrateTestDatabase } from "./support/test-env.js";

export default async function setup() {
  await Promise.all([
    migrateTestDatabase("cashier_api_test"),
    prepareScratchDatabases(),
  ]);
}
