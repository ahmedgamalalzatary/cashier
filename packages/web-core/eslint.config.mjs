import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// web-core holds shared React code for the desktop and online Next apps. It is
// never a route module of its own, so it has no Pages directory to inspect.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
  globalIgnores(["node_modules/**", "dist/**"]),
]);
