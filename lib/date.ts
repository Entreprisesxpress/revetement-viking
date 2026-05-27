// Helpers de date sûrs timezone Montréal (America/Toronto)
// Vercel tourne en UTC → toISOString() décale d'une journée le soir au Québec.

/** Date du jour en heure de Montréal, format YYYY-MM-DD. */
export function aujourdhuiMontreal(): string {
  // Intl.DateTimeFormat avec timeZone garantit la date locale Montréal
  // peu importe la timezone du serveur.
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date()); // "2026-05-25"
}

/** Vérifie qu'une chaîne est au format YYYY-MM-DD strict. */
export const RX_DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
export function estDateISO(s: any): boolean {
  return typeof s === "string" && RX_DATE_ISO.test(s);
}
