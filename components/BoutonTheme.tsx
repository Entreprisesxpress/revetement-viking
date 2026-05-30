"use client";

import { useEffect, useState } from "react";

const CLE = "vk-theme";

/** Bouton 🌙/☀️ qui bascule mode sombre/clair, persiste dans localStorage. */
export default function BoutonTheme() {
  const [sombre, setSombre] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem(CLE);
    const auto = t == null && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    appliquer(t === "dark" || !!auto);
  }, []);

  const appliquer = (sombreV: boolean) => {
    setSombre(sombreV);
    if (sombreV) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem(CLE, "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem(CLE, "light");
    }
  };

  return (
    <button
      type="button"
      onClick={() => appliquer(!sombre)}
      className="p-1.5 rounded hover:bg-slate-100 transition text-base"
      title={sombre ? "Passer en mode clair" : "Passer en mode sombre"}
      aria-label="Basculer le thème"
    >
      {sombre ? "☀️" : "🌙"}
    </button>
  );
}
