"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onTranscript: (texte: string) => void;
  langue?: string;            // défaut fr-CA
  taille?: "sm" | "md";       // mini ou normal
  titre?: string;
}

/** Bouton micro pour dictée vocale (Web Speech API).
 *  Affiche le texte EN DIRECT pendant qu'on parle (bulle live), et transmet chaque
 *  segment final immédiatement à la valeur courante via onTranscript.
 *  Marche sur Chrome desktop + Chrome/Edge Android. iOS Safari : limité. */
export default function MicVocal({ onTranscript, langue = "fr-CA", taille = "md", titre }: Props) {
  const [actif, setActif] = useState(false);
  const [supporte, setSupporte] = useState(true);
  const [live, setLive] = useState("");   // texte interim affiché pendant qu'on parle
  const recoRef = useRef<any>(null);

  useEffect(() => {
    const SR = (typeof window !== "undefined") && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) { setSupporte(false); return; }
  }, []);

  // Coupe proprement la reco si le composant est démonté pendant l'écoute.
  useEffect(() => () => { try { recoRef.current?.abort?.(); } catch {} }, []);

  const demarrer = async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Dictée vocale non supportée par ce navigateur. Utiliser Chrome ou Edge."); return; }
    // Demande explicite de permission micro (sinon Chrome desktop échoue en silence)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
        flux.getTracks().forEach((t) => t.stop());
      }
    } catch {
      alert("Le micro est bloqué. Cliquer sur l'icône cadenas 🔒 à gauche de l'URL pour autoriser le micro pour ce site.");
      return;
    }
    const reco = new SR();
    reco.lang = langue;
    reco.continuous = true;
    reco.interimResults = true;
    reco.maxAlternatives = 1;
    let dejaTraite = 0;
    reco.onresult = (e: any) => {
      let final = "";
      let interim = "";
      for (let i = dejaTraite; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) { final += res[0].transcript + " "; dejaTraite = i + 1; }
        else interim += res[0].transcript;
      }
      // Mots provisoires : affichés en direct (sans encore les transmettre).
      setLive(interim);
      // Dès qu'un segment est finalisé → on le pousse immédiatement dans le champ.
      if (final.trim()) { onTranscript(final.trim()); setLive(""); }
    };
    reco.onend = () => { setActif(false); setLive(""); };
    reco.onerror = (e: any) => {
      setActif(false);
      setLive("");
      const err = e?.error || "inconnu";
      if (err === "not-allowed" || err === "service-not-allowed") {
        alert("Permission micro refusée. Cliquer sur 🔒 à gauche de l'URL et autoriser le micro.");
      } else if (err === "no-speech") {
        // silence normal, ne rien afficher
      } else if (err === "audio-capture") {
        alert("Aucun micro détecté. Brancher un casque ou un micro et réessayer.");
      } else if (err !== "aborted") {
        alert(`Erreur dictée : ${err}`);
      }
    };
    try { reco.start(); } catch (err: any) {
      setActif(false);
      alert(`Impossible de démarrer la dictée : ${err?.message || err}`);
      return;
    }
    recoRef.current = reco;
    setActif(true);
  };
  const arreter = () => {
    try { recoRef.current?.stop(); } catch {}
    setActif(false);
  };

  if (!supporte) return null;

  const baseClass = taille === "sm"
    ? "p-1.5 rounded text-sm"
    : "px-2.5 py-2 rounded font-bold text-sm";

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={actif ? arreter : demarrer}
        className={`${baseClass} ${actif ? "bg-red-600 hover:bg-red-500 text-white animate-pulse" : "bg-slate-200 hover:bg-slate-300 text-slate-700"} transition`}
        title={titre || (actif ? "Cliquer pour arrêter la dictée" : "Dicter (français Canada)")}
        aria-label={actif ? "Arrêter la dictée vocale" : "Démarrer la dictée vocale"}
      >
        {actif ? "🔴 Stop" : "🎤"}
      </button>

      {/* Bulle live : montre les mots pendant qu'on parle */}
      {actif && (
        <div className="absolute bottom-full right-0 mb-1 z-50 w-56 max-w-[70vw] bg-slate-900 text-white text-xs rounded-lg shadow-xl px-3 py-2 pointer-events-none">
          <div className="flex items-center gap-1 text-[10px] text-red-300 font-bold mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> À l'écoute…
          </div>
          <div className="leading-snug">{live || <span className="text-slate-400 italic">Parle, le texte apparaît ici…</span>}</div>
        </div>
      )}
    </div>
  );
}
