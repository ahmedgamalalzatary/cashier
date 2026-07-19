import type { NextConfig } from "next";
import { config } from "dotenv";
import path from "node:path";

// env lives in a single .env at the repo root
config({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
};

export default nextConfig;
