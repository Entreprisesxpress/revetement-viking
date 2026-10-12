import { NextResponse } from "next/server";
import { pingDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Endpoint ultra-léger de réchauffement : garde la fonction serverless ET la
// connexion Turso « chaudes » pour éliminer les démarrages à froid (~1,7 s).
// Public (voir proxy.ts) — pinguée toutes les 5 min par GitHub Actions.
export async function GET() {
  const t0 = Date.now();
  let db = false;
  try { db = await pingDb(); } catch { /* ignore */ }
  // Le commit déployé (fourni par Vercel) : c'est la seule façon de PROUVER, sans
  // session, qu'une livraison poussée sur main est bien celle que sert la prod. Le
  // dépôt est public, le SHA ne révèle rien.
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null;
  return NextResponse.json(
    { ok: true, db, ms: Date.now() - t0, commit },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
