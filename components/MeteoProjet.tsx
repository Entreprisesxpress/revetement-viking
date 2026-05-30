"use client";

import { useEffect, useState } from "react";

interface Props { adresse: string }

interface PrevisionJour {
  date: string;
  tempMin: number;
  tempMax: number;
  pluieMm: number;
  precipProb: number;
  vent: number;
  meteo: number; // weathercode WMO
}

function emojiPourCode(code: number): string {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈";
  return "🌡";
}
function libelle(code: number): string {
  if (code === 0) return "Ciel dégagé";
  if ([1, 2].includes(code)) return "Partiellement nuageux";
  if (code === 3) return "Nuageux";
  if ([45, 48].includes(code)) return "Brouillard";
  if ([51, 53, 55, 56, 57].includes(code)) return "Bruine";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "Pluie";
  if ([66, 67].includes(code)) return "Pluie verglaçante";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Neige";
  if ([95, 96, 99].includes(code)) return "Orage";
  return "—";
}

export default function MeteoProjet({ adresse }: Props) {
  const [previs, setPrevis] = useState<PrevisionJour[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (!adresse?.trim()) return;
    let alive = true;
    setBusy(true); setErreur("");
    (async () => {
      try {
        // 1. Géocoder l'adresse (Open-Meteo géocoding)
        const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(adresse)}&count=1&language=fr&format=json`).then((r) => r.json());
        const lieu = g?.results?.[0];
        if (!lieu) throw new Error("Adresse non trouvée");
        // 2. Prévisions 5 jours
        const f = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lieu.latitude}&longitude=${lieu.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=America/Montreal&forecast_days=5`).then((r) => r.json());
        if (!alive) return;
        const d = f?.daily;
        if (!d) throw new Error("Pas de prévision");
        const list: PrevisionJour[] = d.time.map((date: string, i: number) => ({
          date, tempMin: d.temperature_2m_min[i], tempMax: d.temperature_2m_max[i],
          pluieMm: d.precipitation_sum[i] || 0, precipProb: d.precipitation_probability_max[i] || 0,
          vent: d.wind_speed_10m_max[i] || 0, meteo: d.weathercode[i],
        }));
        setPrevis(list);
      } catch (e: any) {
        if (alive) setErreur(e?.message || "Erreur météo");
      } finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, [adresse]);

  if (!adresse?.trim()) return null;
  if (busy) return <div className="text-xs text-slate-500 italic px-3 py-2">⛅ Chargement météo…</div>;
  if (erreur || !previs) return null;

  // Détecte les jours risqués (pluie/orage/neige) parmi les 3 prochains
  const ALERTE_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
  const risques = previs.slice(0, 3).filter((p) => ALERTE_CODES.includes(p.meteo) || p.precipProb >= 60 || p.pluieMm > 2);

  return (
    <div className={`rounded-lg p-3 border-2 ${risques.length ? "bg-amber-50 border-amber-400" : "bg-sky-50 border-sky-300"}`}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className={`font-bold text-sm ${risques.length ? "text-amber-900" : "text-sky-900"}`}>
          {risques.length ? "⚠️ Météo défavorable annoncée" : "⛅ Météo du chantier (5 jours)"}
        </h3>
        {risques.length > 0 && <span className="text-[10px] text-amber-800">Considère reporter ou prévoir des bâches</span>}
      </div>
      <div className="grid grid-cols-5 gap-1 text-center">
        {previs.map((p) => {
          const d = new Date(p.date + "T12:00:00");
          const j = d.toLocaleDateString("fr-CA", { weekday: "short", day: "numeric" });
          const aRisque = ALERTE_CODES.includes(p.meteo) || p.precipProb >= 60;
          return (
            <div key={p.date} className={`rounded p-1.5 ${aRisque ? "bg-amber-100" : "bg-white"}`} title={`${libelle(p.meteo)} · pluie ${p.pluieMm.toFixed(1)}mm · ${p.precipProb}% · vent ${p.vent.toFixed(0)} km/h`}>
              <div className="text-[10px] font-semibold text-slate-600 capitalize">{j}</div>
              <div className="text-xl my-0.5">{emojiPourCode(p.meteo)}</div>
              <div className="text-[10px]">
                <strong>{Math.round(p.tempMax)}°</strong> <span className="text-slate-400">{Math.round(p.tempMin)}°</span>
              </div>
              {p.precipProb >= 30 && <div className="text-[9px] text-blue-700">💧 {p.precipProb}%</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
