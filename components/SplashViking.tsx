"use client";

import { useEffect, useRef, useState } from "react";
import { jouerCorneViking } from "@/lib/son-viking";

/**
 * Écran d'ouverture : le drakkar arrive sur la mer, la corne sonne, le titre apparaît,
 * puis tout s'efface. UNE fois par ouverture de l'app (session du navigateur), jamais sur
 * les pages publiques (signature client, présentation).
 *
 * Son : joué tout de suite quand le navigateur le permet (PWA installée, site déjà
 * utilisé) ; sinon, au premier toucher sur l'écran d'ouverture. Toucher = passer.
 */
const DUREE_MS = 2600;
const SORTIE_MS = 450;
const CLE_SESSION = "splash:vu";

function pagePublique(p: string): boolean {
  return p.startsWith("/soumission/") || p.startsWith("/contrat/") || p.startsWith("/projet/") || p.startsWith("/maintenance");
}

export default function SplashViking() {
  const [etat, setEtat] = useState<"cache" | "visible" | "sortie">("cache");
  const sonJoue = useRef(false);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fermer = () => {
    setEtat((e) => (e === "visible" ? "sortie" : e));
    setTimeout(() => setEtat("cache"), SORTIE_MS);
  };

  useEffect(() => {
    try {
      if (pagePublique(window.location.pathname)) return;
      if (sessionStorage.getItem(CLE_SESSION)) return;
      sessionStorage.setItem(CLE_SESSION, "1");
    } catch { return; }
    setEtat("visible");
    jouerCorneViking().then((ok) => { if (ok) sonJoue.current = true; });
    minuterie.current = setTimeout(fermer, DUREE_MS);
    return () => { if (minuterie.current) clearTimeout(minuterie.current); };
  }, []);

  const toucher = () => {
    if (etat !== "visible") return;
    if (minuterie.current) clearTimeout(minuterie.current);
    if (!sonJoue.current) {
      // Le son avait été bloqué : ce toucher est le geste qui l'autorise. On le laisse
      // sonner un instant avant de partir.
      sonJoue.current = true;
      jouerCorneViking();
      minuterie.current = setTimeout(fermer, 1400);
      return;
    }
    fermer();
  };

  if (etat === "cache") return null;

  return (
    <div
      role="presentation"
      onPointerDown={toucher}
      data-splash={etat}
      className={`vk-splash fixed inset-0 z-[300] flex flex-col items-center justify-center pb-32 md:pb-40 select-none cursor-pointer ${etat === "sortie" ? "vk-splash-sortie" : ""}`}
      style={{ background: "radial-gradient(ellipse at 50% 30%, #1e3a5f 0%, #0f172a 55%, #060b16 100%)" }}
    >
      {/* Ciel : quelques étoiles */}
      <div className="vk-etoiles absolute inset-0" aria-hidden />

      {/* Le drakkar, qui arrive de la gauche et tangue */}
      <div className="vk-navigue relative z-10" aria-hidden>
        <img src="/logo-viking.svg" alt="" className="vk-tangue h-36 w-36 md:h-48 md:w-48 brightness-0 invert drop-shadow-[0_0_24px_rgba(148,163,184,0.35)]" />
      </div>

      {/* La mer : deux nappes de vagues qui défilent */}
      <svg className="vk-vagues absolute left-0 right-0 w-[200%]" style={{ bottom: "14%" }} viewBox="0 0 1600 60" preserveAspectRatio="none" aria-hidden>
        <path className="vk-vague-lente" fill="#1e3a5f" d="M0 30 Q100 0 200 30 T400 30 T600 30 T800 30 T1000 30 T1200 30 T1400 30 T1600 30 V60 H0 Z" />
      </svg>
      <svg className="vk-vagues absolute left-0 right-0 w-[200%]" style={{ bottom: "9%" }} viewBox="0 0 1600 60" preserveAspectRatio="none" aria-hidden>
        <path className="vk-vague-rapide" fill="#0b1a33" d="M0 35 Q80 10 160 35 T320 35 T480 35 T640 35 T800 35 T960 35 T1120 35 T1280 35 T1440 35 T1600 35 V60 H0 Z" />
      </svg>
      <div className="absolute left-0 right-0 bottom-0" style={{ height: "9%", background: "#060b16" }} aria-hidden />

      {/* Le nom, qui apparaît après l'arrivée du bateau */}
      <div className="vk-titre relative z-10 mt-6 text-center">
        <p className="text-white text-3xl md:text-4xl font-bold tracking-[0.18em] uppercase">Revêtement Viking</p>
        <p className="text-slate-400 text-xs md:text-sm tracking-[0.3em] uppercase mt-2">Revêtement extérieur</p>
      </div>

      <p className="vk-titre absolute bottom-3 text-slate-500 text-xs tracking-wide">Toucher pour passer</p>
    </div>
  );
}
