import { NextResponse } from "next/server";
import { statsPipelineParClient } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await statsPipelineParClient(), {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=60" },
  });
}
