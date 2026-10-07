import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/mysql/**/*.test.ts"],
    globalSetup: ["./tests/mysql-setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
