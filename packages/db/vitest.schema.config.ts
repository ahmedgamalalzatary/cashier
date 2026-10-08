import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/mysql/schema.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    // Same reasoning as vitest.mysql.config.ts: a fresh database plus every
    // migration outlasts 30s whenever the rest of the suite shares the MySQL.
    hookTimeout: 120_000,
  },
});
