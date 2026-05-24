"use client";

import { useEffect, useState } from "react";

// Laval QC (Quartier Vimont, peut être ajusté)
const LAT = 45.5667;
const LON = -73.7333;
const VILLE = "Laval, QC";

const ICONES: Record<number, { icon: string; label: string }> = {
  0: { icon: "☀️", label: "Ensoleillé" },
  1: { icon: "🌤️", label: "Peu nuageux" },
  2: { icon: "⛅", label: "Partiellement nuageux" },
  3: { icon: "☁️", label: "Nuageux" },
  45: { icon: "🌫️", label: "Brouillard" },
  48: { icon: "🌫️", label: "Brouillard givrant" },
  51: { icon: "🌦️", label: "Bruine légère" },
  53: { icon: "🌦️", label: "Bruine" },
  55: { icon: "🌧️", label: "Bruine forte" },
  61: { icon: "🌧️", label: "Pluie légère" },
  63: { icon: "🌧️", label: "Pluie" },
  65: { icon: "🌧️", label: "Pluie forte" },
  71: { icon: "🌨️", label: "Neige légère" },
  73: { icon: "🌨️", label: "Neige" },
  75: { icon: "❄️", label: "Neige forte" },
  77: { icon: "🌨️", label: "Grésil" },
  80: { icon: "🌦️", label: "Averses" },
  81: { icon: "🌧️", label: "Averses fortes" },
  82: { icon: "⛈️", label: "Averses violentes" },
  85: { icon: "🌨️", label: "Averses de neige" },
  86: { icon: "❄️", label: "Forte neige" },
  95: { icon: "⛈️", label: "Orage" },
  96: { icon: "⛈️", label: "Orage grêle" },
  99: { icon: "⛈️", label: "Orage violent" },
};

const JOURS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

interface JourMeteo { date: string; codeIcone: number; tmin: number; tmax: number; pluie_mm: number; vent_max: number; }

export default function Meteo() {
  const [jours, setJours] = useState<JourMeteo[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=America/Toronto&forecast_days=7`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (!d.daily) throw new Error("Pas de données");
        const out: JourMeteo[] = d.daily.time.map((t: string, i: number) => ({
          date: t,
          codeIcone: d.daily.weather_code[i],
          tmin: Math.round(d.daily.temperature_2m_min[i]),
          tmax: Math.round(d.daily.temperature_2m_max[i]),
          pluie_mm: d.daily.precipitation_sum[i],
          vent_max: Math.round(d.daily.wind_speed_10m_max[i]),
        }));
        setJours(out);
      })
      .catch((e) => setErreur(e.message));
  }, []);

  if (erreur) return null; // pas de bandeau si erreur

  if (jours.length === 0) {
    return <div className="skeleton h-10 rounded-lg" />;
  }

  const auj = jours[0];
  const infoAuj = ICONES[auj.codeIcone] || { icon: "❓", label: "Inconnu" };
  const pluieSemaine = jours.reduce((s, j) => s + j.pluie_mm, 0);
  const joursPluie = jours.filter((j) => j.pluie_mm > 1).length;

  return (
    <section className="bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-lg overflow-hidden">
      {/* Vue compacte cliquable */}
      <button onClick={() => setOuvert(!ouvert)} className="w-full px-3 py-2 flex items-center justify-between hover:bg-sky-100/50 transition">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-xl">{infoAuj.icon}</span>
          <span className="font-bold text-sky-900">{auj.tmax}°</span>
          <span className="text-sky-700 text-xs">/ {auj.tmin}°</span>
          <span className="text-xs text-slate-600 hidden sm:inline">· {infoAuj.label}</span>
          {auj.pluie_mm > 0 && <span className="text-xs text-blue-700">· 💧 {auj.pluie_mm.toFixed(0)}mm</span>}
          {joursPluie > 0 && <span className="text-[10px] text-slate-500 hidden md:inline">· {joursPluie}j pluie cette semaine</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-sky-700 font-semibold">
          <span>{ouvert ? "Réduire" : "Voir 7 jours"}</span>
          <span className={`transition-transform ${ouvert ? "rotate-180" : ""}`}>▼</span>
        </div>
      </button>

      {/* Vue étendue 7 jours */}
      {ouvert && (
        <div className="p-3 border-t border-sky-200">
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {jours.map((j) => {
              const d = new Date(j.date + "T12:00:00");
              const info = ICONES[j.codeIcone] || { icon: "❓", label: "Inconnu" };
              const aujourd = j.date === new Date().toISOString().slice(0, 10);
              const pluieAlerte = j.pluie_mm > 5;
              return (
                <div key={j.date} className={`bg-white rounded-lg p-2 text-center ${aujourd ? "ring-2 ring-sky-500" : ""}`} title={info.label}>
                  <div className={`text-[10px] font-bold uppercase ${aujourd ? "text-sky-700" : "text-slate-500"}`}>{aujourd ? "Auj." : JOURS[d.getDay()]}</div>
                  <div className="text-[10px] text-slate-400">{d.getDate()}/{d.getMonth() + 1}</div>
                  <div className="text-2xl md:text-3xl my-1">{info.icon}</div>
                  <div className="text-xs md:text-sm font-bold text-slate-900">{j.tmax}°<span className="text-slate-400 font-normal">/{j.tmin}°</span></div>
                  {j.pluie_mm > 0 && <div className={`text-[10px] mt-0.5 font-semibold ${pluieAlerte ? "text-blue-700" : "text-slate-500"}`}>💧 {j.pluie_mm.toFixed(0)}mm</div>}
                  {j.vent_max >= 40 && <div className="text-[10px] text-amber-700 font-semibold mt-0.5">💨 {j.vent_max}km/h</div>}
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-slate-500 mt-2 flex justify-between">
            <span>⚠️ Pluie &gt; 5mm = pas idéal extérieur · Vent &gt; 40 km/h = sécurité échafaudage</span>
            <a href="https://www.meteomedia.com/ca/meteo/quebec/laval" target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">Détails →</a>
          </div>
        </div>
      )}
    </section>
  );
}
