"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onTranscript: (texte: string) => void;
  langue?: string;            // défaut fr-CA
  taille?: "sm" | "md";       // mini ou normal
  titre?: string;
}

/** Bouton micro pour dictée vocale (Web Speech API).
 *  Quand on parle, le texte transcrit est concaténé à la valeur courante via onTranscript.
 *  Marche sur Chrome desktop + Chrome/Edge Android. iOS Safari : limité. */
export default function MicVocal({ onTranscript, langue = "fr-CA", taille = "md", titre }: Props) {
  const [actif, setActif] = useState(false);
  const [supporte, setSupporte] = useState(true);
  const recoRef = useRef<any>(null);

  useEffect(() => {
    const SR = (typeof window !== "undefined") && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) { setSupporte(false); return; }
  }, []);

  const demarrer = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const reco = new SR();
    reco.lang = langue;
    reco.continuous = true;
    reco.interimResults = false;
    reco.onresult = (e: any) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) t += e.results[i][0].transcript + " ";
      }
      if (t.trim()) onTranscript(t.trim());
    };
    reco.onend = () => setActif(false);
    reco.onerror = () => setActif(false);
    reco.start();
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
    <button
      type="button"
      onClick={actif ? arreter : demarrer}
      className={`${baseClass} ${actif ? "bg-red-600 hover:bg-red-500 text-white animate-pulse" : "bg-slate-200 hover:bg-slate-300 text-slate-700"} transition`}
      title={titre || (actif ? "Cliquer pour arrêter la dictée" : "Dicter (français Canada)")}
      aria-label={actif ? "Arrêter la dictée vocale" : "Démarrer la dictée vocale"}
    >
      {actif ? "🔴 Stop" : "🎤"}
    </button>
  );
}
