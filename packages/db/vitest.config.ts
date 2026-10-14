import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `pnpm test` runs every package at once; on a busy PC a test that takes
    // under a second alone can pass the 5s default
    testTimeout: 30_000,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/mysql/**"],
  },
});
