import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // Compression gzip/brotli activée
  compress: true,

  // Strip console.log en prod (garde error/warn) — bundle plus léger + moins de bruit
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },

  // Tree-shake agressif sur libs lourdes — Next ne charge que les exports utilisés
  experimental: {
    optimizePackageImports: ["@react-pdf/renderer"],
  },

  // En-têtes globaux : cache long pour les statics (Next garantit hash → invalidation auto)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        source: "/_next/static/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/icon-:size(\\d+).png",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000, immutable" }],
      },
      {
        source: "/logo-viking.svg",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
