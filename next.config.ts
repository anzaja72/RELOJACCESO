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
  async redirects() {
    // El enlace de las tablets es /kiosco; quien lo escriba con k (Kiosko, KIOSKO…) también llega.
    // Las fuentes de redirects no distinguen mayúsculas: nunca agregue una variante de /kiosco
    // (p. ej. /Kiosco), porque también atraparía /kiosco y lo redirigiría a sí mismo en bucle.
    return [{ source: "/kiosko", destination: "/kiosco", permanent: false }];
  },
  async headers() {
    // El navegador debe revisar sw.js en cada carga para que las actualizaciones lleguen.
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
