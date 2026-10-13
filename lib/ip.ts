// Adresse IP du client, pour le journal et la limitation de tentatives.
//
// Piège : `x-forwarded-for` est une LISTE que chaque relais allonge, et le client peut y
// mettre ce qu'il veut en tête. Prendre le PREMIER élément (comme avant, à trois endroits
// différents) revient à laisser l'appelant choisir son IP — donc à contourner la limite de
// tentatives au login en envoyant une valeur différente à chaque essai (mesuré en local).
// Ordre de confiance : l'en-tête posé par la plateforme (x-real-ip, x-vercel-forwarded-for),
// sinon le DERNIER élément de x-forwarded-for (ajouté par le relais le plus proche, hors de
// portée du client). Jamais vide : sans en-tête, tous les essais partagent « inconnue »,
// pour que la limite s'applique quand même au lieu de disparaître.

export function ipClient(req: { headers: { get(n: string): string | null } }): string {
  const h = (n: string) => (req.headers.get(n) || "").trim();
  // `x-real-ip` et `x-vercel-forwarded-for` ne sont de confiance QUE posés par Vercel (qui
  // les réécrit). Ailleurs (local, autre hébergeur), un client peut les forger — mesuré :
  // 12 mauvais mots de passe avec un `x-real-ip` différent à chaque essai, jamais de 429.
  const surVercel = !!process.env.VERCEL;
  const direct = surVercel ? (h("x-vercel-forwarded-for").split(",").pop()?.trim() || h("x-real-ip")) : "";
  if (direct) return direct;
  const xff = h("x-forwarded-for").split(",").map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || "inconnue";
}
