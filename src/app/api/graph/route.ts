import { NextResponse } from "next/server";
import { getGraphData } from "@/lib/memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 認証は middleware (cookie sb_session) が担当
export async function GET() {
  try {
    const data = await getGraphData();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
