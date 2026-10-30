"use client";

import { useMemo, useState } from "react";
import type { Expense, CategorySettings } from "@/lib/expenses";
import { buildCategoryColorMap } from "./categoryColors";
import MonthView from "./MonthView";
import ExpenseTrendView from "./ExpenseTrendView";
import ExpenseListView from "./ExpenseListView";
import "./expenses.css";

export type BizFilter = "all" | "personal" | "business";

export default function ExpensesClient({
  expenses,
  categories,
  gbpJpyRate,
  today,
}: {
  expenses: Expense[];
  categories: CategorySettings;
  gbpJpyRate: number | null;
  today: string;
}) {
  const [tab, setTab] = useState<"month" | "trend" | "list">("month");
  const [biz, setBiz] = useState<BizFilter>("all");
  const [month, setMonth] = useState(today.slice(0, 7));

  const colorMap = useMemo(() => buildCategoryColorMap(categories), [categories]);

  const filtered = useMemo(() => {
    if (biz === "all") return expenses;
    const wantBusiness = biz === "business";
    return expenses.filter((e) => e.is_business === wantBusiness);
  }, [expenses, biz]);

  return (
    <div className="exp-root">
      <div className="ex-header">
        <a href="/">← メモ一覧</a>
        <span className="ex-title">家計簿</span>
        <span style={{ width: 64 }} />
      </div>

      <div className="ex-seg-row">
        <div className="ex-seg">
          {(["all", "personal", "business"] as BizFilter[]).map((b) => (
            <button key={b} className="ex-seg-btn" data-active={biz === b} onClick={() => setBiz(b)}>
              {b === "all" ? "すべて" : b === "personal" ? "私生活" : "事業"}
            </button>
          ))}
        </div>
      </div>

      <div className="ex-tabs">
        <button className="ex-tab" data-active={tab === "month"} onClick={() => setTab("month")}>
          今月
        </button>
        <button className="ex-tab" data-active={tab === "trend"} onClick={() => setTab("trend")}>
          推移
        </button>
        <button className="ex-tab" data-active={tab === "list"} onClick={() => setTab("list")}>
          一覧
        </button>
      </div>

      <div className="ex-main">
        {tab === "month" && (
          <MonthView
            expenses={filtered}
            month={month}
            setMonth={setMonth}
            today={today}
            gbpJpyRate={gbpJpyRate}
            colorMap={colorMap}
          />
        )}
        {tab === "trend" && <ExpenseTrendView expenses={filtered} today={today} />}
        {tab === "list" && (
          <ExpenseListView
            expenses={filtered}
            month={month}
            setMonth={setMonth}
            today={today}
            colorMap={colorMap}
          />
        )}
      </div>
    </div>
  );
}
