"use client";

import { useEffect, useState } from "react";
import { formatCAD } from "@/lib/calculateur";
import Navigation from "@/components/Navigation";
import { useToast } from "@/components/Toasts";

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [projets, setProjets] = useState<any[]>([]);
  const [creerOuvert, setCreerOuvert] = useState(false);
  const [nouveau, setNouveau] = useState({ nom: "", courriel: "", telephone: "", adresse: "", notes: "" });
  const { toast } = useToast();

  const charger = async () => {
    const [c, p] = await Promise.all([
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/projets").then((r) => r.json()),
    ]);
    setClients(c);
    setProjets(p);
  };

  useEffect(() => { charger(); }, []);

  const creer = async () => {
    if (!nouveau.nom.trim()) { toast("Nom requis", "warning"); return; }
    const r = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nouveau) });
    if ((await r.json()).ok) {
      toast("Client créé", "success");
      setCreerOuvert(false);
      setNouveau({ nom: "", courriel: "", telephone: "", adresse: "", notes: "" });
      charger();
    }
  };

  const supprimer = async (id: number) => {
    if (!confirm("Supprimer ce client ?")) return;
    await fetch(`/api/clients?id=${id}`, { method: "DELETE" });
    charger();
  };

  const projetsParClient = (client_id: number) => projets.filter((p) => p.client_id === client_id);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation
        titre="👥 Clients"
        soustitre={`${clients.length} client(s)`}
        actions={
          <button onClick={() => setCreerOuvert(true)} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-semibold text-left">
            ➕ Nouveau client
          </button>
        }
      />

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        {clients.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">Aucun client</h3>
            <p className="text-sm text-slate-500 mb-4">Les clients se créent automatiquement quand tu convertis une soumission en projet.</p>
            <button onClick={() => setCreerOuvert(true)} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold">➕ Ajouter manuellement</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {clients.map((c) => {
              const pc = projetsParClient(c.id);
              const totalFacture = pc.reduce((s, p) => s + (p.total_facture || 0), 0);
              const totalPaye = pc.reduce((s, p) => s + (p.total_paye || 0), 0);
              return (
                <div key={c.id} className="bg-white rounded-lg shadow p-4 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 truncate">{c.nom}</div>
                      {c.adresse && <div className="text-xs text-slate-500 truncate">📍 {c.adresse}</div>}
                    </div>
                    <button onClick={() => supprimer(c.id)} className="text-red-600 hover:bg-red-50 px-2 rounded text-xs">✕</button>
                  </div>
                  <div className="text-xs space-y-0.5">
                    {c.telephone && <div>📞 <a href={`tel:${c.telephone}`} className="text-blue-600 hover:underline">{c.telephone}</a></div>}
                    {c.courriel && <div>✉️ <a href={`mailto:${c.courriel}`} className="text-blue-600 hover:underline truncate">{c.courriel}</a></div>}
                  </div>
                  {c.notes && <div className="text-xs text-slate-600 italic">"{c.notes}"</div>}
                  <div className="pt-2 border-t text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-500">Projets :</span>
                      <strong>{pc.length}</strong>
                    </div>
                    {pc.length > 0 && (
                      <>
                        <div className="flex justify-between mb-1"><span className="text-slate-500">Facturé :</span><strong className="text-blue-700">{formatCAD(totalFacture)}</strong></div>
                        <div className="flex justify-between mb-2"><span className="text-slate-500">Payé :</span><strong className="text-emerald-700">{formatCAD(totalPaye)}</strong></div>
                        <div className="space-y-1">
                          {pc.slice(0, 3).map((p) => (
                            <a key={p.id} href={`/projets/${p.id}`} className="block text-xs px-2 py-1 bg-slate-50 hover:bg-emerald-50 rounded truncate">→ {p.nom}</a>
                          ))}
                          {pc.length > 3 && <div className="text-xs text-slate-400 text-center">+ {pc.length - 3} autres</div>}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {creerOuvert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCreerOuvert(false)}>
          <div className="bg-white rounded-lg max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Nouveau client</h3>
            <In label="Nom *" v={nouveau.nom} o={(v) => setNouveau({ ...nouveau, nom: v })} />
            <In label="Téléphone" v={nouveau.telephone} o={(v) => setNouveau({ ...nouveau, telephone: v })} />
            <In label="Courriel" v={nouveau.courriel} o={(v) => setNouveau({ ...nouveau, courriel: v })} />
            <In label="Adresse" v={nouveau.adresse} o={(v) => setNouveau({ ...nouveau, adresse: v })} />
            <In label="Notes" v={nouveau.notes} o={(v) => setNouveau({ ...nouveau, notes: v })} />
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setCreerOuvert(false)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-sm">Annuler</button>
              <button onClick={creer} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-semibold">Créer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function In({ label, v, o }: { label: string; v: string; o: (v: string) => void }) {
  return <div><label className="block text-xs font-medium text-slate-600 mb-1">{label}</label><input type="text" value={v} onChange={(e) => o(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" /></div>;
}
