// Sentry-light : stocke les erreurs client envoyées par error.tsx dans une table dédiée
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitDepasse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
    // Anti-DOS : max 20 erreurs / 10 min / IP
    if (await rateLimitDepasse("client.erreur_log", ip, 20, 10)) {
      return NextResponse.json({ ok: false, error: "rate-limited" }, { status: 429 });
    }
    const b = await req.json();
    // Cap taille payload pour éviter remplissage table
    if (JSON.stringify(b).length > 8000) {
      return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
    }
    const c = db();
    await c.execute({
      sql: `CREATE TABLE IF NOT EXISTS erreurs_client (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        message TEXT,
        stack TEXT,
        digest TEXT,
        path TEXT,
        user_agent TEXT
      )`,
      args: [],
    });
    await c.execute({
      sql: `INSERT INTO erreurs_client (date, message, stack, digest, path, user_agent) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        new Date().toISOString(),
        (b.message || "").slice(0, 1000),
        (b.stack || "").slice(0, 4000),
        b.digest || null,
        b.path || null,
        b.userAgent || null,
      ],
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}

export async function GET() {
  try {
    const c = db();
    const r = await c.execute("SELECT * FROM erreurs_client ORDER BY id DESC LIMIT 50");
    return NextResponse.json(r.rows);
  } catch {
    return NextResponse.json([]);
  }
}
