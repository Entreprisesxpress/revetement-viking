import { NextRequest, NextResponse } from "next/server";
import { ajouterPushSubscription, db, initDb } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { lireCorps } from "@/lib/requete";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
}

export async function POST(req: NextRequest) {
  const user = await utilisateurActif(req);
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  if (!b?.endpoint || typeof b.endpoint !== "string" || !b?.keys?.p256dh || !b?.keys?.auth) {
    return NextResponse.json({ error: "subscription invalide" }, { status: 400 });
  }
  await ajouterPushSubscription({
    utilisateur: user,
    endpoint: b.endpoint,
    p256dh: String(b.keys.p256dh),
    auth: String(b.keys.auth),
    user_agent: req.headers.get("user-agent") || undefined,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await utilisateurActif(req);
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b?.endpoint || typeof b.endpoint !== "string") return NextResponse.json({ error: "endpoint requis" }, { status: 400 });
  // On ne retire que SES abonnements : avant, n'importe quel utilisateur connecté pouvait
  // désabonner l'autre en devinant (ou en ayant vu) l'URL de son endpoint.
  await initDb();
  await db().execute({ sql: "DELETE FROM push_subscriptions WHERE endpoint = ? AND utilisateur = ?", args: [b.endpoint, user] });
  return NextResponse.json({ ok: true });
}
