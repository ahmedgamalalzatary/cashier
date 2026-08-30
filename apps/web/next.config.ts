import type { NextConfig } from "next";
import { config } from "dotenv";
import path from "node:path";

// env lives in a single .env at the repo root
config({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  output: "export",
  // Tauri serves the bundle off the file protocol: directory-style paths resolve
  // to index.html, and there is no server to optimize images.
  trailingSlash: true,
  images: { unoptimized: true },
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
};

export default nextConfig;
