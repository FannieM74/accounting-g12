import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // server-optimized native modules must not be bundled
  serverExternalPackages: ["@node-rs/argon2", "@libsql/client"],
};

export default nextConfig;
