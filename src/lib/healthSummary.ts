import { getHealthDay, getHealthRange, type HealthDay } from "./health";
import { listMealItems, getCalorieDeficitTarget, type MealItem } from "./meals";

// ============================================================
// 健康ダッシュボードの収支サマリー (今日のリング・推移グラフ共通)。
// 日付の区切りは常に Asia/Tokyo (second-brain 全体の方針と同じ)。
// ============================================================

export function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // en-CA -> YYYY-MM-DD
}

// date(YYYY-MM-DD) に n 日を加減算する (暦日単位、JSTのずれは気にしない)
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// 消費データが「生きている」とみなす鮮度のしきい値。
// これを超えてsent_atが古い場合は、iPhoneロック等で未送信のまま止まっている
// 可能性が高いとみなし、判定色を確定させず「途中」とする。
// (今日以外の過去日には適用しない。過去日は「その日に届いた最後の値」で確定とする)
const STALE_HOURS = 3;

export type Verdict = "achieved" | "under" | "over" | "in_progress" | "no_consumption" | "no_record";

export interface DaySummary {
  date: string;
  consumption: {
    hasAny: boolean;
    activeEnergy: number | null;
    basalEnergy: number | null;
    total: number | null;
    lastSentAt: string | null;
    staleHours: number | null;
  };
  weightKg: number | null;
  target: {
    deficit: number; // 目標の赤字 (kcal/日)。既定500
    intake: number | null; // 目標摂取 = 消費-deficit (消費不明ならnull)
  };
  intake: {
    hasAnyRecord: boolean; // その日に meal_items の行が1件以上あるか
    totalMax: number | null; // kcal_max(無ければkcal_min)の合計。品が無ければnull
    hasUnknownKcalItem: boolean; // kcal_min/maxとも無い品が1つ以上あるか
  };
  verdict: Verdict;
}

// 当日だけ鮮度チェック(STALE_HOURS)を適用する。過去日は「最後に届いた値」で確定。
function summarizeDay(
  date: string,
  health: HealthDay | undefined,
  items: MealItem[],
  deficit: number,
  isToday: boolean,
): DaySummary {
  const metrics = health?.metrics ?? [];
  const active = metrics.find((m) => m.metric === "active_energy")?.value ?? null;
  const basal = metrics.find((m) => m.metric === "basal_energy")?.value ?? null;
  const weightKg = metrics.find((m) => m.metric === "body_mass")?.value ?? null;
  const hasAny = active !== null || basal !== null;
  const total = hasAny ? (active ?? 0) + (basal ?? 0) : null;
  const lastSentAt = health?.last_sent_at ?? null;

  let staleHours: number | null = null;
  if (lastSentAt) {
    staleHours = (Date.now() - Date.parse(lastSentAt)) / 3_600_000;
  }

  const hasAnyRecord = items.length > 0;
  const hasUnknownKcalItem = items.some((i) => i.kcal_min == null && i.kcal_max == null);
  const totalMax = hasAnyRecord
    ? items.reduce((sum, i) => {
        const v = i.kcal_max ?? i.kcal_min;
        return sum + (v ?? 0);
      }, 0)
    : null;

  const targetIntake = total !== null ? total - deficit : null;

  let verdict: Verdict;

  if (!hasAny) {
    verdict = "no_consumption";
  } else if (isToday && staleHours !== null && staleHours > STALE_HOURS) {
    verdict = "in_progress";
  } else if (!hasAnyRecord) {
    verdict = "no_record";
  } else {
    const t = targetIntake as number;
    const tot = total as number;
    if (totalMax! <= t) {
      verdict = hasUnknownKcalItem ? "under" : "achieved";
    } else if (totalMax! <= tot) {
      verdict = "under";
    } else {
      verdict = "over";
    }
  }

  return {
    date,
    consumption: { hasAny, activeEnergy: active, basalEnergy: basal, total, lastSentAt, staleHours },
    weightKg,
    target: { deficit, intake: targetIntake },
    intake: { hasAnyRecord, totalMax, hasUnknownKcalItem },
    verdict,
  };
}

export async function getDaySummary(date: string, target?: number): Promise<DaySummary> {
  const deficit = target ?? (await getCalorieDeficitTarget());
  const health = await getHealthDay(date);
  const items = await listMealItems(date, date);
  return summarizeDay(date, health, items, deficit, date === todayJST());
}

// 期間内(両端含む, 最大90日)の日ごとのサマリーを返す。データの無い日も
// 「記録なし/消費データ未受信」のDaySummaryとして含める(欠落を暗黙に0扱いしない)。
export async function getRangeSummaries(from: string, to: string, target?: number): Promise<DaySummary[]> {
  const deficit = target ?? (await getCalorieDeficitTarget());
  const [healthRange, items] = await Promise.all([getHealthRange(from, to), listMealItems(from, to)]);

  const healthByDate = new Map(healthRange.days.map((d) => [d.date, d]));
  const itemsByDate = new Map<string, MealItem[]>();
  for (const it of items) {
    const key = it.record_date.slice(0, 10);
    const list = itemsByDate.get(key) ?? [];
    list.push(it);
    itemsByDate.set(key, list);
  }

  const today = todayJST();
  const out: DaySummary[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(summarizeDay(d, healthByDate.get(d), itemsByDate.get(d) ?? [], deficit, d === today));
  }
  return out;
}
