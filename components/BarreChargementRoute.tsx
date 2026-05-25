"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Affiche une barre fine animée en haut pendant les transitions de route Next.js. */
export default function BarreChargementRoute() {
  const pathname = usePathname();
  const [actif, setActif] = useState(false);

  useEffect(() => {
    setActif(true);
    const t = setTimeout(() => setActif(false), 350);
    return () => clearTimeout(t);
  }, [pathname]);

  // Détecte aussi les fetchs en cours (heuristique : on s'arme uniquement sur clic d'un <a>)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest("a[href]") as HTMLAnchorElement | null;
      if (a && a.target !== "_blank" && a.host === window.location.host) {
        setActif(true);
        // sécurité : éteint après 5s max
        setTimeout(() => setActif(false), 5000);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-0.5 z-[100] pointer-events-none"
      style={{ opacity: actif ? 1 : 0, transition: "opacity 200ms" }}
    >
      <div
        className="h-full bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500"
        style={{
          width: actif ? "85%" : "0%",
          transition: actif ? "width 350ms cubic-bezier(0.4,0,0.2,1)" : "width 100ms",
          boxShadow: "0 0 10px rgba(16,185,129,0.6)",
        }}
      />
    </div>
  );
}
