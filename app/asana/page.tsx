"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import { useToast } from "@/components/Toasts";

export default function AsanaPage() {
  const [statut, setStatut] = useState<any>(null);
  const [sync, setSync] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const verifier = async () => {
    const r = await fetch("/api/asana/sync");
    setStatut(await r.json());
  };

  useEffect(() => { verifier(); }, []);

  const synchroniser = async () => {
    setLoading(true);
    setSync(null);
    try {
      const r = await fetch("/api/asana/sync", { method: "POST" });
      const d = await r.json();
      setSync(d);
      if (d.ok) toast(`✓ ${d.crees} créés · ${d.majs} mis à jour · ${d.ignores} inchangés`, "success");
      else toast("Erreur : " + (d.error || "inconnue"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation titre="🔄 Sync Asana" soustitre="Synchronisation bidirectionnelle CRM ↔ Asana" />

      <main className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
        {/* Statut */}
        <section className={`rounded-lg shadow p-5 ${statut?.configure ? "bg-emerald-50 border-2 border-emerald-300" : "bg-amber-50 border-2 border-amber-300"}`}>
          <h2 className="font-bold text-lg mb-2">
            {statut?.configure ? "✅ Asana connecté" : "⚠️ Configuration requise"}
          </h2>
          {statut?.configure ? (
            <p className="text-sm text-emerald-900">L'app est connectée à ton compte Asana. La synchronisation est automatique pour les nouveaux clients créés/modifiés/supprimés dans l'app.</p>
          ) : (
            <div className="text-sm text-amber-900 space-y-2">
              <p>Pour activer la sync, ajoute ton Personal Access Token Asana dans Vercel :</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Va sur <a href="https://app.asana.com/0/my-apps" target="_blank" rel="noreferrer" className="font-bold underline">app.asana.com/0/my-apps</a></li>
                <li>Section "Personal Access Tokens" → <strong>+ Create new token</strong></li>
                <li>Copie le token</li>
                <li>Vercel : <a href="https://vercel.com/revetementviking-specs-projects/revetement-viking-app/settings/environment-variables" target="_blank" rel="noreferrer" className="font-bold underline">Settings → Environment Variables</a></li>
                <li>Ajoute <code className="bg-amber-200 px-1 rounded">ASANA_PAT</code> avec ton token (Production + Preview + Development)</li>
                <li>Redéploie</li>
              </ol>
            </div>
          )}
        </section>

        {/* Comment ça marche */}
        <section className="bg-white rounded-lg shadow p-5 space-y-3">
          <h2 className="font-bold">⚙️ Comment ça marche</h2>
          <div className="space-y-2 text-sm">
            <div className="flex gap-2"><span className="text-emerald-600 font-bold">→</span><div><strong>App → Asana :</strong> quand tu crées, modifies ou supprimes un client dans le CRM, la tâche Asana correspondante est créée/mise à jour/supprimée automatiquement dans le projet <em>Soumission 2026</em>.</div></div>
            <div className="flex gap-2"><span className="text-blue-600 font-bold">←</span><div><strong>Asana → App :</strong> les changements faits dans Asana sont récupérés quand tu cliques sur "Synchroniser" ci-dessous. Les tâches Asana plus récentes que la dernière sync écrasent les données du CRM.</div></div>
            <div className="flex gap-2"><span className="text-amber-600 font-bold">⚠</span><div><strong>Conflits :</strong> en cas de modification simultanée des deux côtés, la version Asana gagne (Asana est la source de vérité pour les leads).</div></div>
          </div>
        </section>

        {/* Bouton sync */}
        <section className="bg-white rounded-lg shadow p-5">
          <button
            onClick={synchroniser}
            disabled={loading || !statut?.configure}
            className="w-full px-4 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "⏳ Synchronisation en cours..." : "🔄 Synchroniser maintenant (Asana → App)"}
          </button>
          {sync && sync.ok && (
            <div className="mt-3 p-3 bg-emerald-50 rounded text-sm">
              <div className="font-bold text-emerald-900">✓ Sync terminée</div>
              <div className="text-emerald-800 mt-1">
                Total tâches Asana : <strong>{sync.total_taches_asana}</strong><br />
                Nouveaux clients créés : <strong>{sync.crees}</strong><br />
                Clients mis à jour : <strong>{sync.majs}</strong><br />
                Inchangés : <strong>{sync.ignores}</strong>
              </div>
            </div>
          )}
          {sync && sync.error && (
            <div className="mt-3 p-3 bg-red-50 rounded text-sm text-red-900">
              <strong>Erreur :</strong> {sync.error}
            </div>
          )}
        </section>

        {/* Auto-sync */}
        <section className="bg-white rounded-lg shadow p-5 space-y-2">
          <h2 className="font-bold">⏰ Sync automatique (option avancée)</h2>
          <p className="text-sm text-slate-700">Pour pull automatique d'Asana toutes les 15 minutes, ajoute un cron job dans Vercel :</p>
          <pre className="bg-slate-100 p-3 rounded text-xs overflow-x-auto"><code>{`// vercel.json
{
  "crons": [{
    "path": "/api/asana/sync",
    "schedule": "*/15 * * * *"
  }]
}`}</code></pre>
          <p className="text-xs text-slate-500">⚠️ Hobby Plan : 2 crons/jour max. Pro Plan : illimité.</p>
        </section>
      </main>
    </div>
  );
}
