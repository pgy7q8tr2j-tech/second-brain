"use client";

import { useMemo, useState } from "react";
import type { DaySummary, Verdict } from "@/lib/healthSummary";

const VERDICT_COLOR: Record<Verdict, string> = {
  achieved: "var(--hb-sage)",
  under: "var(--hb-banana)",
  over: "var(--hb-tomato)",
  in_progress: "var(--hb-graphite)",
  no_consumption: "var(--hb-graphite)",
  no_record: "var(--hb-graphite)",
};

function fmtMD(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}
function round(n: number): number {
  return Math.round(n);
}

type Period = "day" | "week" | "month";

export default function TrendView({ range }: { range: DaySummary[] }) {
  const [period, setPeriod] = useState<Period>("day");
  const [windowDays, setWindowDays] = useState(30);

  const dayWindow = useMemo(() => range.slice(-windowDays), [range, windowDays]);

  const counts = useMemo(() => {
    const c: Record<Verdict, number> = {
      achieved: 0,
      under: 0,
      over: 0,
      in_progress: 0,
      no_consumption: 0,
      no_record: 0,
    };
    for (const d of dayWindow) c[d.verdict]++;
    return c;
  }, [dayWindow]);

  return (
    <div className="hb-card">
      <div className="hb-seg">
        {(["day", "week", "month"] as Period[]).map((p) => (
          <button
            key={p}
            className="hb-seg-btn"
            data-active={period === p}
            onClick={() => setPeriod(p)}
          >
            {p === "day" ? "日" : p === "week" ? "週" : "月"}
          </button>
        ))}
      </div>

      {period === "day" && (
        <>
          <div className="hb-window-row">
            {[14, 30, 60, 90].map((w) => (
              <button
                key={w}
                className="hb-window-btn"
                data-active={windowDays === w}
                onClick={() => setWindowDays(w)}
              >
                {w}日
              </button>
            ))}
          </div>
          <DayLineChart days={dayWindow} />
          <div className="hb-count-row">
            <CountChip color="var(--hb-sage)" label="達成" n={counts.achieved} />
            <CountChip color="var(--hb-banana)" label="未達成" n={counts.under} />
            <CountChip color="var(--hb-tomato)" label="オーバー" n={counts.over} />
            <CountChip color="var(--hb-graphite)" label="記録なし等" n={counts.no_record + counts.no_consumption + counts.in_progress} />
          </div>
        </>
      )}

      {period === "week" && <PeriodList days={range} groupBy="week" />}
      {period === "month" && <PeriodList days={range} groupBy="month" />}
    </div>
  );
}

function CountChip({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span className="hb-count-chip">
      <span className="dot" style={{ background: color }} />
      {label} {n}
    </span>
  );
}

