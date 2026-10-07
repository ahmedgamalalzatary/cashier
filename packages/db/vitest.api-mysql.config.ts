import { defineConfig } from "vitest/config";
import mysqlConfig from "./vitest.mysql.config.js";

export default defineConfig({
  ...mysqlConfig,
  test: {
    ...mysqlConfig.test,
    include: ["tests/mysql/**/*.test.ts"],
    exclude: mysqlConfig.test!.include,
    globalSetup: ["./tests/api-mysql-setup.ts"],
    env: { CASHIER_TEST_DATABASE_NAME: "cashier_api_test" },
  },
});
