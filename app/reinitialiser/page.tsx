"use client";

// Page PUBLIQUE : choisir un nouveau mot de passe à partir du lien reçu (courriel ou Francis).
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { envoyer, lireJson } from "@/lib/envoi";

function Formulaire() {
  const params = useSearchParams();
  const jeton = params.get("jeton") || "";
  const [etat, setEtat] = useState<"verif" | "invalide" | "ok" | "fait">("verif");
  const [user, setUser] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState("");
  const [confirme, setConfirme] = useState("");
  const [erreur, setErreur] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!jeton) { setEtat("invalide"); return; }
    lireJson<{ valide: boolean; user?: string }>(`/api/auth/reinitialiser?jeton=${encodeURIComponent(jeton)}`).then((r) => {
      if (r.ok && r.data?.valide) { setUser(r.data.user || null); setEtat("ok"); } else setEtat("invalide");
    });
  }, [jeton]);

  const envoyerMdp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur("");
    if (nouveau !== confirme) { setErreur("Les deux mots de passe ne sont pas identiques."); return; }
    setBusy(true);
    const r = await envoyer("/api/auth/reinitialiser", { corps: { jeton, nouveau } });
    setBusy(false);
    if (!r.ok) { setErreur(r.data?.error || r.erreur || "Échec"); return; }
    setEtat("fait");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-8 space-y-5">
        <div className="text-center">
          <img src="/logo-viking.svg" alt="Revêtement Viking" className="h-20 w-20 mx-auto mb-2" />
          <h1 className="text-xl font-bold text-slate-900">Nouveau mot de passe</h1>
        </div>
        {etat === "verif" && <p className="text-sm text-slate-500 text-center">Vérification du lien…</p>}
        {etat === "invalide" && (
          <div className="text-sm text-red-700 bg-red-50 p-3 rounded">
            Ce lien est invalide ou expiré (il vaut 2 heures). Retourne à la <a href="/login" className="underline font-semibold">page de connexion</a> et redemande un lien, ou demande à Francis.
          </div>
        )}
        {etat === "fait" && (
          <div className="space-y-3 text-center">
            <div className="text-sm text-emerald-800 bg-emerald-50 p-3 rounded">✓ Mot de passe changé{user ? ` pour ${user}` : ""}.</div>
            <a href="/login" className="block w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold">Se connecter</a>
          </div>
        )}
        {etat === "ok" && (
          <form onSubmit={envoyerMdp} className="space-y-3">
            {user && <p className="text-sm text-slate-600 text-center">Pour le compte <strong>{user}</strong></p>}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nouveau mot de passe (8 caractères min.)</label>
              <input type="password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} autoFocus required minLength={8} autoComplete="new-password" className="w-full px-3 py-3 border-2 border-slate-200 focus:border-emerald-500 rounded text-base" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirme-le</label>
              <input type="password" value={confirme} onChange={(e) => setConfirme(e.target.value)} required minLength={8} autoComplete="new-password" className="w-full px-3 py-3 border-2 border-slate-200 focus:border-emerald-500 rounded text-base" />
            </div>
            {erreur && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{erreur}</div>}
            <button type="submit" disabled={busy} className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold disabled:opacity-50">
              {busy ? "Enregistrement…" : "Enregistrer le mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ReinitialiserPage() {
  return <Suspense fallback={null}><Formulaire /></Suspense>;
}
