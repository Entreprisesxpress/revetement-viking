"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import { useToast } from "@/components/Toasts";
import { compresserImage, genererVignette } from "@/lib/img";
import { ecrire, envoyer, lireJson } from "@/lib/envoi";
import { purgerLocal } from "@/lib/purge-locale";
import { confirmerDeconnexion } from "@/lib/deconnexion";
import ErreurChargement from "@/components/ErreurChargement";

export default function ParametresPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [profil, setProfil] = useState<any>(null);
  const [chargement, setChargement] = useState(true);
  const [erreurProfil, setErreurProfil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Avant : un 500 ou un réseau coupé laissait « Chargement… » à vie (promesse rejetée,
  // jamais de setChargement(false)). Ici : état d'erreur affiché, avec « Réessayer ».
  const chargerProfil = async () => {
    setChargement(true);
    setErreurProfil(null);
    const r = await lireJson<any>("/api/auth/profil");
    if (r.ok) setProfil(r.data || { username: "" });
    else setErreurProfil(r.erreur);
    setChargement(false);
  };
  useEffect(() => { chargerProfil(); }, []);

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
    if (f.size > 8 * 1024 * 1024) { toast("Image > 8 Mo", "warning"); return; }
    try {
      // Vignette ~400px pour l'avatar (léger)
      const vignette = await genererVignette(f, 400, 0.8);
      setProfil({ ...profil, photo_data: vignette || (await compresserImage(f)), photo_type: "image/jpeg" });
    } catch (err: any) {
      toast("Erreur image : " + (err?.message || ""), "error");
    }
  };

  const deconnexion = async () => {
    if (!(await confirmerDeconnexion("Te déconnecter de l'application ?"))) return;
    if (!(await ecrire("/api/login", "DELETE", undefined, "Suppression"))) return;
    // Rien de l'usager ne doit rester sur l'appareil (cache, brouillons, file hors-ligne).
    await purgerLocal();
    router.replace("/login");
  };

  if (chargement || erreurProfil || !profil) return (
    <div className="min-h-screen bg-slate-50">
      <Navigation titre="⚙️ Paramètres" />
      <main className="max-w-2xl mx-auto p-4 text-center text-slate-500">
        {chargement ? "Chargement…" : <ErreurChargement erreur={erreurProfil || "profil vide"} onReessayer={chargerProfil} />}
      </main>
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

        {/* Mot de passe (géré dans l'app depuis le 2026-10-13) */}
        <MotDePasseSection />

        {/* Comptes des autres usagers : réservé à Francis */}
        {profil.username === "Francis" && <ComptesSection />}

        {/* Communications */}
        <section className="bg-white rounded-lg shadow p-5 space-y-1">
          <h2 className="font-bold text-lg">📧 Courriels sortants</h2>
          <p className="text-sm text-slate-600">Toutes les communications envoyées par l'app partent du compte <strong>revetementviking@gmail.com</strong> (variable Vercel <code className="bg-slate-100 px-1 rounded">GMAIL_USER</code>).</p>
        </section>

        {/* Notifications push */}
        <PushSection />

        {/* Mode maintenance */}
        <MaintenanceSection />

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

/** Changer SON mot de passe : actuel + nouveau + confirmation. */
function MotDePasseSection() {
  const { toast } = useToast();
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirme, setConfirme] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const changer = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (nouveau !== confirme) { setMsg("Les deux nouveaux mots de passe ne sont pas identiques."); return; }
    setBusy(true);
    const r = await envoyer("/api/auth/mdp", { corps: { actuel, nouveau } });
    setBusy(false);
    if (!r.ok) { setMsg(r.data?.error || r.erreur || "Échec"); return; }
    setActuel(""); setNouveau(""); setConfirme("");
    toast("✓ Mot de passe changé", "success");
    setMsg("✓ Mot de passe changé. Tes autres appareils restent connectés ; pour les déconnecter tous, Francis change SESSION_SECRET sur Vercel.");
  };
  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      <h2 className="font-bold text-lg">🔐 Mot de passe</h2>
      <form onSubmit={changer} className="space-y-2">
        <Field label="Mot de passe actuel" value={actuel} onChange={setActuel} type="password" autoComplete="current-password" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Nouveau (8 caractères min.)" value={nouveau} onChange={setNouveau} type="password" autoComplete="new-password" />
          <Field label="Confirme le nouveau" value={confirme} onChange={setConfirme} type="password" autoComplete="new-password" />
        </div>
        {msg && <div className={`text-sm p-2 rounded ${msg.startsWith("✓") ? "text-emerald-800 bg-emerald-50" : "text-red-700 bg-red-50"}`}>{msg}</div>}
        <button type="submit" disabled={busy || !actuel || !nouveau} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold">{busy ? "Enregistrement…" : "Changer mon mot de passe"}</button>
      </form>
      <p className="text-[11px] text-slate-500">Mot de passe oublié ? Sur la page de connexion, « Mot de passe oublié ? » envoie un lien au courriel de ton profil (ci-dessus). Sans courriel, Francis peut te remettre un lien.</p>
    </section>
  );
}

