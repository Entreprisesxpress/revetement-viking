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

  // NOTE : @react-pdf/renderer est volontairement ABSENT de optimizePackageImports.
  // Il est maintenant aussi utilisé côté SERVEUR (régénération du PDF de contrat signé,
  // voir app/api/contrats-pipeline/[token]/route.ts) et le tree-shaking agressif de cette
  // option casse son moteur de rendu au runtime côté serveur ("Cannot read properties of
  // undefined (reading 'S')" — l'ajouter ici et à serverExternalPackages entre aussi en
  // conflit direct sous Turbopack). Si le bundle client redevient un problème, isoler cette
  // lib dans un chunk dédié plutôt que ré-ajouter l'option.

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
        // manifest.json : cache court (1h) — il peut changer (shortcuts, icônes)
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, must-revalidate" }],
      },
      {
        // Logo : cache 1 jour
        source: "/logo-viking.svg",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default nextConfig;