// ---- 日: 折れ線グラフ (消費・摂取・目標摂取 + 差分の塗り + 体重の副軸) ----
function DayLineChart({ days }: { days: DaySummary[] }) {
  const W = Math.max(320, days.length * 26);
  const H = 220;
  const PAD_L = 44;
  const PAD_R = 44;
  const PAD_T = 14;
  const PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const kcalValues: number[] = [];
  const weightValues: number[] = [];
  for (const d of days) {
    if (d.consumption.total != null) kcalValues.push(d.consumption.total);
    if (d.target.intake != null) kcalValues.push(d.target.intake);
    if (d.intake.totalMax != null) kcalValues.push(d.intake.totalMax);
    if (d.weightKg != null) weightValues.push(d.weightKg);
  }
  const kcalMax = kcalValues.length ? Math.max(...kcalValues) * 1.1 : 2500;
  const kcalMin = 0;
  const hasWeight = weightValues.length > 1;
  const wMax = hasWeight ? Math.max(...weightValues) + 0.5 : 0;
  const wMin = hasWeight ? Math.min(...weightValues) - 0.5 : 0;

  const x = (i: number) => PAD_L + (days.length <= 1 ? plotW / 2 : (i / (days.length - 1)) * plotW);
  const yKcal = (v: number) => PAD_T + plotH - ((v - kcalMin) / (kcalMax - kcalMin || 1)) * plotH;
  const yW = (v: number) => PAD_T + plotH - ((v - wMin) / (wMax - wMin || 1)) * plotH;

  const linePath = (getValue: (d: DaySummary) => number | null, yFn: (v: number) => number) => {
    let path = "";
    let open = false;
    days.forEach((d, i) => {
      const v = getValue(d);
      if (v == null) {
        open = false;
        return;
      }
      const cmd = open ? "L" : "M";
      path += `${cmd}${x(i).toFixed(1)},${yFn(v).toFixed(1)} `;
      open = true;
    });
    return path.trim();
  };

  const areaPath = () => {
    // 摂取〜目標摂取 の間を塗る(差分の可視化)。両方そろっている区間だけ。
    const segs: string[] = [];
    let seg: { i: number; a: number; b: number }[] = [];
    const flush = () => {
      if (seg.length < 2) {
        seg = [];
        return;
      }
      const top = seg.map((p) => `${x(p.i).toFixed(1)},${yKcal(p.a).toFixed(1)}`).join(" L");
      const bottom = seg
        .slice()
        .reverse()
        .map((p) => `${x(p.i).toFixed(1)},${yKcal(p.b).toFixed(1)}`)
        .join(" L");
      segs.push(`M${top} L${bottom} Z`);
      seg = [];
    };
    days.forEach((d, i) => {
      if (d.intake.totalMax != null && d.target.intake != null) {
        seg.push({ i, a: d.intake.totalMax, b: d.target.intake });
      } else {
        flush();
      }
    });
    flush();
    return segs.join(" ");
  };

  const labelEvery = Math.max(1, Math.ceil(days.length / 8));

  return (
    <div className="hb-chart-scroll">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="摂取・消費・目標摂取の推移">
        {/* グリッド */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + plotH * f}
            y2={PAD_T + plotH * f}
            stroke="var(--hb-separator)"
            strokeWidth={1}
          />
        ))}

        {/* 差分の塗り */}
        <path d={areaPath()} fill="var(--hb-graphite)" opacity={0.08} />

        {/* 目標摂取(破線) */}
        <path
          d={linePath((d) => d.target.intake, yKcal)}
          fill="none"
          stroke="var(--hb-secondary)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {/* 消費 */}
        <path d={linePath((d) => d.consumption.total, yKcal)} fill="none" stroke="var(--hb-peacock)" strokeWidth={2} />
        {/* 摂取 */}
        <path d={linePath((d) => d.intake.totalMax, yKcal)} fill="none" stroke="var(--hb-tangerine)" strokeWidth={2} />
        {/* 体重(副軸) */}
        {hasWeight && (
          <path d={linePath((d) => d.weightKg, yW)} fill="none" stroke="var(--hb-weight)" strokeWidth={1.5} strokeDasharray="1 2" />
        )}

        {/* 判定ドット(x軸直上) */}
        {days.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={H - PAD_B + 8} r={3} fill={VERDICT_COLOR[d.verdict]} />
        ))}

        {/* x軸ラベル */}
        {days.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.date} x={x(i)} y={H - 4} fontSize={10} fill="var(--hb-secondary)" textAnchor="middle">
              {fmtMD(d.date)}
            </text>
          ) : null,
        )}

        {/* y軸ラベル(kcal) */}
        {[0, 0.5, 1].map((f) => (
          <text key={f} x={PAD_L - 6} y={PAD_T + plotH * (1 - f) + 4} fontSize={10} fill="var(--hb-secondary)" textAnchor="end">
            {round(kcalMin + (kcalMax - kcalMin) * f)}
          </text>
        ))}
        {hasWeight &&
          [0, 1].map((f) => (
            <text key={f} x={W - PAD_R + 6} y={PAD_T + plotH * (1 - f) + 4} fontSize={10} fill="var(--hb-weight)" textAnchor="start">
              {(wMin + (wMax - wMin) * f).toFixed(1)}
            </text>
          ))}
      </svg>
      <div className="hb-legend-row" style={{ marginTop: 2 }}>
        <span><span className="dot" style={{ background: "var(--hb-peacock)" }} />消費</span>
        <span><span className="dot" style={{ background: "var(--hb-tangerine)" }} />摂取</span>
        <span><span className="dot" style={{ background: "var(--hb-secondary)" }} />目標摂取</span>
        {hasWeight && <span><span className="dot" style={{ background: "var(--hb-weight)" }} />体重(kg)</span>}
      </div>
    </div>
  );
}

