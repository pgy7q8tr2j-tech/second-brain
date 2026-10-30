"use client";

import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Expense } from "@/lib/expenses";
import { addMonths, monthLabel } from "./monthUtil";
import { colorFor } from "./categoryColors";

function fmtDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const w = ["日", "月", "火", "水", "木", "金", "土"][dt.getUTCDay()];
  return `${Number(m)}/${d}（${w}）`;
}

export default function ExpenseListView({
  expenses,
  month,
  setMonth,
  today,
  colorMap,
}: {
  expenses: Expense[];
  month: string;
  setMonth: Dispatch<SetStateAction<string>>;
  today: string;
  colorMap: Map<string, string>;
}) {
  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.expense_date.slice(0, 7) === month),
    [expenses, month],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of monthExpenses) {
      const list = map.get(e.expense_date) ?? [];
      list.push(e);
      map.set(e.expense_date, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)); // 新しい順
  }, [monthExpenses]);

  const total = monthExpenses.reduce((sum, e) => sum + (e.amount_jpy ?? 0), 0);
  const hasUnconverted = monthExpenses.some((e) => e.amount_jpy == null);
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

      {byDate.length === 0 ? (
        <div className="ex-placeholder">この月の記録はありません</div>
      ) : (
        <>
          {byDate.map(([date, items]) => (
            <div className="ex-day-group" key={date}>
              <div className="ex-day-label">{fmtDateLabel(date)}</div>
              <div className="ex-items">
                {items.map((e) => (
                  <div className="ex-item" key={e.id}>
                    <div className="ex-item-main">
                      <div className="ex-item-category">
                        <span className="dot" style={{ background: colorFor(e.category_major, colorMap) }} />
                        {e.category_major}
                        {e.category_minor ? `・${e.category_minor}` : ""}
                        {e.is_business && <span className="ex-biz-chip">事業</span>}
                      </div>
                      {e.memo && <div className="ex-item-memo">{e.memo}</div>}
                    </div>
                    <div className="ex-item-amount">
                      {e.currency === "JPY"
                        ? `¥${Math.round(e.amount).toLocaleString("ja-JP")}`
                        : `£${e.amount.toLocaleString("ja-JP")}`}
                      {e.currency === "GBP" && (
                        <span className="sub">
                          {e.amount_jpy != null
                            ? `¥${Math.round(e.amount_jpy).toLocaleString("ja-JP")}`
                            : "換算なし"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="ex-month-total">
            <span>合計(円換算){hasUnconverted ? "　※換算なしの支出あり" : ""}</span>
            <span className="v">¥{Math.round(total).toLocaleString("ja-JP")}</span>
          </div>
        </>
      )}
    </div>
  );
}
