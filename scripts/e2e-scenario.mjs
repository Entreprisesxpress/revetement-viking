// Scénario d'affaires complet — vérifie les VALEURS métier, pas juste les codes HTTP.
// Montants choisis pour donner des résultats exacts (facteur taxes QC = 1,14975) :
//   22995 $ / 1,14975 = 20 000 $   |   2299,50 $ / 1,14975 = 2 000 $
//   1149,75 $ / 1,14975 = 1 000 $  |   détaxée 500 $ reste 500 $
const U = process.env.BASE || "http://localhost:3114";
let COOKIE = "";
let pass = 0, fail = 0;
const money = (n) => (Math.round(n * 100) / 100);

function check(nom, actuel, attendu, tol = 0.02) {
  const ok = typeof attendu === "number"
    ? Math.abs((actuel ?? NaN) - attendu) <= tol
    : JSON.stringify(actuel) === JSON.stringify(attendu);
  console.log(`  ${ok ? "✅" : "❌"} ${nom}: ${JSON.stringify(actuel)}${ok ? "" : `  (attendu ${JSON.stringify(attendu)})`}`);
  ok ? pass++ : fail++;
  return ok;
}

async function api(path, opts = {}) {
  const r = await fetch(U + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(COOKIE ? { Cookie: COOKIE } : {}), ...(opts.headers || {}) },
  });
  const txt = await r.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt; }
  return { status: r.status, body, raw: r };
}

const section = (t) => console.log(`\n━━━ ${t} ━━━`);

// ─────────────────────────────────────────────────────────────
section("1. Connexion");
{
  const r = await fetch(U + "/api/login", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.77" },
    body: JSON.stringify({ user: "Francis", password: "test-secret-123" }),
  });
  const sc = r.headers.get("set-cookie") || "";
  COOKIE = sc.split(";")[0];
  check("login HTTP", r.status, 200);
  check("cookie v2 émis", /^xpress_auth=v2(%7C|\|)/.test(COOKIE), true);
}

// ─────────────────────────────────────────────────────────────
section("2. Création client + projet");
const client = await api("/api/clients", { method: "POST", body: JSON.stringify({ nom: "Client E2E", courriel: "e2e@test.ca", telephone: "450-555-0000" }) });
check("client créé", client.status, 200);
const clientId = client.body.id ?? client.body.client_id;

const projet = await api("/api/projets", {
  method: "POST",
  body: JSON.stringify({ client_id: clientId, nom: "Projet E2E", prix_contrat: 22995, statut: "actif", date_debut: "2026-07-01" }),
});
check("projet créé", projet.status, 200);
const projetId = projet.body.id;

// ─────────────────────────────────────────────────────────────
section("3. Dépenses (taxable + détaxée)");
const d1 = await api("/api/depenses", { method: "POST", body: JSON.stringify({ projet_id: projetId, montant: 1149.75, date: "2026-07-05", fournisseur: "Fournisseur Taxable", categorie: "matériaux", detaxe: 0 }) });
check("dépense taxable 1149,75 $", d1.status, 200);
const d2 = await api("/api/depenses", { method: "POST", body: JSON.stringify({ projet_id: projetId, montant: 500, date: "2026-07-06", fournisseur: "Fournisseur Detaxe", categorie: "permis", detaxe: 1 }) });
check("dépense détaxée 500 $", d2.status, 200);

section("4. Main-d'œuvre : 2 × 20 h × 50 $/h = 2 000 $ (max 24 h par entrée)");
const h1 = await api("/api/heures", { method: "POST", body: JSON.stringify({ projet_id: projetId, date: "2026-07-07", heures: 20, employe: "Gabriel", taux_horaire: 50, description: "Pose 1" }) });
const h2 = await api("/api/heures", { method: "POST", body: JSON.stringify({ projet_id: projetId, date: "2026-07-08", heures: 20, employe: "Gabriel", taux_horaire: 50, description: "Pose 2" }) });
check("heures ajoutées (2 entrées)", h1.status === 200 && h2.status === 200, true);
const hRefus = await api("/api/heures", { method: "POST", body: JSON.stringify({ projet_id: projetId, date: "2026-07-09", heures: 30, employe: "Gabriel", taux_horaire: 50 }) });
check("garde-fou : >24 h sur une entrée refusé", hRefus.status, 400);

