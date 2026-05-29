"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import { useToast } from "@/components/Toasts";
import { compresserImage, genererVignette } from "@/lib/img";

export default function ParametresPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [profil, setProfil] = useState<any>(null);
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/profil").then((r) => r.ok ? r.json() : null).then((p) => { setProfil(p || { username: "" }); setChargement(false); });
  }, []);

  const sauver = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/profil", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profil) });
      if ((await r.json()).ok) toast("✓ Profil mis à jour", "success");
      else toast("Erreur de sauvegarde", "error");
    } finally { setBusy(false); }
  };

  const choisirPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast("Image seulement", "warning"); return; }
    if (f.size > 8 * 1024 * 1024) { toast("Image > 8 MB", "warning"); return; }
    try {
      // Vignette ~400px pour l'avatar (léger)
      const vignette = await genererVignette(f, 400, 0.8);
      setProfil({ ...profil, photo_data: vignette || (await compresserImage(f)), photo_type: "image/jpeg" });
    } catch (err: any) {
      toast("Erreur image : " + (err?.message || ""), "error");
    }
  };

  const deconnexion = async () => {
    if (!confirm("Te déconnecter de l'application ?")) return;
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
  };

  if (chargement) return (
    <div className="min-h-screen bg-slate-50">
      <Navigation titre="⚙️ Paramètres" />
      <main className="max-w-2xl mx-auto p-4 text-center text-slate-500">Chargement…</main>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation titre="⚙️ Paramètres" soustitre={profil?.username ? `Connecté en tant que ${profil.username}` : ""} />
      <main className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">

        {/* Profil */}
        <section className="bg-white rounded-lg shadow p-5 space-y-4">
          <h2 className="font-bold text-lg">👤 Mon profil</h2>

          <div className="flex items-center gap-4">
            <div className="relative">
              {profil.photo_data ? (
                <img src={profil.photo_data} alt="Photo de profil" className="w-20 h-20 rounded-full object-cover border-2 border-emerald-200" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold border-2 border-emerald-200">
                  {(profil.nom_affichage || profil.username || "?").trim()[0]}
                </div>
              )}
            </div>
            <div className="flex-1">
              <label className="cursor-pointer inline-block bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-bold">
                📷 Changer la photo
                <input type="file" accept="image/*" capture="user" className="hidden" onChange={choisirPhoto} />
              </label>
              {profil.photo_data && (
                <button onClick={() => setProfil({ ...profil, photo_data: null, photo_type: null })} className="ml-2 text-xs text-red-600 hover:underline">Retirer</button>
              )}
            </div>
          </div>

          <Field label="Utilisateur (login)" value={profil.username || ""} readOnly />
          <Field label="Nom d'affichage" value={profil.nom_affichage || ""} onChange={(v) => setProfil({ ...profil, nom_affichage: v })} placeholder="Ex: Francis Quinchon" />
          <Field label="Rôle" value={profil.role || ""} onChange={(v) => setProfil({ ...profil, role: v })} placeholder="Ex: Co-propriétaire" />
          <Field label="Courriel" value={profil.courriel || ""} onChange={(v) => setProfil({ ...profil, courriel: v })} placeholder="ex: revetementviking@gmail.com" />
          <Field label="Téléphone" value={profil.telephone || ""} onChange={(v) => setProfil({ ...profil, telephone: v })} placeholder="(438) 493-2041" />

          <button onClick={sauver} disabled={busy} className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold">
            {busy ? "Enregistrement…" : "💾 Enregistrer le profil"}
          </button>
        </section>

        {/* Mot de passe */}
        <section className="bg-white rounded-lg shadow p-5 space-y-2">
          <h2 className="font-bold text-lg">🔐 Mot de passe</h2>
          <p className="text-sm text-slate-600">
            Le mot de passe est stocké comme variable d'environnement Vercel pour des raisons de sécurité (pas modifiable directement depuis l'app).
            Pour le changer, va dans Vercel → <strong>revetement-viking-app</strong> → Settings → Environment Variables, et édite <code className="bg-slate-100 px-1 rounded">{profil.username === "Francis" ? "FRANCIS_PASSWORD" : "GABRIEL_PASSWORD"}</code> (ou <code className="bg-slate-100 px-1 rounded">APP_PASSWORD</code> si pas défini), puis redéploie.
          </p>
          <a href="https://vercel.com/revetementviking-specs-projects/revetement-viking-app/settings/environment-variables" target="_blank" rel="noreferrer" className="inline-block text-sm text-emerald-700 hover:underline">→ Ouvrir Vercel</a>
        </section>

        {/* Communications */}
        <section className="bg-white rounded-lg shadow p-5 space-y-1">
          <h2 className="font-bold text-lg">📧 Courriels sortants</h2>
          <p className="text-sm text-slate-600">Toutes les communications envoyées par l'app partent du compte <strong>revetementviking@gmail.com</strong> (variable Vercel <code className="bg-slate-100 px-1 rounded">GMAIL_USER</code>).</p>
        </section>

        {/* Déconnexion */}
        <section className="bg-white rounded-lg shadow p-5">
          <button onClick={deconnexion} className="w-full px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">
            🚪 Se déconnecter
          </button>
        </section>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, readOnly }: { label: string; value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full px-3 py-2 border rounded text-sm ${readOnly ? "bg-slate-50 text-slate-500" : ""}`}
      />
    </div>
  );
}
