import { NextRequest, NextResponse } from "next/server";
import { executerOutilJarvis } from "@/lib/jarvis";
import { finances } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { aujourdhuiMontreal } from "@/lib/date";

export const dynamic = "force-dynamic";

const MOIS = ["", "janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const cad = (n: number) => `${Math.round(n).toLocaleString("fr-CA")} $`;

/** Valeur d'une source du briefing, ou `repli` si elle a échoué (l'échec est journalisé). */
function ou<T>(r: PromiseSettledResult<T>, nom: string, repli: T, manquantes: string[]): T {
  // executerOutilJarvis ne rejette JAMAIS : une panne de base revient en `{ erreur }`
  // RÉSOLU. Compté comme un succès, le briefing disait « NaN $ », « undefined % » et
  // « aucune facture impayée 👍 » sans aucun avertissement — le faux « tout va bien ».
  if (r.status === "fulfilled" && !(r.value as any)?.erreur) return r.value;
  console.error(`[/api/jarvis/briefing] source « ${nom} » indisponible :`, r.status === "rejected" ? ((r.reason as any)?.message || r.reason) : (r.value as any)?.erreur);
  manquantes.push(nom);
  return repli;
}

/** Briefing quotidien composé à partir des données réelles (aucun appel LLM : instantané et gratuit). */
export async function GET(req: NextRequest) {
  try {
    const user = await utilisateurActif(req);
    if (!user) return NextResponse.json({ error: "non authentifié" }, { status: 401 });
    // Jour de MONTRÉAL : en UTC (Vercel), dès 20 h le briefing passait au lendemain, le
    // 31 octobre au soir au mois suivant, et le 31 décembre à 19 h « CA de l'année » = 0 $.
    const aujourdhui = aujourdhuiMontreal();
    const annee = Number(aujourdhui.slice(0, 4));
    const moisCourant = Number(aujourdhui.slice(5, 7));

    // allSettled : une source en panne (ex. véhicules) ne doit pas tuer tout le briefing ;
    // elle est remplacée par un repli vide et nommée dans `sources_manquantes`.
    const manquantes: string[] = [];
    const [rApercu, rFactures, rTaches, rVeh, rFin] = await Promise.allSettled([
      executerOutilJarvis("apercu_entreprise", {}),
      executerOutilJarvis("factures_impayees", {}),
      // Sans filtre de statut : « à faire » du briefing = tout ce qui n'est pas complété
      // (en_cours compris), comme la page Tâches et l'aperçu.
      executerOutilJarvis("taches", { assigne_a: user }),
      executerOutilJarvis("vehicules_assurances", {}),
      finances(annee),
    ]);
    const apercu: any = ou(rApercu, "aperçu", { marge_moyenne_projets_actifs_pct: "?", ca_annee_avant_taxes: 0, marge_nette_annee_avant_taxes: 0, extras_a_facturer: { nombre: 0, montant: 0 }, projets_par_statut: {} }, manquantes);
    const factures: any = ou(rFactures, "factures", { total_du: 0, nombre: 0, en_retard_plus_30j: { nombre: 0, montant: 0 } }, manquantes);
    const taches: any = ou(rTaches, "tâches", { taches: [], nombre: 0 }, manquantes);
    const veh: any = ou(rVeh, "véhicules", { renouvellements_60j: [] }, manquantes);
    const fin: any = ou(rFin, "finances", { mois: [] }, manquantes);

    // « À faire » = tout sauf complété (en_cours compris), comme la page Tâches.
    const tachesOuvertes = (taches.taches || []).filter((t: any) => t.statut !== "complete");
    const tachesRetard = tachesOuvertes.filter((t: any) => t.en_retard);
    const lignes: string[] = [`**📋 Briefing du ${new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Toronto" })}** — salut ${user} !`, ""];

    lignes.push(`**💰 Finances** — Marge moyenne des projets actifs : **${apercu.marge_moyenne_projets_actifs_pct}%**. CA ${annee} (avant taxes) : ${cad(apercu.ca_annee_avant_taxes)}, marge nette : ${cad(apercu.marge_nette_annee_avant_taxes)}.`);

    if (factures.total_du > 0) lignes.push(`**🔴 À encaisser** — ${factures.nombre} facture(s) impayée(s) pour **${cad(factures.total_du)}**${factures.en_retard_plus_30j?.nombre > 0 ? ` (dont ${cad(factures.en_retard_plus_30j.montant)} en retard +30j)` : ""}.`);
    else lignes.push(`**🟢 À encaisser** — aucune facture impayée. 👍`);

    lignes.push(`**✅ Tes tâches** — ${tachesOuvertes.length} à faire${tachesRetard.length ? `, dont **${tachesRetard.length} en retard**` : ""}.${tachesRetard.length ? " À traiter : " + tachesRetard.slice(0, 3).map((t: any) => `« ${t.titre} »`).join(", ") + "." : ""}`);

    if (apercu.extras_a_facturer?.nombre > 0) lignes.push(`**💲 Extras** — ${apercu.extras_a_facturer.nombre} extra(s) à facturer (${cad(apercu.extras_a_facturer.montant)}).`);
    if (apercu.projets_par_statut?.actif) lignes.push(`**🏗️ Chantiers** — ${apercu.projets_par_statut.actif} projet(s) actif(s)${apercu.projets_par_statut.a_venir ? `, ${apercu.projets_par_statut.a_venir} à venir` : ""}.`);
    // Une police EXPIRÉE n'est pas « à renouveler dans 60 jours » : elle est nommée à part.
    if ((veh.expirees || []).length > 0) lignes.push(`**⚠️ Assurances EXPIRÉES** — ${veh.expirees.map((a: any) => `${a.compagnie || a.type} (échue le ${a.date})`).join(", ")}.`);
    if ((veh.renouvellements_60j || []).length > 0) lignes.push(`**🚚 Assurances** — ${veh.renouvellements_60j.length} renouvellement(s) dans les 60 jours : ${veh.renouvellements_60j.map((a: any) => `${a.compagnie || a.type} (${a.date})`).join(", ")}.`);
    if (manquantes.length) lignes.push(`⚠️ Source(s) indisponible(s) ce matin : ${manquantes.join(", ")} — les chiffres correspondants sont à 0.`);

    // Série 6 derniers mois (marge nette) pour le graphique
    const chart = (fin.mois || [])
      .filter((m: any) => m.mois <= moisCourant)
      .slice(-6)
      .map((m: any) => ({ label: MOIS[m.mois], value: Math.round(m.marge || 0) }));

    return NextResponse.json({ ok: true, texte: lignes.join("\n"), chart, chartTitre: `Marge nette mensuelle ${annee} (avant taxes)`, sources_manquantes: manquantes });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "erreur" }, { status: 500 });
  }
}
