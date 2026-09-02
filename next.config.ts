import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  async rewrites() {
    // Optional self-hosted origin proxy. When KASHIN_ORIGIN_URL is set (for
    // example on a Vercel deployment that fronts a self-hosted instance), all
    // requests are proxied to that origin. Locally this stays empty so the app
    // runs standalone.
    const origin = process.env.KASHIN_ORIGIN_URL;
    if (!origin) return [];
    return {
      beforeFiles: [{ source: "/:path*", destination: `${origin}/:path*` }],
      afterFiles: [],
      fallback: [],
    };
  },
  experimental: {
    serverActions: {
      allowedOrigins: process.env.KASHIN_ALLOWED_ORIGIN
        ? process.env.KASHIN_ALLOWED_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
        : [],
    },
  },
};

export default nextConfig;
