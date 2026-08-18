// Helpers de date sûrs timezone Montréal (America/Toronto)
// Vercel tourne en UTC → toISOString() décale d'une journée le soir au Québec.

/** Date du jour en heure de Montréal, format YYYY-MM-DD. */
export function aujourdhuiMontreal(): string {
  // Intl.DateTimeFormat avec timeZone garantit la date locale Montréal
  // peu importe la timezone du serveur.
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date()); // "2026-05-25"
}

/** Jour de Montréal d'un horodatage, format YYYY-MM-DD.
 *
 *  Le pendant d'`aujourdhuiMontreal()` côté AFFICHAGE. Les horodatages sont stockés en
 *  UTC (`new Date().toISOString()`), et les découper avec `.slice(0, 10)` rend la date
 *  UTC : un document déposé le 17 août à 20 h à Montréal s'affichait « 2026-08-18 ».
 *  Mesuré à l'écran sur la fiche d'un projet.
 *
 *  Accepte aussi une date déjà nue (« 2026-08-17 ») : elle est rendue telle quelle,
 *  sans être réinterprétée comme minuit UTC — sinon elle reculerait d'un jour.
 *  Une valeur vide ou illisible donne "" plutôt qu'une date inventée. */
export function jourMontreal(valeur: any): string {
  const s = String(valeur || "");
  if (!s) return "";
  if (RX_DATE_ISO.test(s)) return s; // déjà un jour civil : ne pas y toucher
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Vérifie qu'une chaîne est au format YYYY-MM-DD strict. */
export const RX_DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
export function estDateISO(s: any): boolean {
  return typeof s === "string" && RX_DATE_ISO.test(s);
}
