import { getHealthDay } from "./health";
import { listMealItems, getCalorieDeficitTarget } from "./meals";

// ============================================================
// 「今日」の収支サマリー (健康ダッシュボード用)。
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

// 消費データが「生きている」とみなす鮮度のしきい値。
// これを超えてsent_atが古い場合は、iPhoneロック等で未送信のまま止まっている
// 可能性が高いとみなし、判定色を確定させず「途中」とする。
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
  label: string;
}

export async function getDaySummary(date: string, target?: number): Promise<DaySummary> {
  const deficit = target ?? (await getCalorieDeficitTarget());

  const health = await getHealthDay(date);
  const active = health.metrics.find((m) => m.metric === "active_energy")?.value ?? null;
  const basal = health.metrics.find((m) => m.metric === "basal_energy")?.value ?? null;
  const hasAny = active !== null || basal !== null;
  const total = hasAny ? (active ?? 0) + (basal ?? 0) : null;

  let staleHours: number | null = null;
  if (health.last_sent_at) {
    staleHours = (Date.now() - Date.parse(health.last_sent_at)) / 3_600_000;
  }

  const items = await listMealItems(date, date);
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
  let label: string;

  if (!hasAny) {
    verdict = "no_consumption";
    label = "消費データ未受信";
  } else if (staleHours !== null && staleHours > STALE_HOURS) {
    verdict = "in_progress";
    label = "途中";
  } else if (!hasAnyRecord) {
    verdict = "no_record";
    label = "食事記録なし";
  } else {
    const t = targetIntake as number;
    const tot = total as number;
    if (totalMax! <= t) {
      verdict = hasUnknownKcalItem ? "under" : "achieved";
      label = hasUnknownKcalItem ? "目標まであと" : "目標まであと";
    } else if (totalMax! <= tot) {
      verdict = "under";
      label = "目標まであと";
    } else {
      verdict = "over";
      label = "オーバー";
    }
  }

  return {
    date,
    consumption: {
      hasAny,
      activeEnergy: active,
      basalEnergy: basal,
      total,
      lastSentAt: health.last_sent_at,
      staleHours,
    },
    target: { deficit, intake: targetIntake },
    intake: { hasAnyRecord, totalMax, hasUnknownKcalItem },
    verdict,
    label,
  };
}
