import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/mysql/seed-admin.test.ts",
      "tests/mysql/timezone.test.ts",
      "tests/mysql/schema.test.ts",
    ],
    globalSetup: ["./tests/mysql-setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    // schema.test.ts creates a scratch database and applies every migration to
    // it. That takes ~14s on its own, but the full suite runs the other packages
    // against the same local MySQL at the same time, which pushes it past the
    // 30s default and fails the run for no reason.
    hookTimeout: 120_000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
