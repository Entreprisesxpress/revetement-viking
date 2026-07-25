// Parseur des courriels de formulaire du site web (GoDaddy et autres).
// Logique pure (sans DB) — testée dans lib/lead-web.test.ts.

// Étiquettes reconnues dans les courriels de formulaire (FR + EN, GoDaddy et autres).
const ETIQUETTES: [RegExp, string][] = [
  [/^(nom complet|nom|name|full name|prénom et nom|prenom et nom)$/i, "nom"],
  [/^(courriel|adresse courriel|email|e-mail|email address)$/i, "courriel"],
  [/^(téléphone|telephone|phone|phone number|tél|tel|cell|cellulaire|numéro de téléphone|numero de telephone)$/i, "telephone"],
  [/^(adresse|address|adresse du projet|ville|city)$/i, "adresse"],
  [/^(message|commentaires?|comments?|détails|details|description|projet|votre message|demande)$/i, "message"],
  [/^(service|sujet|subject|type de projet|type de travaux)$/i, "sujet"],
];

/** Parse un corps de courriel de formulaire « Étiquette: valeur » (tolérant). */
export function parserTexteFormulaire(texte: string): Record<string, string> {
  const out: Record<string, string> = {};
  let champCourant: string | null = null;
  for (const ligneBrute of String(texte).split(/\r?\n/)) {
    const ligne = ligneBrute.trim();
    if (!ligne) { champCourant = null; continue; }
    // « Étiquette : valeur » ou « Étiquette » seul (valeur sur les lignes suivantes)
    const m = ligne.match(/^([^:：]{2,40})\s*[:：]\s*(.*)$/);
    let traite = false;
    if (m) {
      for (const [rx, champ] of ETIQUETTES) {
        if (rx.test(m[1].trim())) {
          if (m[2]) out[champ] = out[champ] ? `${out[champ]} ${m[2].trim()}` : m[2].trim();
          champCourant = champ;
          traite = true;
          break;
        }
      }
    } else {
      for (const [rx, champ] of ETIQUETTES) {
        if (rx.test(ligne)) { champCourant = champ; traite = true; break; }
      }
    }
    if (!traite && champCourant) {
      if (champCourant === "message") {
        // Seul le message est multi-lignes : on accumule.
        out.message = out.message ? `${out.message}\n${ligne}` : ligne;
      } else if (!out[champCourant]) {
        // Champ mono-ligne (nom, courriel, téléphone…) : la ligne suivante est la
        // valeur (format « étiquette seule / valeur dessous »), puis on ferme le champ.
        out[champCourant] = ligne;
        champCourant = null;
      } else {
        // Champ mono-ligne déjà rempli : une ligne inattendue (ex. étiquette au
        // mauvais encodage) ne doit PAS polluer la valeur — on l'ignore.
        champCourant = null;
      }
    }
  }
  // Filets : courriel/téléphone détectés n'importe où dans le texte
  if (!out.courriel) {
    const m = String(texte).match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    if (m) out.courriel = m[0];
  } else {
    // Nettoyage : ne garde que la partie qui ressemble vraiment à un courriel.
    const m = out.courriel.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    if (m) out.courriel = m[0];
  }
  if (!out.telephone) {
    const m = String(texte).match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (m) out.telephone = m[0].trim();
  }
  return out;
}
