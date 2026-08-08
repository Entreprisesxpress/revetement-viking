// Backup complet de la DB → Drive (Viking/Backups/backup-YYYY-MM-DD-HHMM.json)
import { NextRequest, NextResponse } from "next/server";
import { contenuSauvegarde, TABLES_EXCLUES_SAUVEGARDE, toutesHeuresPourExport } from "@/lib/db";
import { driveEstActif, trouverOuCreerSousDossier, uploaderFichier, sauvegarderClasseurCSV } from "@/lib/drive";

export const dynamic = "force-dynamic";

// Échappement CSV (guillemets, virgules, sauts de ligne)
function csvEchap(v: any): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function construireCSVHeures(lignes: any[]): string {
  const entete = ["Date", "Employé", "Projet", "Heures", "Taux ($/h)", "Coût ($)", "Description", "Saisi par"];
  const rows = lignes.map((h) => [
    h.date, h.employe || "", h.projet_nom || "", h.heures ?? "",
    (h.taux_horaire ?? 0), ((h.heures || 0) * (h.taux_horaire || 0)).toFixed(2),
    h.description || "", h.ajoute_par || "",
  ].map(csvEchap).join(","));
  return [entete.join(","), ...rows].join("\n");
}

/** Sauvegarde lisible des heures dans un Google Sheet "horaireemploye2026" (back-up dédié).
 *  Best-effort : ne fait jamais échouer le backup principal. */
async function exporterHeuresVersSheet(): Promise<{ ok: boolean; lignes?: number; lien?: string; error?: string }> {
  try {
    const lignes = await toutesHeuresPourExport();
    const csv = construireCSVHeures(lignes);
    const r = await sauvegarderClasseurCSV(
      "horaireemploye2026", csv,
      `Heures employés · ${lignes.length} entrées · maj ${new Date().toLocaleDateString("fr-CA")}`
    );
    return { ok: true, lignes: lignes.length, lien: r.webViewLink };
  } catch (e: any) {
    return { ok: false, error: e?.message || "erreur export heures" };
  }
}

async function effectuerBackup(): Promise<{ ok: boolean; nom?: string; webViewLink?: string; tailles?: any; error?: string; heures_sheet?: any }> {
  if (!(await driveEstActif())) return { ok: false, error: "Drive non actif — connecte Drive avant de lancer un backup." };
  // Toutes les tables métier, pilotées par la liste unique TABLES_SAUVEGARDE de lib/db.ts
  // (la même que celle utilisée par /api/restore, donc impossible qu'elles divergent).
  // Les exclusions volontaires — blobs, cache, et surtout les jetons OAuth — sont listées
  // avec leur raison dans TABLES_EXCLUES_SAUVEGARDE et reportées dans le fichier.
  const { donnees, counts } = await contenuSauvegarde();
  const dump = {
    version: 2,
    date_backup: new Date().toISOString(),
    app: "Revêtement Viking",
    counts,
    exclus: TABLES_EXCLUES_SAUVEGARDE,
    ...donnees,
  };
  const json = JSON.stringify(dump, null, 2);
  const dataUrl = `data:application/json;base64,${Buffer.from(json).toString("base64")}`;
  const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const nom = `backup-${ts}.json`;
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const dossierId = await trouverOuCreerSousDossier("Backups");
  const r = await uploaderFichier({ nom, dataUrl, dossierId, description: `Backup DB · ${total} enregistrements · ${counts.projets || 0} projets · ${counts.clients || 0} clients · ${counts.contrats_signes || 0} contrats signés` });
  // Back-up lisible des heures dans un Google Sheet dédié (best-effort, ne bloque pas).
  const heuresSheet = await exporterHeuresVersSheet();
  return { ok: true, nom, webViewLink: r.webViewLink, tailles: dump.counts, heures_sheet: heuresSheet };
}

export async function POST(req: NextRequest) {
  try {
    const r = await effectuerBackup();
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// GET pour cron Vercel — protégé par Authorization: Bearer CRON_SECRET
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  // SÉCURITÉ : pas de fallback permissif. Si CRON_SECRET n'est pas configuré,
  // la route est fermée (503). Si configuré, on exige le Bearer exact.
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET non configuré — route désactivée" }, { status: 503 });
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await effectuerBackup();
    if (!r.ok) {
      // Alerte : backup échoué — log dans Sentry-light pour visibilité
      try {
        await fetch(new URL("/api/log-erreur", req.url).toString(), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Backup échoué: ${r.error}`, path: "/api/backup", userAgent: "cron-vercel" }),
        });
      } catch {}
    }
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
