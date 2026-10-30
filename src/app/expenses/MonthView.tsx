"use client";

import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Expense } from "@/lib/expenses";
import { addMonths, monthLabel } from "./monthUtil";
import { colorFor } from "./categoryColors";

function fmtYen(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}

export default function MonthView({
  expenses,
  month,
  setMonth,
  today,
  gbpJpyRate,
  colorMap,
}: {
  expenses: Expense[];
  month: string;
  setMonth: Dispatch<SetStateAction<string>>;
  today: string;
  gbpJpyRate: number | null;
  colorMap: Map<string, string>;
}) {
  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.expense_date.slice(0, 7) === month),
    [expenses, month],
  );

  const totals = useMemo(() => {
    let totalJpy = 0;
    let jpyAmount = 0;
    let gbpAmountOriginal = 0;
    let gbpConvertedJpy = 0;
    let unconvertedGbp = 0;
    const byCategory = new Map<string, number>();

    for (const e of monthExpenses) {
      if (e.currency === "JPY") {
        jpyAmount += e.amount;
        totalJpy += e.amount;
      } else {
        gbpAmountOriginal += e.amount;
        if (e.amount_jpy != null) {
          gbpConvertedJpy += e.amount_jpy;
          totalJpy += e.amount_jpy;
        } else {
          unconvertedGbp += e.amount;
        }
      }
      if (e.amount_jpy != null) {
        byCategory.set(e.category_major, (byCategory.get(e.category_major) ?? 0) + e.amount_jpy);
      }
    }

    const categoryBreakdown = [...byCategory.entries()]
      .map(([category_major, amount_jpy]) => ({ category_major, amount_jpy }))
      .sort((a, b) => b.amount_jpy - a.amount_jpy);

    return { totalJpy, jpyAmount, gbpAmountOriginal, gbpConvertedJpy, unconvertedGbp, categoryBreakdown };
  }, [monthExpenses]);

  const maxCategory = Math.max(1, ...totals.categoryBreakdown.map((c) => c.amount_jpy));
  const canGoNext = month < today.slice(0, 7);

  return (
    <div className="ex-card">
      <div className="ex-month-nav">
        <button className="ex-nav-btn" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="前の月">
          ←
        </button>
        <span className="ex-month-label">{monthLabel(month)}</span>
        <button
          className="ex-nav-btn"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          disabled={!canGoNext}
          aria-label="次の月"
        >
          →
        </button>
      </div>

      {monthExpenses.length === 0 ? (
        <div className="ex-placeholder">この月の記録はありません</div>
      ) : (
        <>
          <div className="ex-center-number">¥{fmtYen(totals.totalJpy)}</div>
          <div className="ex-center-sub">今月の合計(円換算)</div>
          {totals.unconvertedGbp > 0 && (
            <span className="ex-warn-badge">
              換算なしの支出あり (£{totals.unconvertedGbp.toLocaleString("ja-JP")})
            </span>
          )}

          <div className="ex-stat-row">
            <div className="ex-stat">
              <div className="k">JPY支出</div>
              <div className="v">¥{fmtYen(totals.jpyAmount)}</div>
            </div>
            <div className="ex-stat">
              <div className="k">GBP支出</div>
              <div className="v">£{totals.gbpAmountOriginal.toLocaleString("ja-JP")}</div>
              <div className="sub">
                {totals.gbpAmountOriginal === 0
                  ? "—"
                  : gbpJpyRate != null
                    ? `→ ¥${fmtYen(totals.gbpConvertedJpy)} (レート${gbpJpyRate})`
                    : "レート未設定"}
              </div>
            </div>
          </div>

          {totals.categoryBreakdown.length > 0 && (
            <>
              <div className="ex-section-label">ジャンル別</div>
              <div className="ex-bars">
                {totals.categoryBreakdown.map((c) => (
                  <div className="ex-bar-row" key={c.category_major}>
                    <span className="ex-bar-label">
                      <span className="dot" style={{ background: colorFor(c.category_major, colorMap) }} />
                      {c.category_major}
                    </span>
                    <div className="ex-bar-track">
                      <div
                        className="ex-bar-fill"
                        style={{
                          width: `${Math.max(2, (c.amount_jpy / maxCategory) * 100)}%`,
                          background: colorFor(c.category_major, colorMap),
                        }}
                      />
                    </div>
                    <span className="ex-bar-value">¥{fmtYen(c.amount_jpy)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
