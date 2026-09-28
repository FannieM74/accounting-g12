import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // server-optimized native modules must not be bundled
  serverExternalPackages: ["@node-rs/argon2", "@libsql/client"],
  // local dev: proxy API calls to the Go backend (npm run dev:go)
  ...(process.env.GO_API
    ? { rewrites: async () => [{ source: "/api/:path*", destination: `${process.env.GO_API}/api/:path*` }] }
    : {}),
};

export default nextConfig;