/** Francis seulement : état des comptes, lien de réinitialisation, nouveau mot de passe. */
function ComptesSection() {
  const { toast } = useToast();
  const [data, setData] = useState<{ comptes: any[]; courriel_configure: boolean } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lien, setLien] = useState<{ user: string; url: string; detail: string } | null>(null);
  const [mdpPour, setMdpPour] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState("");
  const [busy, setBusy] = useState(false);
  const charger = () => lireJson<any>("/api/auth/comptes").then((r) => { if (r.ok) { setData(r.data); setErreur(null); } else setErreur(r.erreur); });
  useEffect(() => { charger(); }, []);
  const envoyerLien = async (user: string) => {
    setBusy(true); setLien(null);
    const r = await envoyer<any>("/api/auth/comptes", { corps: { user, action: "lien" } });
    setBusy(false);
    if (!r.ok) { toast(`Lien non émis : ${r.data?.error || r.erreur}`, "error"); return; }
    setLien({ user, url: r.data.url, detail: r.data.detail });
    toast(r.data.envoye ? `✓ Lien envoyé à ${user}` : `Lien prêt pour ${user} — copie-le`, r.data.envoye ? "success" : "info");
    charger();
  };
  const poserMdp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mdpPour) return;
    setBusy(true);
    const r = await envoyer("/api/auth/comptes", { corps: { user: mdpPour, action: "mdp", nouveau } });
    setBusy(false);
    if (!r.ok) { toast(r.data?.error || r.erreur || "Échec", "error"); return; }
    toast(`✓ Mot de passe de ${mdpPour} changé`, "success");
    setMdpPour(null); setNouveau("");
    charger();
  };
  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      <h2 className="font-bold text-lg">👥 Comptes <span className="text-xs font-normal text-slate-500">— réservé à Francis</span></h2>
      {erreur && <ErreurChargement erreur={erreur} onReessayer={charger} />}
      {data && !data.courriel_configure && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">L'envoi de courriel n'est pas configuré sur le serveur : les liens ne partent pas tout seuls, mais tu peux les copier et les envoyer par texto.</p>
      )}
      <div className="space-y-2">
        {(data?.comptes || []).map((c) => (
          <div key={c.username} className="border rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold">{c.username}</div>
                <div className="text-xs text-slate-500">
                  {c.mdp_app ? `Mot de passe de l'app${c.mdp_modifie_le ? ` (changé le ${String(c.mdp_modifie_le).slice(0, 10)}${c.mdp_modifie_par ? ` par ${c.mdp_modifie_par}` : ""})` : ""}` : c.mdp_env ? "Mot de passe d'amorçage (variable Vercel)" : "⚠ Aucun mot de passe"}
                  {c.courriel ? ` · ${c.courriel}` : " · aucun courriel"}
                  {c.lien_en_cours ? " · lien de réinitialisation actif" : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => envoyerLien(c.username)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold disabled:opacity-50">🔗 Envoyer un lien</button>
                <button type="button" disabled={busy} onClick={() => { setMdpPour(mdpPour === c.username ? null : c.username); setNouveau(""); }} className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded text-xs font-semibold disabled:opacity-50">🔐 Nouveau mot de passe</button>
              </div>
            </div>
            {lien && lien.user === c.username && (
              <div className="bg-slate-50 border rounded p-2 text-xs space-y-1">
                <div className="text-slate-700">{lien.detail} Le lien vaut 2 heures :</div>
                <div className="flex gap-2 items-center">
                  <input readOnly value={lien.url} onFocus={(e) => e.currentTarget.select()} className="flex-1 px-2 py-1.5 border rounded bg-white font-mono text-[11px]" />
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(lien.url).then(() => toast("Lien copié", "success")).catch(() => toast("Copie impossible : sélectionne le texte", "warning")); }} className="px-2 py-1.5 bg-slate-200 hover:bg-slate-300 rounded font-semibold">Copier</button>
                </div>
              </div>
            )}
            {mdpPour === c.username && (
              <form onSubmit={poserMdp} className="flex flex-wrap gap-2 items-end bg-emerald-50 border border-emerald-200 rounded p-2">
                <div className="flex-1 min-w-[200px]">
                  <Field label={`Nouveau mot de passe pour ${c.username} (8 min.)`} value={nouveau} onChange={setNouveau} type="password" autoComplete="new-password" />
                </div>
                <button type="submit" disabled={busy || nouveau.length < 8} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-semibold disabled:opacity-50">Enregistrer</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function MaintenanceSection() {
  const [actif, setActif] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/maintenance").then((r) => (r.ok ? r.json() : null)).then((d) => setActif(!!d?.actif)).catch(() => setActif(false));
  }, []);

  const basculer = async (valeur: boolean) => {
    setBusy(true);
    try {
      const r = await fetch("/api/maintenance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actif: valeur }) });
      if ((await r.json()).ok) {
        setActif(valeur);
        toast(valeur ? "🛠️ Mode maintenance ACTIVÉ — les autres voient une page d'attente, toi tu continues." : "✅ Mode maintenance désactivé — l'app est de nouveau accessible à tous.", valeur ? "warning" : "success");
      } else toast("Erreur", "error");
    } finally { setBusy(false); }
  };

  return (
    <section className={`bg-white rounded-lg shadow p-5 space-y-3 border-l-4 ${actif ? "border-amber-500" : "border-slate-200"}`}>
      <h2 className="font-bold text-lg">🛠️ Mode maintenance</h2>
      <p className="text-sm text-slate-600">
        Quand tu fais des modifications, active ce mode : tout le monde voit une page
        « mise à jour en cours », sauf <strong>ton navigateur</strong> qui continue à
        fonctionner normalement. Désactive-le quand tu as terminé.
      </p>
      {actif === null ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : actif ? (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded p-3">
          <span className="text-sm font-bold text-amber-900">🔴 Maintenance ACTIVE</span>
          <button onClick={() => basculer(false)} disabled={busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-bold text-sm">
            {busy ? "…" : "Désactiver"}
          </button>
        </div>
      ) : (
        <button onClick={() => basculer(true)} disabled={busy} className="w-full px-4 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg font-bold">
          {busy ? "…" : "🛠️ Activer le mode maintenance"}
        </button>
      )}
    </section>
  );
}

function PushSection() {
  const [supporte, setSupporte] = useState(false);
  const [actif, setActif] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupporte(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => setActif(!!sub)).catch(() => {});
  }, []);

  const urlBase64ToUint8Array = (b64: string) => {
    const padding = "=".repeat((4 - (b64.length % 4)) % 4);
    const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  };

  const activer = async () => {
    if (!supporte) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") { toast("Permission refusée", "warning"); return; }
      const { publicKey } = await fetch("/api/push/subscribe").then((r) => r.json());
      if (!publicKey) { toast("Push pas configuré côté serveur (VAPID_PUBLIC_KEY manquant)", "warning"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      if ((await r.json()).ok) { setActif(true); toast("🔔 Notifications activées sur cet appareil", "success"); }
      else toast("Échec activation", "error");
    } catch (e: any) {
      toast("Erreur : " + (e?.message || ""), "error");
    } finally { setBusy(false); }
  };

  const desactiver = async () => {
    if (!supporte) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        if (!(await ecrire("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint }, "Suppression"))) return;
        await sub.unsubscribe();
      }
      setActif(false);
      toast("Notifications désactivées sur cet appareil", "info");
    } finally { setBusy(false); }
  };

  const tester = async () => {
    setBusy(true);
    try {
      const res = await envoyer<any>("/api/push/test");
      if (!res.ok) { toast(`Test refusé : ${res.erreur}`, "error"); return; }
      const d = res.data || {};
      if (d.ok && d.envoyes > 0) toast(`✅ Notification envoyée (${d.envoyes} appareil)`, "success");
      else if (d.raison === "push_non_configure") toast("Push non configuré côté serveur", "warning");
      else toast("Aucun appareil abonné", "warning");
    } finally { setBusy(false); }
  };

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      <h2 className="font-bold text-lg">🔔 Notifications push</h2>
      {!supporte ? (
        <p className="text-sm text-slate-600">Ton navigateur ne supporte pas les notifications push. Sur iOS, ouvre l'app depuis l'écran d'accueil (PWA installée).</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">Reçois les @mentions et les relances dues directement sur ton téléphone, même quand l'app est fermée.</p>
          <div className="text-xs text-slate-500">
            État : {actif ? <strong className="text-emerald-700">✓ activé sur cet appareil</strong> : <strong className="text-slate-500">Désactivé</strong>}
            {permission === "denied" && <span className="text-red-600 ml-2">· permission bloquée dans les réglages du navigateur</span>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {!actif ? (
              <button onClick={activer} disabled={busy || permission === "denied"} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-bold text-sm">🔔 Activer les notifications</button>
            ) : (
              <>
                <button onClick={tester} disabled={busy} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded font-bold text-sm">🧪 Envoyer un test</button>
                <button onClick={desactiver} disabled={busy} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 rounded text-sm">Désactiver</button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Field({ label, value, onChange, placeholder, readOnly, type = "text", autoComplete }: { label: string; value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean; type?: string; autoComplete?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full px-3 py-2 border rounded text-sm ${readOnly ? "bg-slate-50 text-slate-500" : ""}`}
      />
    </div>
  );
}
