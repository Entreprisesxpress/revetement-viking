import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  // (eslint config retirée : Next 16 ne l'accepte plus dans next.config — lint = étape séparée)

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

  // En-têtes globaux.
  // Note : on NE surcharge PAS /_next/static — Next applique déjà le cache
  // immutable correct sur les assets hashés (un override custom peut entrer
  // en conflit avec sa gestion).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [{ key: "X-DNS-Prefetch-Control", value: "on" }],
      },
      {
        // Logo + manifest + icônes : cache 30 jours
        source: "/:file(logo-viking.svg|manifest.json|icon-192.png|icon-512.png|icon-maskable.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
      },
    ];
  },
};

export default nextConfig;