// ---- 週/月: 期間カードのリスト (平均 + 目標達成日数) ----
function PeriodList({ days, groupBy }: { days: DaySummary[]; groupBy: "week" | "month" }) {
  const groups = useMemo(() => {
    const map = new Map<string, DaySummary[]>();
    for (const d of days) {
      const key = groupBy === "month" ? d.date.slice(0, 7) : mondayOf(d.date);
      const list = map.get(key) ?? [];
      list.push(d);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)); // 新しい順
  }, [days, groupBy]);

  return (
    <div className="hb-period-list">
      {groups.map(([key, list]) => {
        const withCons = list.filter((d) => d.consumption.total != null);
        const withIntake = list.filter((d) => d.intake.totalMax != null);
        const withTarget = list.filter((d) => d.target.intake != null);
        const withWeight = list.filter((d) => d.weightKg != null);
        const avg = (arr: DaySummary[], get: (d: DaySummary) => number) =>
          arr.length ? arr.reduce((s, d) => s + get(d), 0) / arr.length : null;
        const avgCons = avg(withCons, (d) => d.consumption.total as number);
        const avgIntake = avg(withIntake, (d) => d.intake.totalMax as number);
        const avgTarget = avg(withTarget, (d) => d.target.intake as number);
        const avgWeight = avg(withWeight, (d) => d.weightKg as number);
        const achieved = list.filter((d) => d.verdict === "achieved").length;

        const ratio = achieved / list.length;
        const ratioColor =
          ratio >= 0.6 ? "var(--hb-sage)" : ratio >= 0.3 ? "var(--hb-banana)" : "var(--hb-graphite)";

        return (
          <div className="hb-period-card" key={key}>
            <div className="hb-period-head">
              <span className="hb-period-label">
                {groupBy === "month" ? monthLabel(key) : weekLabel(key)}
              </span>
              <span className="hb-period-badge" style={{ color: ratioColor, borderColor: ratioColor }}>
                目標達成 {achieved}日中{list.length}日
              </span>
            </div>
            <div className="hb-period-stats">
              <PeriodStat label="平均消費" value={avgCons} unit="kcal" color="var(--hb-peacock)" />
              <PeriodStat label="平均摂取" value={avgIntake} unit="kcal" color="var(--hb-tangerine)" />
              <PeriodStat label="平均目標摂取" value={avgTarget} unit="kcal" color="var(--hb-secondary)" />
              <PeriodStat label="平均体重" value={avgWeight} unit="kg" color="var(--hb-weight)" decimals={1} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PeriodStat({
  label,
  value,
  unit,
  color,
  decimals = 0,
}: {
  label: string;
  value: number | null;
  unit: string;
  color: string;
  decimals?: number;
}) {
  return (
    <div className="hb-period-stat">
      <span className="k">
        <span className="dot" style={{ background: color }} />
        {label}
      </span>
      <span className="v">{value == null ? "—" : `${value.toFixed(decimals)} ${unit}`}</span>
    </div>
  );
}

function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // 0=Mon
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}
function weekLabel(mondayDate: string): string {
  const [y, m, d] = mondayDate.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const f = (dt: Date) => `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
  return `${f(start)} 〜 ${f(end)}`;
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}
