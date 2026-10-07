import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/mysql/schema.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 30_000,
  },
});
