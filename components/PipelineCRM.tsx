"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export const PIPELINE_STAGES = [
  { key: "info_1", label: "Info 1ère soumission", couleur: "bg-slate-100 text-slate-800 border-slate-300", emoji: "📋" },
  { key: "rdv", label: "Rendez-vous à céduler", couleur: "bg-sky-100 text-sky-900 border-sky-300", emoji: "📅" },
  { key: "mesures", label: "Mesures et prise de photo", couleur: "bg-amber-100 text-amber-900 border-amber-300", emoji: "📐" },
  { key: "soum_envoyer", label: "Soumission à envoyer", couleur: "bg-orange-100 text-orange-900 border-orange-300", emoji: "✉️" },
  { key: "attente", label: "Projet en attente", couleur: "bg-violet-100 text-violet-900 border-violet-300", emoji: "⏳" },
  { key: "accepte", label: "Projet accepté", couleur: "bg-emerald-100 text-emerald-900 border-emerald-300", emoji: "✅" },
] as const;

export const STAGE_PAR_CLE: Record<string, typeof PIPELINE_STAGES[number]> = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, s])) as any;

interface Props { clients: any[]; onUpdate: () => void; }

export default function PipelineCRM({ clients, onUpdate }: Props) {
  const [recherche, setRecherche] = useState("");
  const [replies, setReplies] = useState<Set<string>>(new Set()); // sections repliées

  const changerStage = async (id: number, stage: string | null) => {
    await fetch("/api/clients", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, pipeline_stage: stage }),
    });
    onUpdate();
  };

  const filtres = useMemo(() => {
    if (!recherche.trim()) return clients;
    const q = recherche.toLowerCase();
    return clients.filter((c) =>
      [c.nom, c.courriel, c.telephone, c.adresse, c.notes].filter(Boolean).some((x: string) => x.toLowerCase().includes(q))
    );
  }, [clients, recherche]);

  const parStage = useMemo(() => {
    const m = new Map<string, any[]>();
    PIPELINE_STAGES.forEach((s) => m.set(s.key, []));
    m.set("__aucun__", []);
    for (const c of filtres) {
      const k = c.pipeline_stage && STAGE_PAR_CLE[c.pipeline_stage] ? c.pipeline_stage : "__aucun__";
      m.get(k)!.push(c);
    }
    return m;
  }, [filtres]);

  const toggle = (k: string) => {
    const n = new Set(replies);
    n.has(k) ? n.delete(k) : n.add(k);
    setReplies(n);
  };

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder="🔍 Rechercher dans le pipeline (nom, courriel, téléphone…)"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg text-sm"
      />

      {/* Vue desktop : colonnes kanban horizontales ; mobile : sections empilées */}
      <div className="lg:grid lg:grid-cols-3 xl:grid-cols-6 lg:gap-3 space-y-3 lg:space-y-0">
        {PIPELINE_STAGES.map((s) => {
          const items = parStage.get(s.key) || [];
          const replie = replies.has(s.key);
          return (
            <section key={s.key} className={`rounded-lg border-2 ${s.couleur} lg:min-h-[200px]`}>
              <button onClick={() => toggle(s.key)} className="w-full px-3 py-2 flex items-center justify-between font-bold text-sm lg:cursor-default">
                <span className="text-left">{s.emoji} {s.label}</span>
                <span className="ml-2 bg-white/70 text-slate-900 text-xs rounded-full px-2 py-0.5">{items.length}</span>
              </button>
              {(!replie || true) && ( // toujours déroulé en desktop ; mobile peut replier via toggle CSS
                <div className={`px-2 pb-2 space-y-2 ${replie ? "hidden lg:block" : ""}`}>
                  {items.length === 0 ? (
                    <div className="text-xs italic text-slate-500 px-2 py-3 text-center">Aucun client à cette étape.</div>
                  ) : items.map((c) => (
                    <CarteClient key={c.id} client={c} onMove={changerStage} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Clients sans étape de pipeline → bouton pour les ajouter */}
      {(parStage.get("__aucun__") || []).length > 0 && (
        <section className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-3">
          <h3 className="font-bold text-sm text-slate-700 mb-2">
            📥 À classer ({(parStage.get("__aucun__") || []).length})
            <span className="text-xs font-normal text-slate-500 ml-2">— clients sans étape de pipeline</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {(parStage.get("__aucun__") || []).map((c) => (
              <CarteClient key={c.id} client={c} onMove={changerStage} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CarteClient({ client, onMove }: { client: any; onMove: (id: number, stage: string | null) => void }) {
  return (
    <div className="bg-white rounded p-2 shadow-sm border border-slate-200">
      <Link href={`/clients/${client.id}`} className="font-semibold text-sm text-slate-900 hover:underline truncate block">{client.nom}</Link>
      <div className="text-xs text-slate-500 truncate">
        {client.telephone && <span>📞 {client.telephone}</span>}
        {client.telephone && client.adresse && <span> · </span>}
        {client.adresse && <span className="truncate">📍 {client.adresse}</span>}
      </div>
      {client.courriel && <div className="text-[10px] text-slate-400 truncate">{client.courriel}</div>}
      <select
        value={client.pipeline_stage || ""}
        onChange={(e) => onMove(client.id, e.target.value || null)}
        className="mt-1.5 w-full text-xs border rounded px-1.5 py-1 bg-white"
      >
        <option value="">— Retirer du pipeline —</option>
        {PIPELINE_STAGES.map((s) => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
      </select>
    </div>
  );
}
