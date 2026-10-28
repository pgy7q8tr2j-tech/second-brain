import { NextResponse } from "next/server";
import { getDaySummary, todayJST } from "@/lib/healthSummary";
import type { Verdict } from "@/lib/healthSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// iPhone ホーム画面ウィジェット (Scriptable) 用の軽量エンドポイント。
// 認証は MCP/ヘルスケア受け口と同じ方式 (Bearer ヘッダ or ?token=/?key= クエリ)。
// WIDGET_TOKEN は他のトークンとは別の秘密にする。

// 判定色のHEX値。出典は src/app/health/health.css のコメントを参照
// (Google Calendar の colors.get を3つの独立したOSS実装で相互確認済み)。
const VERDICT_COLOR: Record<Verdict, string> = {
  achieved: "#33b679", // Sage
  under: "#f6bf26", // Banana
  over: "#d50000", // Tomato
  in_progress: "#616161", // Graphite
  no_consumption: "#616161", // Graphite
  no_record: "#616161", // Graphite
};
const PEACOCK = "#039be5";
const TANGERINE = "#f4511e";

function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length === b.length ? 0 : 1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function checkAuth(req: Request): boolean {
  const token = process.env.WIDGET_TOKEN;
  if (!token) return false;

  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  if (auth.length === expected.length && timingSafeEqual(auth, expected)) return true;

  const url = new URL(req.url);
  const q = url.searchParams.get("token") ?? url.searchParams.get("key") ?? "";
  if (q.length === token.length && timingSafeEqual(q, token)) return true;

  return false;
}

function centerText(summary: Awaited<ReturnType<typeof getDaySummary>>): { big: string; sub: string } {
  const { verdict, consumption, intake } = summary;
  if (verdict === "no_consumption") return { big: "—", sub: "健康データ未受信" };
  if (verdict === "in_progress") return { big: "途中", sub: "消費データが更新待ち" };
  if (verdict === "no_record") return { big: "—", sub: "食事記録なし" };

  // 基準は消費と摂取の差のみ(目標の赤字分は使わない)
  const effectiveTotal = (consumption.total ?? summary.consumptionEstimate) as number;
  const diff = effectiveTotal - (intake.totalMax as number);
  const estNote = consumption.estimated ? "(消費は推定) " : "";
  if (diff >= 0) return { big: `あと${Math.round(diff)}`, sub: `${estNote}kcal 食べられます` };
  return { big: `${Math.round(Math.abs(diff))}`, sub: `${estNote}kcal オーバー` };
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await getDaySummary(todayJST());
    const { big, sub } = centerText(summary);
    const effectiveConsumption = summary.consumption.total ?? summary.consumptionEstimate;

    return NextResponse.json({
      date: summary.date,
      verdict: summary.verdict,
      color: VERDICT_COLOR[summary.verdict],
      ringColors: { consumption: PEACOCK, intake: TANGERINE },
      big,
      sub,
      consumption: {
        total: effectiveConsumption,
        estimated: summary.consumption.estimated,
      },
      intake: {
        totalMax: summary.intake.totalMax,
        hasUnknownKcalItem: summary.intake.hasUnknownKcalItem,
      },
      lastSentAt: summary.consumption.lastSentAt,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
