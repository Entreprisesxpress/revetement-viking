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
  const direct = h("x-real-ip") || h("x-vercel-forwarded-for").split(",").pop()?.trim() || "";
  if (direct) return direct;
  const xff = h("x-forwarded-for").split(",").map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || "inconnue";
}
