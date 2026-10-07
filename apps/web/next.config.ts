import type { NextConfig } from "next";
import { config } from "dotenv";
import path from "node:path";

// env lives in a single .env at the repo root
config({ path: path.resolve(__dirname, "../../.env") });

const isStandalone = process.env.NEXT_OUTPUT_MODE === "standalone";

const nextConfig: NextConfig = {
  output: isStandalone ? "standalone" : "export",
  // Tauri serves the static bundle: directory-style paths resolve
  // to index.html, and there is no server to optimize images.
  ...(!isStandalone && { trailingSlash: true }),
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  // Shared React code for the desktop and online apps ships as TypeScript
  // source, so Next has to compile it instead of treating it as a dependency.
  transpilePackages: ["@cashier/web-core"],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "biscofa.runasp.net",
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
};

export default nextConfig;
