import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `pnpm test` runs every package at once; on a busy PC a test that takes
    // under a second alone can pass the 5s default
    testTimeout: 30_000,
  },
  // mirror the "@/*" path alias from tsconfig.json
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
