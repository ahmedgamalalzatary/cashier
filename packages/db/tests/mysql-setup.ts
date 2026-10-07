import { migrateTestDatabase } from "./support/test-env.js";

export default async function setup() {
  await migrateTestDatabase();
}
