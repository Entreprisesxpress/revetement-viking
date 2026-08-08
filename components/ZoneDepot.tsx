"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";

/** Enrobe n'importe quel contenu (bouton, section, modale) pour le rendre receveur de
 *  glisser-déposer, en plus de son sélecteur de fichier habituel. N'impose pas de mise en
 *  page : un survol pendant le drag affiche un bandeau superposé, et onFichiers reçoit les
 *  fichiers déposés (même filtrage `accept` qu'un <input type="file">). */
export default function ZoneDepot({
  onFichiers,
  accept,
  multiple = true,
  disabled = false,
  className = "",
  messageSurvol = "📂 Dépose le(s) fichier(s) ici",
  children,
}: {
  onFichiers: (fichiers: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  messageSurvol?: string;
  children: ReactNode;
}) {
  const [survole, setSurvole] = useState(false);
  // Compte les dragenter/dragleave (les enfants du conteneur en déclenchent aussi) pour ne
  // retirer le survol que quand on quitte vraiment la zone, pas un enfant interne.
  const profondeur = useRef(0);

  const accepteType = (f: File): boolean => {
    if (!accept) return true;
    return accept.split(",").map((t) => t.trim()).filter(Boolean).some((t) => {
      if (t === "*" || t === "*/*") return true;
      if (t.startsWith(".")) return f.name.toLowerCase().endsWith(t.toLowerCase());
      if (t.endsWith("/*")) return f.type.startsWith(t.slice(0, -1));
      return f.type === t;
    });
  };

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (disabled || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
    profondeur.current++;
    setSurvole(true);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault(); e.stopPropagation();
    profondeur.current = Math.max(0, profondeur.current - 1);
    if (profondeur.current === 0) setSurvole(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    profondeur.current = 0;
    setSurvole(false);
    if (disabled) return;
    const tous = Array.from(e.dataTransfer.files || []);
    const filtres = tous.filter(accepteType);
    if (!filtres.length) return;
    onFichiers(multiple ? filtres : filtres.slice(0, 1));
  };

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative ${className}`}
    >
      {children}
      {survole && !disabled && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-emerald-500 bg-emerald-50/95 pointer-events-none">
          <span className="text-sm font-bold text-emerald-800 px-2 text-center">{messageSurvol}</span>
        </div>
      )}
    </div>
  );
}
