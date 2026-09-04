"use client";

import { useEffect, useState } from "react";
import {
  NOUVEAUTES, CONNEXIONS_AFFICHAGE, type Nouveaute,
  derniereVersion, nouveautesNonVues, encoreAffichable, dateLisible,
} from "@/lib/nouveautes";

/**
 * Carte « Nouveautés » du tableau de bord.
 *
 * Montre à chaque personne les blocs de lib/nouveautes.ts qu'elle n'a pas encore vus,
 * pendant CONNEXIONS_AFFICHAGE connexions (une connexion = une session du navigateur),
 * puis s'efface d'elle-même. Fermer = tout marquer comme vu. Compté par appareil
 * (localStorage) : chaque téléphone, chaque poste voit les nouveautés une fois.
 *
 * Pour annoncer quelque chose : ajouter un bloc en tête de NOUVEAUTES. Rien à toucher ici.
 */
const CLE_VUE = "nouveautes:vue";
const CLE_ANCIENNE_JUIN = "nouveaute:2026-06-heures:vues";
const VERSION_JUIN = "2026-06-03";

export default function BanniereNouveaute() {
  const [blocs, setBlocs] = useState<Nouveaute[]>([]);
  const [anciensOuverts, setAnciensOuverts] = useState(false);

  useEffect(() => {
    try {
      const derniere = derniereVersion();
      if (!derniere) return;

      // Migration de l'ancienne bannière (une seule annonce, juin 2026) : qui l'a vue
      // n'a pas besoin de la revoir.
      if (!localStorage.getItem(CLE_VUE) && localStorage.getItem(CLE_ANCIENNE_JUIN)) {
        localStorage.setItem(CLE_VUE, VERSION_JUIN);
      }

      const nonVues = nouveautesNonVues(localStorage.getItem(CLE_VUE));
      if (nonVues.length === 0) return;

      // Une connexion = une session. On compte une fois par session, pour la version courante.
      const cleConnexions = `nouveautes:${derniere}:connexions`;
      const cleSession = `nouveautes:${derniere}:session`;
      let connexions = parseInt(localStorage.getItem(cleConnexions) || "0", 10) || 0;
      if (!sessionStorage.getItem(cleSession)) {
        connexions += 1;
        localStorage.setItem(cleConnexions, String(connexions));
        sessionStorage.setItem(cleSession, "1");
      }

      if (encoreAffichable(connexions)) {
        setBlocs(nonVues);
      } else {
        // Assez montré : on considère tout comme vu.
        localStorage.setItem(CLE_VUE, derniere);
      }
    } catch { /* stockage indisponible (navigation privée stricte) — on n'affiche rien */ }
  }, []);

  const fermer = () => {
    try { localStorage.setItem(CLE_VUE, derniereVersion()); } catch {}
    setBlocs([]);
  };

  if (blocs.length === 0) return null;
  const [recent, ...anciens] = blocs;

  return (
    <section
      aria-label="Nouveautés de l'application"
      className="bg-white rounded-lg shadow border-l-4 border-blue-500 p-4 md:p-5"
      data-nouveautes={recent.version}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">✨ Nouveautés depuis votre dernière visite</p>
          <h2 className="text-lg font-bold text-slate-900 mt-1">{recent.titre}</h2>
          <p className="text-xs text-slate-500">{dateLisible(recent.version)}</p>
        </div>
        <button
          onClick={fermer}
          aria-label="Fermer les nouveautés"
          title="Fermer — ne plus afficher ces nouveautés"
          className="flex-shrink-0 w-11 h-11 -mr-2 -mt-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center text-xl leading-none"
        >
          ✕
        </button>
      </div>

      <ul className="mt-3 space-y-1.5 text-sm text-slate-700 list-disc pl-5">
        {recent.points.map((p, i) => <li key={i}>{p}</li>)}
      </ul>

      {anciens.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setAnciensOuverts((v) => !v)}
            aria-expanded={anciensOuverts}
            className="text-sm font-medium text-blue-700 hover:underline min-h-10 px-1"
          >
            {anciensOuverts ? "Masquer" : "Voir aussi"} {anciens.length === 1 ? "la mise à jour précédente" : `les ${anciens.length} mises à jour précédentes`}
          </button>
          {anciensOuverts && anciens.map((b) => (
            <div key={b.version} className="mt-2 pl-3 border-l-2 border-slate-200">
              <p className="text-sm font-semibold text-slate-800">{b.titre} <span className="font-normal text-xs text-slate-500">· {dateLisible(b.version)}</span></p>
              <ul className="mt-1 space-y-1 text-sm text-slate-600 list-disc pl-5">
                {b.points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Cette carte s'affiche à vos {CONNEXIONS_AFFICHAGE} prochaines connexions, ou jusqu'à ce que vous la fermiez.
      </p>
    </section>
  );
}
