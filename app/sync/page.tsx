"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import { useToast } from "@/components/Toasts";

export default function SyncPage() {
  const [drive, setDrive] = useState<any>(null);
  const [asana, setAsana] = useState<any>(null);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const charger = async () => {
    const [d, a] = await Promise.all([
      fetch("/api/drive").then((r) => r.json()).catch(() => ({ ok: false, message: "API indisponible" })),
      fetch("/api/asana/sync").then((r) => r.json()).catch(() => ({ configure: false })),
    ]);
    setDrive(d);
    setAsana(a);
  };

  useEffect(() => { charger(); }, []);

  const syncAsana = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/asana/sync", { method: "POST" });
      const d = await r.json();
      setSyncResult(d);
      if (d.ok) toast(`✓ ${d.crees} créés · ${d.majs} MAJ`, "success");
      else toast("Erreur : " + (d.error || "inconnue"), "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation titre="🔄 Synchronisations" soustitre="Google Drive · Asana" />

      <main className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
        {/* DRIVE */}
        <section className={`rounded-lg shadow p-5 border-2 ${drive?.ok ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300"}`}>
          <h2 className="font-bold text-lg mb-2 flex items-center gap-2">
            <span>📁 Google Drive</span>
            {drive?.ok && <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded">Connecté</span>}
          </h2>
          {drive?.ok ? (
            <div className="text-sm text-emerald-900 space-y-1">
              <div>✅ Dossier : <strong>{drive.folder}</strong></div>
              <div>📧 Service Account : <code className="text-xs bg-white px-2 py-0.5 rounded">{drive.email}</code></div>
              <p className="mt-2 text-xs text-slate-700">Chaque photo / facture / contrat ajouté dans l'app est automatiquement copié dans Drive. Sous-dossier par projet créé auto.</p>
            </div>
          ) : (
            <div className="text-sm text-amber-900 space-y-2">
              <p>⚠️ {drive?.message || "Drive non configuré"}</p>
              <details className="text-xs">
                <summary className="cursor-pointer font-bold">Configuration Drive (5 étapes)</summary>
                <ol className="list-decimal list-inside mt-2 space-y-1 ml-2">
                  <li>Console Google Cloud → projet "Revetement Viking App" (déjà créé)</li>
                  <li>Service Account "viking-drive-sync" (déjà créé) → onglet <strong>Clés</strong> → Ajouter une clé → JSON → télécharger</li>
                  <li>Drive → créer dossier "Revêtement Viking — App"</li>
                  <li>Partager le dossier avec <code>viking-drive-sync@revetement-viking-app.iam.gserviceaccount.com</code> (Éditeur)</li>
                  <li>Vercel env vars : <code>GOOGLE_SA_JSON</code> (contenu fichier) + <code>GOOGLE_DRIVE_FOLDER_ID</code> (ID dossier dans l'URL)</li>
                </ol>
              </details>
            </div>
          )}
        </section>

        {/* ASANA */}
        <section className={`rounded-lg shadow p-5 border-2 ${asana?.configure ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300"}`}>
          <h2 className="font-bold text-lg mb-2 flex items-center gap-2">
            <span>📋 Asana</span>
            {asana?.configure && <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded">Connecté</span>}
          </h2>
          {asana?.configure ? (
            <div className="text-sm text-emerald-900 space-y-2">
              <p>✅ ASANA_PAT configuré</p>
              <p className="text-xs">Création/modification client dans le CRM → push auto vers Asana<br />
              Pour pull Asana → CRM, clique le bouton ci-dessous :</p>
              <button onClick={syncAsana} disabled={loading} className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold disabled:opacity-50">
                {loading ? "⏳ Synchronisation..." : "🔄 Pull Asana → CRM"}
              </button>
              {syncResult?.ok && (
                <div className="bg-white rounded p-2 text-xs">
                  Total tâches Asana : <strong>{syncResult.total_taches_asana}</strong> · Créés : <strong>{syncResult.crees}</strong> · MAJ : <strong>{syncResult.majs}</strong> · Inchangés : <strong>{syncResult.ignores}</strong>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-amber-900 space-y-2">
              <p>⚠️ ASANA_PAT non configuré dans Vercel</p>
              <ol className="list-decimal list-inside text-xs space-y-1 ml-2">
                <li><a href="https://app.asana.com/0/my-apps" target="_blank" rel="noreferrer" className="underline font-bold">app.asana.com/0/my-apps</a></li>
                <li>"+ Create new token" → nom : Revetement Viking App → Create</li>
                <li>Copie le token (commence par 2/...)</li>
                <li><a href="https://vercel.com/revetementviking-specs-projects/revetement-viking-app/settings/environment-variables" target="_blank" rel="noreferrer" className="underline font-bold">Vercel env vars</a></li>
                <li>Add <code>ASANA_PAT</code> = (ton token) → Production+Preview+Development → Save</li>
                <li>Redeploy</li>
              </ol>
            </div>
          )}
        </section>

        {/* Sync en temps réel */}
        <section className="bg-white rounded-lg shadow p-5">
          <h3 className="font-bold mb-2">⏰ Sync automatique (cron)</h3>
          <p className="text-sm text-slate-700 mb-2">Pour pull Asana toutes les 15 min automatiquement, ajoute <code>vercel.json</code> à la racine du projet :</p>
          <pre className="bg-slate-100 p-3 rounded text-xs overflow-x-auto">{`{
  "crons": [{
    "path": "/api/asana/sync",
    "schedule": "*/15 * * * *"
  }]
}`}</pre>
          <p className="text-xs text-slate-500 mt-2">⚠️ Vercel Hobby Plan limite à 2 crons/jour. Pour 96 syncs/jour (toutes 15 min), Pro Plan (20$/mois) requis.</p>
        </section>

        {/* Statut tableau */}
        <section className="bg-white rounded-lg shadow p-5">
          <h3 className="font-bold mb-3">📊 État des sauvegardes auto</h3>
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr><th className="p-2 text-left">Données</th><th className="p-2 text-center">DB Turso</th><th className="p-2 text-center">Drive</th><th className="p-2 text-center">Asana</th></tr>
            </thead>
            <tbody>
              <tr className="border-t"><td className="p-2">📸 Photos chantier</td><td className="p-2 text-center">✅</td><td className="p-2 text-center">{drive?.ok ? "✅ Auto" : "—"}</td><td className="p-2 text-center">—</td></tr>
              <tr className="border-t"><td className="p-2">💸 Dépenses (reçus)</td><td className="p-2 text-center">✅</td><td className="p-2 text-center">{drive?.ok ? "🚧 À venir" : "—"}</td><td className="p-2 text-center">—</td></tr>
              <tr className="border-t"><td className="p-2">📝 Contrats PDF</td><td className="p-2 text-center">✅</td><td className="p-2 text-center">{drive?.ok ? "🚧 À venir" : "—"}</td><td className="p-2 text-center">—</td></tr>
              <tr className="border-t"><td className="p-2">👥 Clients / CRM</td><td className="p-2 text-center">✅</td><td className="p-2 text-center">—</td><td className="p-2 text-center">{asana?.configure ? "✅ Bi-directionnel" : "—"}</td></tr>
              <tr className="border-t"><td className="p-2">📌 Tâches / Relances</td><td className="p-2 text-center">✅</td><td className="p-2 text-center">—</td><td className="p-2 text-center">{asana?.configure ? "🚧 À venir" : "—"}</td></tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
