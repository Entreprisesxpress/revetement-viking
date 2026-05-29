"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import { useToast } from "@/components/Toasts";

export default function VehiculesPage() {
  const [vehicules, setVehicules] = useState<any[]>([]);
  const [creerOuvert, setCreerOuvert] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const vide = { nom: "", marque: "", modele: "", annee: "", plaque: "", vin: "", date_achat: "", notes: "" };
  const [form, setForm] = useState<any>(vide);
  const { toast } = useToast();

  const charger = () => fetch("/api/vehicules", { cache: "no-store" }).then((r) => r.json()).then(setVehicules).catch(() => {});
  useEffect(() => { charger(); }, []);

  const sauver = async () => {
    if (!form.nom?.trim()) { toast("Nom du véhicule requis", "warning"); return; }
    const body = { ...form, annee: form.annee ? +form.annee : null, ...(edit ? { id: edit.id } : {}) };
    const r = await fetch("/api/vehicules", { method: edit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if ((await r.json()).ok !== false) {
      toast(edit ? "Véhicule modifié" : "Véhicule ajouté", "success");
      setCreerOuvert(false); setEdit(null); setForm(vide); charger();
    }
  };
  const supprimer = async (id: number) => {
    if (!confirm("Supprimer ce véhicule ?")) return;
    await fetch(`/api/vehicules?id=${id}`, { method: "DELETE" });
    toast("Véhicule supprimé", "info"); charger();
  };
  const ouvrirEdit = (v: any) => { setEdit(v); setForm({ ...vide, ...v, annee: v.annee || "" }); setCreerOuvert(true); };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation titre="🚚 Véhicules" soustitre={`${vehicules.length} véhicule(s)`} />
      <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
        <button onClick={() => { setEdit(null); setForm(vide); setCreerOuvert(true); }} className="w-full md:w-auto px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow">➕ Ajouter un véhicule</button>

        {vehicules.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-slate-500"><div className="text-5xl mb-3">🚚</div>Aucun véhicule enregistré.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {vehicules.map((v) => (
              <div key={v.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-start">
                  <div className="font-bold text-slate-900">{v.nom}</div>
                  <div className="flex gap-2">
                    <button onClick={() => ouvrirEdit(v)} className="text-xs text-emerald-700 hover:underline">✏️</button>
                    <button onClick={() => supprimer(v.id)} className="text-xs text-red-600 hover:underline">🗑</button>
                  </div>
                </div>
                <div className="text-sm text-slate-600 mt-1">{[v.marque, v.modele, v.annee].filter(Boolean).join(" · ")}</div>
                {v.plaque && <div className="text-xs text-slate-500 mt-1">🔖 Plaque : <strong>{v.plaque}</strong></div>}
                {v.vin && <div className="text-xs text-slate-500">VIN : <code className="text-[10px]">{v.vin}</code></div>}
                {v.date_achat && <div className="text-xs text-slate-500">📅 Acheté : {v.date_achat}</div>}
                {v.notes && <div className="text-xs italic text-slate-600 mt-1 p-2 bg-slate-50 rounded">{v.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </main>

      {creerOuvert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setCreerOuvert(false)}>
          <div className="bg-white rounded-t-2xl md:rounded-lg max-w-md w-full p-5 space-y-3 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">{edit ? "Modifier" : "Nouveau"} véhicule</h3>
            <I label="Nom / identifiant *" v={form.nom} on={(x: string) => setForm({ ...form, nom: x })} ph="Ex: Camion #1, F-150 blanc" />
            <div className="grid grid-cols-2 gap-2">
              <I label="Marque" v={form.marque} on={(x: string) => setForm({ ...form, marque: x })} ph="Ford" />
              <I label="Modèle" v={form.modele} on={(x: string) => setForm({ ...form, modele: x })} ph="F-150" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <I label="Année" v={form.annee} on={(x: string) => setForm({ ...form, annee: x })} type="number" />
              <I label="Plaque" v={form.plaque} on={(x: string) => setForm({ ...form, plaque: x })} />
            </div>
            <I label="VIN (n° de série)" v={form.vin} on={(x: string) => setForm({ ...form, vin: x })} />
            <I label="Date d'achat" v={form.date_achat} on={(x: string) => setForm({ ...form, date_achat: x })} type="date" />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 border rounded text-sm" rows={2} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setCreerOuvert(false)} className="px-4 py-2 bg-slate-200 rounded text-sm">Annuler</button>
              <button onClick={sauver} className="px-4 py-2 bg-emerald-600 text-white rounded text-sm font-bold">Sauver</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function I({ label, v, on, ph, type = "text" }: { label: string; v: string; on: (x: string) => void; ph?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={v} onChange={(e) => on(e.target.value)} placeholder={ph} className="w-full px-3 py-2 border rounded text-sm" />
    </div>
  );
}
