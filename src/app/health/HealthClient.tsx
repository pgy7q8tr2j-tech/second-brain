"use client";

import { useState } from "react";
import type { DaySummary, Verdict } from "@/lib/healthSummary";
import type { MealItem } from "@/lib/meals";
import TrendView from "./TrendView";
import MealsView from "./MealsView";
import "./health.css";

const VERDICT_COLOR: Record<Verdict, string> = {
  achieved: "var(--hb-sage)",
  under: "var(--hb-banana)",
  over: "var(--hb-tomato)",
  in_progress: "var(--hb-graphite)",
  no_consumption: "var(--hb-graphite)",
  no_record: "var(--hb-graphite)",
};
const VERDICT_SOFT: Record<Verdict, string> = {
  achieved: "var(--hb-sage-soft)",
  under: "var(--hb-banana-soft)",
  over: "var(--hb-tomato-soft)",
  in_progress: "var(--hb-graphite-soft)",
  no_consumption: "var(--hb-graphite-soft)",
  no_record: "var(--hb-graphite-soft)",
};

function fmt(n: number | null): string {
  if (n === null) return "—";
  return Math.round(n).toLocaleString("ja-JP");
}

// 消費・摂取を同じ横幅基準で比べる棒グラフ。円グラフより長さの比較がしやすい。
function BarRow({
  label,
  value,
  max,
  color,
  note,
}: {
  label: string;
  value: number | null;
  max: number;
  color: string;
  note?: string;
}) {
  const pct = value != null && max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="hb-bar-row">
      <span className="hb-bar-label">{label}</span>
      <div className="hb-bar-track">
        <div className="hb-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="hb-bar-value">
        {fmt(value)} kcal
        {note ? <sup className="hb-bar-note">{note}</sup> : null}
      </span>
    </div>
  );
}

function centerText(summary: DaySummary): { big: string; sub: string } {
  const { verdict, consumption, intake } = summary;
  if (verdict === "no_consumption") return { big: "—", sub: "健康データ未受信" };
  if (verdict === "in_progress") {
    const h = consumption.staleHours ?? 0;
    return { big: "途中", sub: `最終受信から${h.toFixed(1)}時間経過` };
  }
  if (verdict === "no_record") return { big: "—", sub: "食事記録なし" };

  const effectiveTotal = (consumption.total ?? summary.consumptionEstimate) as number;
  const diff = effectiveTotal - (intake.totalMax as number);
  const estNote = consumption.estimated ? "(消費は推定) " : "";
  if (diff >= 0) return { big: `あと${fmt(diff)}`, sub: `${estNote}kcal 食べられます` };
  return { big: `${fmt(Math.abs(diff))}`, sub: `${estNote}kcal オーバー` };
}

export default function HealthClient({
  today,
  range,
  mealItems,
}: {
  today: DaySummary;
  range: DaySummary[];
  mealItems: MealItem[];
}) {
  const [tab, setTab] = useState<"today" | "trend" | "meals">("today");
  const color = VERDICT_COLOR[today.verdict];
  const soft = VERDICT_SOFT[today.verdict];
  const { big, sub } = centerText(today);

  const effectiveConsumption = today.consumption.total ?? today.consumptionEstimate;
  const barMax = Math.max(effectiveConsumption ?? 0, today.intake.totalMax ?? 0, 1) * 1.08;

  return (
    <div className="health-root">
      <div className="hb-header">
        <a href="/">← メモ一覧</a>
        <span className="hb-title">健康</span>
        <span style={{ width: 64 }} />
      </div>

      <div className="hb-tabs">
        <button className="hb-tab" data-active={tab === "today"} onClick={() => setTab("today")}>
          今日
        </button>
        <button className="hb-tab" data-active={tab === "trend"} onClick={() => setTab("trend")}>
          推移
        </button>
        <button className="hb-tab" data-active={tab === "meals"} onClick={() => setTab("meals")}>
          食事一覧
        </button>
      </div>

      <div className="hb-main">
        {tab === "today" && (
          <div className="hb-card">
            <div className="hb-center-number" style={{ color }}>
              {big}
            </div>
            <div className="hb-center-sub">{sub}</div>
            {today.intake.hasUnknownKcalItem && (
              <span className="hb-ring-badge" style={{ background: soft, color }}>
                kcal不明あり
              </span>
            )}

            <div className="hb-bars">
              <BarRow
                label="消費"
                value={effectiveConsumption}
                max={barMax}
                color="var(--hb-peacock)"
                note={today.consumption.estimated ? "推定" : undefined}
              />
              <BarRow
                label="摂取"
                value={today.intake.totalMax}
                max={barMax}
                color="var(--hb-tangerine)"
                note={today.intake.hasUnknownKcalItem ? "不明あり" : undefined}
              />
            </div>

            <div className="hb-stat-row">
              <div className="hb-stat">
                <div className="k">最終受信</div>
                <div className="v" style={{ fontSize: 13 }}>
                  {today.consumption.lastSentAt
                    ? new Date(today.consumption.lastSentAt).toLocaleTimeString("ja-JP", {
                        timeZone: "Asia/Tokyo",
                        hour: "2-digit",
                        minute: "2-digit",
                      }) + " JST"
                    : "—"}
                </div>
              </div>
              <div className="hb-stat">
                <div className="k">体重</div>
                <div className="v">{today.weightKg != null ? `${today.weightKg.toFixed(1)} kg` : "—"}</div>
              </div>
            </div>

            <p className="hb-note">
              判定：<b>摂取 ≤ 消費</b>でセージ(黒字)、<b>摂取 &gt; 消費</b>でトマト(赤字)。
              食事記録が無い日はグラファイト。kcal不明の品がある日は黒字でもセージ(確定達成)とは判定しません。
              消費が今日まだ届いていない時は、直近(最大7日)の実測平均を消費目安として使って判定します。
            </p>
          </div>
        )}

        {tab === "trend" && <TrendView range={range} />}
        {tab === "meals" && <MealsView mealItems={mealItems} />}
      </div>
    </div>
  );
}
