"use client";

import { useMemo, useState } from "react";
import type { MealItem, MealSlot } from "@/lib/meals";
import { MEAL_SLOTS } from "@/lib/meals";
import { todayJST, addDays } from "@/lib/healthSummary";

function fmtKcal(min: number | null, max: number | null): string {
  if (min == null && max == null) return "kcal不明";
  if (min === max || max == null) return `${min ?? max} kcal`;
  if (min == null) return `〜${max} kcal`;
  return `${min}〜${max} kcal`;
}
function fmtDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const w = ["日", "月", "火", "水", "木", "金", "土"][dt.getUTCDay()];
  return `${y}/${m}/${d}（${w}）`;
}

export default function MealsView({ mealItems }: { mealItems: MealItem[] }) {
  const today = todayJST();
  const [date, setDate] = useState(today);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, MealItem[]>();
    for (const it of mealItems) {
      const key = it.record_date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(it);
      map.set(key, list);
    }
    return map;
  }, [mealItems]);

  const dayItems = itemsByDate.get(date) ?? [];
  const bySlot = useMemo(() => {
    const map = new Map<MealSlot, MealItem[]>();
    for (const it of dayItems) {
      const list = map.get(it.meal_slot) ?? [];
      list.push(it);
      map.set(it.meal_slot, list);
    }
    return map;
  }, [dayItems]);

  const hasUnknown = dayItems.some((i) => i.kcal_min == null && i.kcal_max == null);
  const total = dayItems.reduce((sum, i) => sum + (i.kcal_max ?? i.kcal_min ?? 0), 0);

  return (
    <div className="hb-card">
      <div className="hb-day-nav">
        <button className="hb-nav-btn" onClick={() => setDate((d) => addDays(d, -1))} aria-label="前の日">
          ←
        </button>
        <div className="hb-day-nav-center">
          <input
            type="date"
            className="hb-date-input"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <span className="hb-day-label">{fmtDateLabel(date)}</span>
        </div>
        <button
          className="hb-nav-btn"
          onClick={() => setDate((d) => addDays(d, 1))}
          disabled={date >= today}
          aria-label="次の日"
        >
          →
        </button>
      </div>

      {dayItems.length === 0 ? (
        <div className="hb-placeholder">この日の食事記録はありません</div>
      ) : (
        <>
          {MEAL_SLOTS.map((slot) => {
            const items = bySlot.get(slot);
            if (!items || items.length === 0) return null;
            return (
              <div className="hb-meal-slot" key={slot}>
                <div className="hb-meal-slot-label">{slot}</div>
                <div className="hb-meal-items">
                  {items.map((it) => (
                    <div className="hb-meal-item" key={it.id}>
                      <span className="hb-meal-item-name">{it.item_name}</span>
                      <span className="hb-meal-item-kcal">{fmtKcal(it.kcal_min, it.kcal_max)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="hb-meal-total">
            <span>合計(上限)</span>
            <span className="v">
              {Math.round(total)} kcal{hasUnknown ? "　※kcal不明の品あり" : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
