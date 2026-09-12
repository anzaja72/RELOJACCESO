import os from "node:os";
import type { NextConfig } from "next";

function devOrigins() {
  const origins = new Set(["127.0.0.1", "localhost", "[::1]"]);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        origins.add(net.address);
      }
    }
  }
  for (const extra of (process.env.ALLOWED_DEV_ORIGINS ?? "").split(",")) {
    const host = extra.trim();
    if (host) origins.add(host);
  }
  return [...origins];
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: devOrigins(),
};

export default nextConfig;
