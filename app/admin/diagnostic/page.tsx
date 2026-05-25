"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

export default function Diagnostic() {
  const [drive, setDrive] = useState<any>(null);
  const [notifs, setNotifs] = useState<any>(null);
  const [erreurs, setErreurs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [d, n, e] = await Promise.all([
          fetch("/api/drive").then((r) => r.json()).catch(() => ({})),
          fetch("/api/notifications").then((r) => r.json()).catch(() => ({})),
          fetch("/api/log-erreur").then((r) => r.json()).catch(() => []),
        ]);
        setDrive(d); setNotifs(n); setErreurs(e);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation titre="🛠️ Diagnostic" soustitre="État système · debug" />
      <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">

        {loading && <div className="text-center text-slate-500 py-8">Chargement...</div>}

        {!loading && (
          <>
            {/* ÉTAT DES SERVICES */}
            <section className="bg-white rounded-lg shadow p-5">
              <h2 className="font-bold mb-3">🔌 Services</h2>
              <ul className="text-sm space-y-2">
                <li className="flex justify-between border-b pb-2">
                  <span>Google Drive</span>
                  <span className={drive?.ok ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                    {drive?.ok ? `✓ ${drive.mode} · ${drive.folder}` : `❌ ${drive?.message || "déconnecté"}`}
                  </span>
                </li>
                <li className="flex justify-between border-b pb-2">
                  <span>Photos en erreur Drive</span>
                  <span className={(drive?.erreurs_photos || 0) > 0 ? "text-amber-600 font-bold" : "text-emerald-600"}>
                    {drive?.erreurs_photos || 0}
                  </span>
                </li>
                <li className="flex justify-between border-b pb-2">
                  <span>Relances à faire</span>
                  <span className={notifs?.relances > 0 ? "text-amber-600 font-bold" : "text-slate-600"}>{notifs?.relances || 0}</span>
                </li>
                <li className="flex justify-between border-b pb-2">
                  <span>Tâches CRM ouvertes</span>
                  <span className="text-slate-700">{notifs?.taches_ouvertes || 0}</span>
                </li>
                <li className="flex justify-between">
                  <span>Erreurs client (boundary)</span>
                  <span className={erreurs.length > 0 ? "text-amber-600 font-bold" : "text-emerald-600"}>{erreurs.length}</span>
                </li>
              </ul>
            </section>

            {/* ERREURS RÉCENTES */}
            {erreurs.length > 0 && (
              <section className="bg-white rounded-lg shadow p-5">
                <h2 className="font-bold mb-3">⚠️ 50 dernières erreurs client</h2>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {erreurs.map((e: any) => (
                    <div key={e.id} className="border-l-4 border-red-400 bg-red-50 p-2 text-xs">
                      <div className="font-semibold">{e.message?.slice(0, 120)}</div>
                      <div className="text-slate-600 mt-0.5">{e.path} · {new Date(e.date).toLocaleString("fr-CA")}</div>
                      {e.digest && <code className="text-[10px] text-slate-500">#{e.digest}</code>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* INFOS BUILD */}
            <section className="bg-white rounded-lg shadow p-5">
              <h2 className="font-bold mb-3">📦 Build</h2>
              <ul className="text-xs space-y-1 font-mono">
                <li>User-Agent: <span className="text-slate-600">{typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "n/a"}</span></li>
                <li>Online: <span className="text-slate-600">{typeof navigator !== "undefined" && navigator.onLine ? "✓" : "✗"}</span></li>
                <li>Cookies activés: <span className="text-slate-600">{typeof navigator !== "undefined" && navigator.cookieEnabled ? "✓" : "✗"}</span></li>
                <li>Service Worker: <span className="text-slate-600">{typeof navigator !== "undefined" && "serviceWorker" in navigator ? "supporté" : "non"}</span></li>
              </ul>
            </section>

            <div className="text-center">
              <button onClick={() => location.reload()} className="text-sm text-blue-600 hover:underline">🔄 Rafraîchir</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
