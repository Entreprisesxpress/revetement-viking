import { NextRequest, NextResponse } from "next/server";
import { rechercheGlobale } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json([]);
    return NextResponse.json(await rechercheGlobale(q));
  } catch (e) {
    console.error("[/api/recherche]", e);
    return NextResponse.json([], { status: 200 }); // jamais casser la barre de recherche
  }
}
