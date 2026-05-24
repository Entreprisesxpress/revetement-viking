import { NextRequest, NextResponse } from "next/server";
import { listerPaiePeriodes, marquerPayePeriode } from "@/lib/db";

export async function GET(req: NextRequest) {
  const employe = req.nextUrl.searchParams.get("employe") || undefined;
  const limit = +(req.nextUrl.searchParams.get("limit") || "12");
  return NextResponse.json(await listerPaiePeriodes(employe, limit));
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await marquerPayePeriode(+b.id, !!b.paye, b.date_paiement, b.note);
  return NextResponse.json({ ok: true });
}
