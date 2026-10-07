import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// web-core holds shared React code for the desktop and online Next apps. It is
// never a route module of its own, so the React and Next rules apply unchanged.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(["node_modules/**", "dist/**"]),
]);