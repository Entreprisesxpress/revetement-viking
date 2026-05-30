"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
  address?: { road?: string; house_number?: string; postcode?: string; city?: string; town?: string; village?: string; state?: string };
}

/** Autocomplétion d'adresse via Nominatim (OpenStreetMap — gratuit, sans clé).
 *  Restreint au Canada par défaut, debounce 350 ms, max 5 résultats. */
export default function AdresseAutocomplete({ value, onChange, placeholder, className, label }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0);
  const timer = useRef<any>(null);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const onTape = (v: string) => {
    onChange(v);
    setIdx(0);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 4) { setSuggestions([]); return; }
    setBusy(true); setOuvert(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(v)}&format=json&addressdetails=1&limit=5&countrycodes=ca&accept-language=fr`, { headers: { "Accept": "application/json" } });
        const data = await r.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch { setSuggestions([]); } finally { setBusy(false); }
    }, 350);
  };

  const choisir = (s: Suggestion) => {
    const a = s.address || {};
    const num = a.house_number || "";
    const rue = a.road || "";
    const ville = a.city || a.town || a.village || "";
    const cp = a.postcode || "";
    // Format Québec : "123 Rue Joliette, Montréal, H1W 3E9"
    const ligne1 = [num, rue].filter(Boolean).join(" ");
    const ligne2 = [ville, cp].filter(Boolean).join(", ");
    const adresse = [ligne1, ligne2].filter(Boolean).join(", ");
    onChange(adresse || s.display_name);
    setOuvert(false);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!ouvert || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => (i + 1) % suggestions.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i - 1 + suggestions.length) % suggestions.length); }
    if (e.key === "Enter") { e.preventDefault(); choisir(suggestions[idx]); }
    if (e.key === "Escape") setOuvert(false);
  };

  return (
    <div ref={wrap} className="relative">
      {label && <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>}
      <input
        type="text"
        value={value}
        onChange={(e) => onTape(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOuvert(true)}
        onKeyDown={onKey}
        placeholder={placeholder || "Commence à taper l'adresse… (Canada)"}
        className={className || "w-full px-3 py-2 border rounded text-sm"}
        autoComplete="off"
      />
      {ouvert && (busy || suggestions.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-30 max-h-72 overflow-y-auto">
          {busy && <div className="px-3 py-2 text-xs text-slate-500 italic">🔍 Recherche…</div>}
          {!busy && suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); choisir(s); }}
              className={`block w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${i === idx ? "bg-emerald-50" : "hover:bg-slate-50"}`}
            >
              <div className="font-semibold text-slate-900 truncate">{[s.address?.house_number, s.address?.road].filter(Boolean).join(" ") || s.display_name.split(",")[0]}</div>
              <div className="text-[10px] text-slate-500 truncate">{s.display_name}</div>
            </button>
          ))}
          {!busy && suggestions.length === 0 && <div className="px-3 py-2 text-xs text-slate-400 italic">Aucun résultat — tu peux taper l'adresse manuellement.</div>}
        </div>
      )}
    </div>
  );
}
