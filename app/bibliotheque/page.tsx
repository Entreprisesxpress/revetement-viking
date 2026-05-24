"use client";

import { useEffect, useRef, useState } from "react";
import { formatCAD } from "@/lib/calculateur";
import Navigation from "@/components/Navigation";

export default function Bibliotheque() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    adresse: "",
    type_materiau: "vinyle",
    parement_pi2: "",
    fascia_pi_lin: "",
    soffite_pi2: "",
    nb_etages: "1",
    total_soumission: "",
    heures_reelles: "",
    complexite: "moyenne",
    notes_chantier: "",
    hover_data_json: "",
    soumission_data_json: "",
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const photosRef = useRef<HTMLInputElement>(null);

  const charger = async () => {
    setLoading(true);
    const r = await fetch("/api/bibliotheque");
    setJobs(await r.json());
    setLoading(false);
  };

  useEffect(() => { charger(); }, []);

  const ajouter = async () => {
    if (!form.parement_pi2 || !form.total_soumission) {
      alert("Au minimum : surface parement + total soumission.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
      photos.forEach((p, i) => fd.append(`photo_${i}`, p));
      const r = await fetch("/api/bibliotheque", { method: "POST", body: fd });
      const d = await r.json();
      if (d.ok) {
        alert(`Job ajoutée à la bibliothèque (#${d.id})`);
        setForm({ adresse: "", type_materiau: "vinyle", parement_pi2: "", fascia_pi_lin: "", soffite_pi2: "", nb_etages: "1", total_soumission: "", heures_reelles: "", complexite: "moyenne", notes_chantier: "", hover_data_json: "", soumission_data_json: "" });
        setPhotos([]);
        if (photosRef.current) photosRef.current.value = "";
        charger();
      } else { alert("Erreur: " + d.error); }
    } finally { setUploading(false); }
  };

  const supprimer = async (id: number) => {
    if (!confirm("Supprimer cette job de référence?")) return;
    await fetch(`/api/bibliotheque?id=${id}`, { method: "DELETE" });
    charger();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation titre="📚 Bibliothèque" soustitre="Plus tu en mets, plus l'IA estime juste" />

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulaire d'ajout */}
        <section className="bg-white rounded-lg shadow p-5">
          <h2 className="text-lg font-bold mb-3">➕ Ajouter une job de référence</h2>
          <p className="text-sm text-slate-600 mb-4">
            Remplis avec une vraie job déjà complétée (Hover + soumission finale + heures réelles + photos). L'auto-estimateur les utilisera pour mieux estimer les futurs projets similaires.
          </p>
          <div className="space-y-3">
            <Input label="Adresse" v={form.adresse} on={(v) => setForm({ ...form, adresse: v })} />
            <div className="grid grid-cols-2 gap-2">
              <Select label="Type matériau" v={form.type_materiau} on={(v) => setForm({ ...form, type_materiau: v })} opts={["vinyle", "maibec-canexel", "maibec-bois", "mac-acier", "mac-harrywood", "aluminium", "mixte"]} />
              <Select label="Nb étages" v={form.nb_etages} on={(v) => setForm({ ...form, nb_etages: v })} opts={["1", "2", "3"]} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Num label="Parement pi² ⭐" v={form.parement_pi2} on={(v) => setForm({ ...form, parement_pi2: v })} />
              <Num label="Fascia pi-lin" v={form.fascia_pi_lin} on={(v) => setForm({ ...form, fascia_pi_lin: v })} />
              <Num label="Soffite pi²" v={form.soffite_pi2} on={(v) => setForm({ ...form, soffite_pi2: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Num label="Total soumission $ ⭐" v={form.total_soumission} on={(v) => setForm({ ...form, total_soumission: v })} />
              <Num label="Heures réelles travaillées" v={form.heures_reelles} on={(v) => setForm({ ...form, heures_reelles: v })} />
            </div>
            <Select label="Complexité" v={form.complexite} on={(v) => setForm({ ...form, complexite: v })} opts={["faible", "moyenne", "élevée"]} />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes chantier (particularités, obstacles, leçons)</label>
              <textarea value={form.notes_chantier} onChange={(e) => setForm({ ...form, notes_chantier: e.target.value })} rows={3} className="w-full px-3 py-2 border rounded text-sm" placeholder="Ex: Fronton triangulaire avant, échafaudage déplacé 4 fois, accès difficile par l'arrière..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">📷 Photos chantier/maison (optionnel)</label>
              <input ref={photosRef} type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 10))} className="text-sm" />
              {photos.length > 0 && <div className="text-xs text-slate-500 mt-1">{photos.length} photo(s) sélectionnée(s)</div>}
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-slate-600">📄 Données Hover (avancé - optionnel)</summary>
              <textarea value={form.hover_data_json} onChange={(e) => setForm({ ...form, hover_data_json: e.target.value })} rows={3} placeholder='Colle le JSON Hover ou laisse vide' className="w-full mt-2 px-3 py-2 border rounded text-xs font-mono" />
            </details>
            <button onClick={ajouter} disabled={uploading} className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold disabled:opacity-50">
              {uploading ? "⏳ Upload..." : "💾 Ajouter à la bibliothèque"}
            </button>
          </div>
        </section>

        {/* Liste des jobs */}
        <section className="bg-white rounded-lg shadow p-5">
          <h2 className="text-lg font-bold mb-3">Jobs de référence ({jobs.length})</h2>
          {loading ? (
            <p className="text-slate-500">Chargement...</p>
          ) : jobs.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-5xl mb-3">📚</div>
              <h3 className="font-bold text-slate-700 mb-1">Bibliothèque vide</h3>
              <p className="text-sm text-slate-500">Plus tu en mets, plus l'IA estime juste.<br/>Idéal : 5-10 jobs représentatives de ton business.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[700px] overflow-y-auto">
              {jobs.map((j) => {
                const photos = j.photos_json ? JSON.parse(j.photos_json) : [];
                return (
                  <div key={j.id} className="border rounded p-3 bg-slate-50 text-sm">
                    <div className="flex justify-between mb-1">
                      <strong>{j.adresse || "Sans adresse"}</strong>
                      <button onClick={() => supprimer(j.id)} className="text-red-600 hover:bg-red-50 px-2 rounded text-xs">✕</button>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded">{j.type_materiau}</span>
                      <span className="bg-slate-200 px-2 py-0.5 rounded">{j.nb_etages} étage(s)</span>
                      <span className={`px-2 py-0.5 rounded ${j.complexite === "élevée" ? "bg-red-100 text-red-900" : j.complexite === "faible" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{j.complexite}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div><span className="text-slate-500">Parement:</span> <strong>{j.parement_pi2} pi²</strong></div>
                      <div><span className="text-slate-500">Fascia:</span> <strong>{j.fascia_pi_lin} pl</strong></div>
                      <div><span className="text-slate-500">Soffite:</span> <strong>{j.soffite_pi2} pi²</strong></div>
                      <div><span className="text-slate-500">Total:</span> <strong className="text-emerald-700">{formatCAD(j.total_soumission)}</strong></div>
                      <div><span className="text-slate-500">H. réelles:</span> <strong>{j.heures_reelles || "—"} h</strong></div>
                      <div><span className="text-slate-500">$/pi²:</span> <strong>{(j.total_soumission / j.parement_pi2).toFixed(2)}$</strong></div>
                    </div>
                    {j.notes_chantier && <div className="mt-2 text-xs italic text-slate-700">"{j.notes_chantier}"</div>}
                    {photos.length > 0 && <div className="mt-1 text-xs text-slate-500">📷 {photos.length} photo(s)</div>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Input({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return <div><label className="block text-xs font-medium text-slate-600 mb-1">{label}</label><input type="text" value={v} onChange={(e) => on(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" /></div>;
}
function Num({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return <div><label className="block text-xs font-medium text-slate-600 mb-1">{label}</label><input type="number" value={v} onChange={(e) => on(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" /></div>;
}
function Select({ label, v, on, opts }: { label: string; v: string; on: (v: string) => void; opts: string[] }) {
  return <div><label className="block text-xs font-medium text-slate-600 mb-1">{label}</label><select value={v} onChange={(e) => on(e.target.value)} className="w-full px-3 py-2 border rounded text-sm">{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>;
}