section("5. Extra 2 299,50 $ → facturé");
const ex = await api("/api/extras", { method: "POST", body: JSON.stringify({ projet_id: projetId, description: "Extra E2E", nature: "montant", montant: 2299.50, date: "2026-07-08" }) });
check("extra créé", ex.status, 200);
const exId = ex.body.id;
const exPatch = await api("/api/extras", { method: "PATCH", body: JSON.stringify({ id: exId, statut: "charge" }) });
check("extra marqué facturé", exPatch.status, 200);

// ─────────────────────────────────────────────────────────────
section("6. RENTABILITÉ DU PROJET (le calcul critique)");
{
  const r = await api("/api/projets");
  const p = (Array.isArray(r.body) ? r.body : r.body.projets || []).find((x) => x.id === projetId);
  if (!p) { console.log("  ❌ projet introuvable dans la liste"); fail++; }
  else {
    check("prix contrat", money(p.prix_contrat), 22995);
    check("extras facturés", money(p.extras_factures), 2299.50);
    check("revenu avant taxes (22995+2299,50)/1,14975", money(p.revenu_avant_taxes), 22000);
    check("dépenses payées (taxes incl., pour affichage)", money(p.total_depenses), 1649.75);
    check("dépenses avant taxes (1000 + 500 détaxée)", money(p.total_depenses_avant_taxes), 1500);
    check("main-d'œuvre", money(p.cout_main_oeuvre), 2000);
    check("coût total", money(p.cout_total), 3500);
    check("MARGE (22000 − 3500)", money(p.marge), 18500);
    check("marge %", money(p.marge_pct), 84.09, 0.05);
  }
}

// ─────────────────────────────────────────────────────────────
section("7. Règle « seuls les projets COMPLÉTÉS comptent au CA »");
let caAvant = 0;
{
  const f = await api("/api/finances");
  const mois = f.body.mois || [];
  caAvant = mois.reduce((s, m) => s + (m.revenu_avant_taxes || 0), 0);
  const depAvant = mois.reduce((s, m) => s + (m.depenses_avant_taxes || 0), 0);
  const moAvant = mois.reduce((s, m) => s + (m.mo || 0), 0);
  check("CA exclut le projet actif", money(caAvant), 0);
  check("dépenses excluent le projet actif", money(depAvant), 0);
  check("main-d'œuvre exclut le projet actif", money(moAvant), 0);
}

section("8. Passage à COMPLÉTÉ (= facturé)");
{
  const r = await api("/api/projets", { method: "PATCH", body: JSON.stringify({ id: projetId, statut: "complete", date_fin_reelle: "2026-07-15" }) });
  check("projet complété", r.status, 200);
  const f = await api("/api/finances");
  const mois = f.body.mois || [];
  const ca = mois.reduce((s, m) => s + (m.revenu_avant_taxes || 0), 0);
  const dep = mois.reduce((s, m) => s + (m.depenses_avant_taxes || 0), 0);
  const mo = mois.reduce((s, m) => s + (m.mo || 0), 0);
  const marge = mois.reduce((s, m) => s + (m.marge || 0), 0);
  check("CA compte maintenant le projet", money(ca), 22000);
  check("dépenses comptées", money(dep), 1500);
  check("main-d'œuvre comptée", money(mo), 2000);
  check("marge mensuelle totale", money(marge), 18500);
}

// ─────────────────────────────────────────────────────────────
section("9. Recherche (par nom ET par montant)");
{
  const parNom = await api("/api/recherche?q=Fournisseur%20Taxable");
  const n1 = Array.isArray(parNom.body) ? parNom.body.length : (parNom.body.resultats || []).length;
  check("recherche par fournisseur trouve ≥1", n1 > 0, true);
  const parMontant = await api("/api/recherche?q=1149.75");
  const n2 = Array.isArray(parMontant.body) ? parMontant.body.length : (parMontant.body.resultats || []).length;
  check("recherche par montant trouve ≥1", n2 > 0, true);
  const parProjet = await api("/api/recherche?q=Projet%20E2E");
  const n3 = Array.isArray(parProjet.body) ? parProjet.body.length : (parProjet.body.resultats || []).length;
  check("recherche par projet trouve ≥1", n3 > 0, true);
}

