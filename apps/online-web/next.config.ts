import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The online site is a server: Nginx serves it and forwards /api to online-api
  // on the same origin, so every browser request stays same-origin.
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  // Shared React code for the desktop and online apps ships as TypeScript
  // source, so Next has to compile it instead of treating it as a dependency.
  transpilePackages: ["@cashier/web-core"],
  images: { unoptimized: true },
  env: {
    // Empty means "same origin": web-core then calls "/api/..." on this host.
    NEXT_PUBLIC_API_URL: "",
  },
  // Local development only: Nginx is the same-origin proxy in production, so
  // the dev server forwards /api to a locally running online-api.
  ...(process.env.NODE_ENV === "development" && {
    async rewrites() {
      return [
        { source: "/api/:path*", destination: "http://127.0.0.1:4001/api/:path*" },
      ];
    },
  }),
};

export default nextConfig;