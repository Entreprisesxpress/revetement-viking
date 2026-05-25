// Export CSV universel — RFC 4180 compliant, encodage UTF-8 BOM pour Excel

function escape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  // Si contient virgule, guillemet ou newline → quoter et doubler les guillemets
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(rows: Record<string, any>[], colonnes?: string[]): string {
  if (rows.length === 0) return "";
  const cols = colonnes || Object.keys(rows[0]);
  const head = cols.map(escape).join(",");
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(",")).join("\r\n");
  return `﻿${head}\r\n${body}`; // BOM pour Excel
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