// ─────────────────────────────────────────────────────────────
section("10. Tâches récurrentes (hebdo → +7 jours)");
{
  const t = await api("/api/taches", { method: "POST", body: JSON.stringify({ titre: "Tâche hebdo E2E", assigne_a: "Francis", date_due: "2026-07-20", recurrence: "hebdo", priorite: 3 }) });
  check("tâche récurrente créée", t.status, 200);
  const id = t.body.id;
  const done = await api("/api/taches", { method: "PATCH", body: JSON.stringify({ id, statut: "complete", date_completion: "2026-07-20" }) });
  check("tâche complétée", done.status, 200);
  const liste = await api("/api/taches");
  const arr = Array.isArray(liste.body) ? liste.body : (liste.body.taches || []);
  const suivante = arr.find((x) => x.titre === "Tâche hebdo E2E" && x.statut !== "complete");
  check("prochaine occurrence créée", !!suivante, true);
  if (suivante) check("échéance = +7 jours (2026-07-27)", (suivante.date_due || "").slice(0, 10), "2026-07-27");
}

// ─────────────────────────────────────────────────────────────
section("11. Facture + solde dû");
{
  const f = await api("/api/factures", { method: "POST", body: JSON.stringify({ projet_id: projetId, montant: 10000, date: "2026-07-16", numero: "F-E2E-1" }) });
  check("facture créée", f.status, 200);
  const lst = await api(`/api/factures?projet_id=${projetId}`);
  const arr = Array.isArray(lst.body) ? lst.body : [];
  check("1 facture au projet", arr.length, 1);
  const impayees = await api("/api/projets");
  const p = (Array.isArray(impayees.body) ? impayees.body : impayees.body.projets || []).find((x) => x.id === projetId);
  if (p) check("total facturé = 10 000 $", money(p.total_facture), 10000);
}

// ─────────────────────────────────────────────────────────────
section("12. Contrat public : signature par token (sans authentification)");
{
  const c = await api("/api/contrats-pipeline", {
    method: "POST",
    body: JSON.stringify({ client_id: clientId, data_json: { test: true }, pdf_brouillon: "data:application/pdf;base64,JVBERi0=" }),
  });
  check("contrat créé", c.status, 200);
  const token = c.body.token;
  check("token 48 caractères hex (CSPRNG)", /^[0-9a-f]{48}$/.test(token || ""), true);

  // Accès PUBLIC (sans cookie)
  const pub = await fetch(`${U}/api/contrats-pipeline/${token}`);
  check("lecture publique du contrat", pub.status, 200);
  const mauvais = await fetch(`${U}/api/contrats-pipeline/${"0".repeat(48)}`);
  check("token invalide → 404", mauvais.status, 404);

  // Signature (publique)
  const sign = await fetch(`${U}/api/contrats-pipeline/${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature_dataurl: "data:image/png;base64,iVBORw0KGgo=", signature_nom: "Client E2E", pdf_signe: "data:application/pdf;base64,JVBERi0=" }),
  });
  check("signature acceptée", sign.status, 200);
  const resign = await fetch(`${U}/api/contrats-pipeline/${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature_dataurl: "x", signature_nom: "Fraudeur", pdf_signe: "y" }),
  });
  check("2e signature refusée (409)", resign.status, 409);
}

// ─────────────────────────────────────────────────────────────
section("13. Tableau de bord + briefing Jarvis (données réelles)");
{
  const d = await api("/api/dashboard");
  check("dashboard répond", d.status, 200);
  const b = await api("/api/jarvis/briefing");
  check("briefing Jarvis répond", b.status, 200);
  check("briefing contient du texte", typeof b.body.texte === "string" && b.body.texte.length > 20, true);
}

console.log(`\n═══════════════════════════════════`);
console.log(`  RÉSULTAT : ${pass} réussis · ${fail} échoués`);
console.log(`═══════════════════════════════════`);
process.exit(fail > 0 ? 1 : 0);
