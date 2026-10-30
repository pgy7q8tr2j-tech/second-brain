"use client";

import { useMemo, useState } from "react";
import type { Expense } from "@/lib/expenses";
import { addDays } from "@/lib/healthSummary";

function fmtMD(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export default function ExpenseTrendView({ expenses, today }: { expenses: Expense[]; today: string }) {
  const [windowDays, setWindowDays] = useState(30);

  const { days, totals, hasUnconverted } = useMemo(() => {
    const from = addDays(today, -(windowDays - 1));
    const byDate = new Map<string, number>();
    let unconverted = false;
    for (const e of expenses) {
      const d = e.expense_date;
      if (d < from || d > today) continue;
      if (e.amount_jpy == null) {
        unconverted = true;
        continue;
      }
      byDate.set(d, (byDate.get(d) ?? 0) + e.amount_jpy);
    }
    const dates: string[] = [];
    for (let d = from; d <= today; d = addDays(d, 1)) dates.push(d);
    return { days: dates, totals: dates.map((d) => byDate.get(d) ?? 0), hasUnconverted: unconverted };
  }, [expenses, today, windowDays]);

  const total = totals.reduce((a, b) => a + b, 0);
  const avg = days.length ? total / days.length : 0;

  return (
    <div className="ex-card">
      <div className="ex-window-row">
        {[14, 30, 60, 90].map((w) => (
          <button
            key={w}
            className="ex-window-btn"
            data-active={windowDays === w}
            onClick={() => setWindowDays(w)}
          >
            {w}日
          </button>
        ))}
      </div>

      <DayBarChart days={days} totals={totals} />

      <div className="ex-stat-row" style={{ marginTop: 14 }}>
        <div className="ex-stat">
          <div className="k">期間合計</div>
          <div className="v">¥{Math.round(total).toLocaleString("ja-JP")}</div>
        </div>
        <div className="ex-stat">
          <div className="k">1日あたり平均</div>
          <div className="v">¥{Math.round(avg).toLocaleString("ja-JP")}</div>
        </div>
      </div>

      {hasUnconverted && (
        <p className="ex-note">※ 換算なし(レート未設定時のGBP支出)はこのグラフに含まれません。</p>
      )}
    </div>
  );
}

function DayBarChart({ days, totals }: { days: string[]; totals: number[] }) {
  const W = Math.max(320, days.length * 14);
  const H = 180;
  const PAD_L = 48;
  const PAD_R = 10;
  const PAD_T = 14;
  const PAD_B = 24;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const max = Math.max(1, ...totals) * 1.1;
  const slot = plotW / Math.max(1, days.length);
  const barW = Math.max(2, slot * 0.7);
  const x = (i: number) => PAD_L + slot * i + (slot - barW) / 2;
  const barHeight = (v: number) => (v / max) * plotH;

  const labelEvery = Math.max(1, Math.ceil(days.length / 8));

  return (
    <div className="ex-chart-scroll">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="日ごとの支出推移">
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + plotH * f}
            y2={PAD_T + plotH * f}
            stroke="var(--ex-separator)"
            strokeWidth={1}
          />
        ))}
        {days.map((d, i) => (
          <rect
            key={d}
            x={x(i)}
            y={PAD_T + plotH - barHeight(totals[i])}
            width={barW}
            height={barHeight(totals[i])}
            fill="var(--ex-peacock)"
            rx={1.5}
          />
        ))}
        {days.map((d, i) =>
          i % labelEvery === 0 ? (
            <text
              key={d}
              x={x(i) + barW / 2}
              y={H - 4}
              fontSize={10}
              fill="var(--ex-secondary)"
              textAnchor="middle"
            >
              {fmtMD(d)}
            </text>
          ) : null,
        )}
        {[0, 0.5, 1].map((f) => (
          <text
            key={f}
            x={PAD_L - 6}
            y={PAD_T + plotH * (1 - f) + 4}
            fontSize={10}
            fill="var(--ex-secondary)"
            textAnchor="end"
          >
            {Math.round(max * f).toLocaleString("ja-JP")}
          </text>
        ))}
      </svg>
    </div>
  );
}
