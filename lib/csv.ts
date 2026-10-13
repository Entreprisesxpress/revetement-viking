// Export CSV universel — RFC 4180 compliant, encodage UTF-8 BOM pour Excel

/** Neutralise une cellule qu'Excel, LibreOffice ou Google Sheets exécuteraient comme une
 *  FORMULE : une description saisie « =HYPERLINK(...) » ou « +cmd|' /C calc'!A0 » partait
 *  telle quelle dans l'export et s'exécutait à l'ouverture chez celui qui l'ouvre. Toute
 *  cellule commençant par = + - @, tabulation ou retour chariot est préfixée d'une
 *  apostrophe (le tableur l'affiche comme du texte). Les nombres sont passés tels quels :
 *  seule une CHAÎNE peut porter une formule. */
export function neutraliserFormule(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Séparateur de colonnes : « ; », celui d'Excel en français (Canada), où la virgule est
 *  la décimale. Avec « , », le double-clic ouvrait tout l'export dans UNE colonne et
 *  « 230.5 » restait du texte. La première ligne `sep=;` le dit à Excel quelle que soit
 *  sa langue ; Google Sheets et LibreOffice détectent le séparateur d'eux-mêmes. */
export const SEPARATEUR_CSV = ";";
export const PREFIXE_CSV = `﻿sep=${SEPARATEUR_CSV}\r\n`;

/** Cellule CSV prête à écrire : formule neutralisée, nombre à virgule décimale, puis
 *  quotée si nécessaire. */
export function celluleCSV(v: any): string {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v).replace(".", ",") : neutraliserFormule(String(v));
  // Si contient le séparateur, un guillemet ou un saut de ligne → quoter et doubler les guillemets
  if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Variante « machine » (virgule séparateur, point décimal) pour les fichiers lus par un
 *  programme — le classeur Google Sheets de sauvegarde des heures, pas Excel. */
export function celluleCSVPoint(v: any): string {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v) : neutraliserFormule(String(v));
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(rows: Record<string, any>[], colonnes?: string[]): string {
  if (rows.length === 0) return "";
  const cols = colonnes || Object.keys(rows[0]);
  const head = cols.map(celluleCSV).join(SEPARATEUR_CSV);
  const body = rows.map((r) => cols.map((c) => celluleCSV(r[c])).join(SEPARATEUR_CSV)).join("\r\n");
  return `${PREFIXE_CSV}${head}\r\n${body}`; // BOM + sep= pour Excel
}

export function telechargerCSV(nom: string, contenu: string) {
  const blob = new Blob([contenu], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom.endsWith(".csv") ? nom : `${nom}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exporterCSV(nom: string, rows: Record<string, any>[], colonnes?: string[]) {
  telechargerCSV(nom, toCSV(rows, colonnes));
}
