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

// 消費(外側)・摂取(内側)を同じ基準(目標摂取=消費-500)で描く同心円リング。
// 目標摂取を1周として、消費はその分+500kcalぶん必ず一周を超えて描かれる
// (これが「まだ食べられる量」の視覚的な余白になる)。摂取が目標を超えたら
// 重ねて一周以上描く。
function Ring({ summary }: { summary: DaySummary }) {
  const SIZE = 260;
  const CENTER = SIZE / 2;
  const R_OUT = 110;
  const R_IN = 82;
  const STROKE = 20;

  const targetIntake = summary.target.intake;
  const hasScale = targetIntake !== null && targetIntake > 0;

  const consumptionFrac = hasScale && summary.consumption.total !== null
    ? summary.consumption.total / (targetIntake as number)
    : 0;
  const intakeFrac = hasScale && summary.intake.totalMax !== null
    ? summary.intake.totalMax / (targetIntake as number)
    : 0;

  const arc = (radius: number, frac: number, color: string, stroke: number) => {
    const laps = Math.max(0, frac);
    const full = Math.floor(laps);
    const remainder = laps - full;
    const circumference = 2 * Math.PI * radius;
    const dash = Math.min(1, remainder) * circumference;
    return (
      <>
        {/* 完了した周(フル円)を薄く重ねて「何周したか」を見せる */}
        {Array.from({ length: full }).map((_, i) => (
          <circle
            key={i}
            cx={CENTER}
            cy={CENTER}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            opacity={0.35 + i * 0.15}
          />
        ))}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
      </>
    );
  };

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" role="img" aria-label="今日のカロリー収支リング">
      <circle cx={CENTER} cy={CENTER} r={R_OUT} fill="none" stroke="var(--hb-separator)" strokeWidth={STROKE} />
      <circle cx={CENTER} cy={CENTER} r={R_IN} fill="none" stroke="var(--hb-separator)" strokeWidth={STROKE} />
      {hasScale && arc(R_OUT, consumptionFrac, "var(--hb-peacock)", STROKE)}
      {hasScale && arc(R_IN, intakeFrac, "var(--hb-tangerine)", STROKE)}
    </svg>
  );
}

function centerText(summary: DaySummary): { big: string; sub: string } {
  const { verdict, target, consumption, intake } = summary;
  if (verdict === "no_consumption") return { big: "—", sub: "健康データ未受信" };
  if (verdict === "in_progress") {
    const h = consumption.staleHours ?? 0;
    return { big: "途中", sub: `最終受信から${h.toFixed(1)}時間経過` };
  }
  if (verdict === "no_record") return { big: "—", sub: "食事記録なし" };

  const diff = (target.intake as number) - (intake.totalMax as number);
  if (diff >= 0) return { big: `あと${fmt(diff)}`, sub: "kcal 食べられます" };
  return { big: `${fmt(Math.abs(diff))}`, sub: "kcal オーバー" };
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
            <div className="hb-ring-wrap">
              <Ring summary={today} />
              <div className="hb-ring-center">
                <div className="hb-ring-number" style={{ color }}>
                  {big}
                </div>
                <div className="hb-ring-sub">{sub}</div>
                {today.intake.hasUnknownKcalItem && (
                  <span className="hb-ring-badge" style={{ background: soft, color }}>
                    kcal不明あり
                  </span>
                )}
              </div>
            </div>

            <div className="hb-legend-row">
              <span><span className="dot" style={{ background: "var(--hb-peacock)" }} />消費</span>
              <span><span className="dot" style={{ background: "var(--hb-tangerine)" }} />摂取</span>
            </div>

            <div className="hb-stat-row">
              <div className="hb-stat">
                <div className="k">消費(アクティブ+安静時)</div>
                <div className="v">{fmt(today.consumption.total)} kcal</div>
              </div>
              <div className="hb-stat">
                <div className="k">摂取(上限合計)</div>
                <div className="v">{fmt(today.intake.totalMax)} kcal</div>
              </div>
              <div className="hb-stat">
                <div className="k">目標摂取(消費−{today.target.deficit})</div>
                <div className="v">{fmt(today.target.intake)} kcal</div>
              </div>
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
            </div>

            <p className="hb-note">
              判定：<b>摂取 ≤ 消費−{today.target.deficit}</b> でセージ(達成)、
              <b>消費−{today.target.deficit} &lt; 摂取 ≤ 消費</b> でバナナ、
              <b>摂取 &gt; 消費</b> でトマト。データ欠損・途中はグラファイト。
              kcal不明の品がある日は達成(セージ)と判定しません。
            </p>
          </div>
        )}

        {tab === "trend" && <TrendView range={range} />}
        {tab === "meals" && <MealsView mealItems={mealItems} />}
      </div>
    </div>
  );
}
