"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import FAB from "@/components/FAB";
import { formatCAD } from "@/lib/calculateur";
import { useToast } from "@/components/Toasts";

const POSTES = ["Installateur", "Apprenti", "Chef d'équipe", "Estimateur", "Administration", "Autre"];

export default function EmployesPage() {
  const [employes, setEmployes] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [creerOuvert, setCreerOuvert] = useState(false);
  const [filtreActif, setFiltreActif] = useState<"actifs" | "tous" | "inactifs">("actifs");
  const { toast } = useToast();

  const charger = async () => {
    const r = await fetch("/api/employes");
    setEmployes(await r.json());
  };

  useEffect(() => { charger(); }, []);

  const reset = () => ({ nom: "", taux_horaire: "", das_pct: 0.15, poste: "Installateur", telephone: "", courriel: "", adresse: "", date_naissance: "", nas: "", date_embauche: new Date().toISOString().slice(0, 10), contact_urgence_nom: "", contact_urgence_lien: "", contact_urgence_tel: "", notes: "", specimen_cheque_data: "", specimen_cheque_type: "" });
  const [form, setForm] = useState<any>(reset());

  const sauver = async () => {
    if (!form.nom?.trim() || !form.taux_horaire) { toast("Nom et taux requis", "warning"); return; }
    const body = { ...form, taux_horaire: +form.taux_horaire, das_pct: +form.das_pct };
    if (edit) {
      await fetch("/api/employes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: edit.id, ...body }) });
      toast(`✓ ${form.nom} mis à jour`, "success");
    } else {
      await fetch("/api/employes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      toast(`✓ ${form.nom} ajouté`, "success");
    }
    setEdit(null);
    setCreerOuvert(false);
    setForm(reset());
    charger();
  };

  const ouvrirEdit = (e: any) => {
    setEdit(e);
    setForm({ ...reset(), ...e, taux_horaire: String(e.taux_horaire), das_pct: e.das_pct ?? 0.15 });
    setCreerOuvert(true);
  };

  const desactiver = async (e: any) => {
    if (!confirm(`Désactiver ${e.nom} ? Il n'apparaîtra plus dans la saisie d'heures.`)) return;
    await fetch(`/api/employes?id=${e.id}`, { method: "DELETE" });
    toast(`${e.nom} désactivé`, "info");
    charger();
  };

  const reactiver = async (e: any) => {
    await fetch("/api/employes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id, actif: 1 }) });
    toast(`${e.nom} réactivé`, "success");
    charger();
  };

  const uploadSpecimen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast("Fichier > 5 MB", "warning"); return; }
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, specimen_cheque_data: reader.result, specimen_cheque_type: file.type });
    reader.readAsDataURL(file);
  };

  const affiches = employes.filter((e) => {
    if (filtreActif === "actifs") return e.actif;
    if (filtreActif === "inactifs") return !e.actif;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation
        titre="👷 Employés"
        soustitre={`${affiches.length} ${filtreActif}`}
        actions={
          <button onClick={() => { setEdit(null); setForm(reset()); setCreerOuvert(true); }} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-semibold text-left">
            ➕ Nouvel employé
          </button>
        }
      />

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        {/* Filtre statut */}
        <div className="flex gap-2">
          {[
            { v: "actifs", l: "Actifs" },
            { v: "inactifs", l: "Inactifs" },
            { v: "tous", l: "Tous" },
          ].map((f: any) => (
            <button key={f.v} onClick={() => setFiltreActif(f.v)} className={`px-3 py-1 rounded text-sm ${filtreActif === f.v ? "bg-slate-900 text-white" : "bg-white border"}`}>{f.l}</button>
          ))}
        </div>

        {affiches.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">👷</div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">Aucun employé</h3>
            <button onClick={() => { setEdit(null); setForm(reset()); setCreerOuvert(true); }} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold">➕ Premier employé</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {affiches.map((e) => (
              <div key={e.id} className={`bg-white rounded-lg shadow p-4 space-y-2 ${!e.actif ? "opacity-60" : ""}`}>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900 text-lg truncate">{e.nom}</div>
                    {e.poste && <div className="text-xs text-slate-500">{e.poste}</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-700">{formatCAD(e.taux_horaire || 0)}/h</div>
                    {!e.actif && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Inactif</span>}
                  </div>
                </div>
                <div className="text-xs space-y-0.5">
                  {e.telephone && <div>📞 <a href={`tel:${e.telephone}`} className="text-blue-600">{e.telephone}</a></div>}
                  {e.courriel && <div>✉️ <a href={`mailto:${e.courriel}`} className="text-blue-600 truncate">{e.courriel}</a></div>}
                  {e.adresse && <div className="text-slate-600 truncate">📍 {e.adresse}</div>}
                  {e.date_embauche && <div className="text-slate-500">📅 Embauché : {e.date_embauche}</div>}
                  {e.contact_urgence_nom && <div className="text-amber-700">🚨 {e.contact_urgence_nom}{e.contact_urgence_tel ? ` · ${e.contact_urgence_tel}` : ""}</div>}
                  {e.specimen_cheque_data && <div className="text-emerald-700">📎 Spécimen chèque archivé</div>}
                </div>
                <div className="flex gap-1 pt-2 border-t">
                  <button onClick={() => ouvrirEdit(e)} className="flex-1 px-2 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-semibold">✏️ Modifier</button>
                  {e.actif ? (
                    <button onClick={() => desactiver(e)} className="px-2 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs">Désactiver</button>
                  ) : (
                    <button onClick={() => reactiver(e)} className="px-2 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded text-xs">Réactiver</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {creerOuvert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => { setCreerOuvert(false); setEdit(null); }}>
          <div className="bg-white rounded-t-2xl md:rounded-lg max-w-2xl w-full p-5 space-y-3 max-h-[92vh] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
            <h3 className="text-lg font-bold">{edit ? `Modifier ${edit.nom}` : "Nouvel employé"}</h3>

            {/* Identité */}
            <fieldset className="border rounded p-3">
              <legend className="text-xs font-bold text-slate-600 px-1">Identité</legend>
              <div className="space-y-2">
                <In label="Nom complet *" v={form.nom} o={(v) => setForm({ ...form, nom: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <In label="Date de naissance" v={form.date_naissance} o={(v) => setForm({ ...form, date_naissance: v })} type="date" />
                  <In label="NAS" v={form.nas} o={(v) => setForm({ ...form, nas: v })} placeholder="XXX-XXX-XXX" />
                </div>
                <In label="Adresse" v={form.adresse} o={(v) => setForm({ ...form, adresse: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <In label="Téléphone" v={form.telephone} o={(v) => setForm({ ...form, telephone: v })} type="tel" />
                  <In label="Courriel" v={form.courriel} o={(v) => setForm({ ...form, courriel: v })} type="email" />
                </div>
              </div>
            </fieldset>

            {/* Emploi */}
            <fieldset className="border rounded p-3">
              <legend className="text-xs font-bold text-slate-600 px-1">Emploi</legend>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Poste</label>
                    <select value={form.poste} onChange={(ev) => setForm({ ...form, poste: ev.target.value })} className="w-full px-3 py-2 border rounded text-sm bg-white">
                      {POSTES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <In label="Date embauche" v={form.date_embauche} o={(v) => setForm({ ...form, date_embauche: v })} type="date" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <In label="Taux horaire $/h *" v={form.taux_horaire} o={(v) => setForm({ ...form, taux_horaire: v })} type="number" />
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">DAS %</label>
                    <input type="number" step={0.01} value={form.das_pct} onChange={(ev) => setForm({ ...form, das_pct: ev.target.value })} className="w-full px-3 py-2 border rounded text-sm text-right" />
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Contact d'urgence */}
            <fieldset className="border rounded p-3">
              <legend className="text-xs font-bold text-slate-600 px-1">🚨 Contact d'urgence</legend>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <In label="Nom" v={form.contact_urgence_nom} o={(v) => setForm({ ...form, contact_urgence_nom: v })} />
                  <In label="Lien" v={form.contact_urgence_lien} o={(v) => setForm({ ...form, contact_urgence_lien: v })} placeholder="Conjoint, parent..." />
                </div>
                <In label="Téléphone" v={form.contact_urgence_tel} o={(v) => setForm({ ...form, contact_urgence_tel: v })} type="tel" />
              </div>
            </fieldset>

            {/* Spécimen chèque */}
            <fieldset className="border rounded p-3">
              <legend className="text-xs font-bold text-slate-600 px-1">📎 Spécimen de chèque</legend>
              {form.specimen_cheque_data ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded p-2">
                  {form.specimen_cheque_type?.startsWith("image/") ? (
                    <img src={form.specimen_cheque_data} alt="Spécimen" className="w-16 h-16 object-cover rounded" />
                  ) : (
                    <div className="w-16 h-16 bg-slate-200 rounded flex items-center justify-center text-2xl">📄</div>
                  )}
                  <div className="flex-1 text-xs">Spécimen archivé</div>
                  <button type="button" onClick={() => {
                    const w = window.open();
                    if (w) {
                      if (form.specimen_cheque_type?.startsWith("image/")) w.document.write(`<img src="${form.specimen_cheque_data}" style="max-width:100%" />`);
                      else w.location.href = form.specimen_cheque_data;
                    }
                  }} className="text-xs text-blue-600 hover:underline">Voir</button>
                  <button type="button" onClick={() => setForm({ ...form, specimen_cheque_data: "", specimen_cheque_type: "" })} className="text-red-600 hover:bg-red-100 px-2 py-1 rounded text-xs">✕</button>
                </div>
              ) : (
                <label className="cursor-pointer bg-white border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 rounded p-3 text-center transition flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
                  📎 Joindre PDF ou photo
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={uploadSpecimen} />
                </label>
              )}
            </fieldset>

            {/* Notes */}
            <fieldset className="border rounded p-3">
              <legend className="text-xs font-bold text-slate-600 px-1">Notes</legend>
              <textarea value={form.notes} onChange={(ev) => setForm({ ...form, notes: ev.target.value })} rows={2} placeholder="Allergies, conditions médicales, certifications..." className="w-full px-3 py-2 border rounded text-sm" />
            </fieldset>

            <div className="flex gap-2 justify-end pt-2 sticky bottom-0 bg-white">
              <button onClick={() => { setCreerOuvert(false); setEdit(null); }} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-sm">Annuler</button>
              <button onClick={sauver} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-bold">{edit ? "Mettre à jour" : "Créer"}</button>
            </div>
          </div>
        </div>
      )}

      <FAB onSuccess={charger} />
    </div>
  );
}

function In({ label, v, o, type = "text", placeholder }: { label: string; v: string; o: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={v || ""} onChange={(e) => o(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 border rounded text-sm" />
    </div>
  );
}
