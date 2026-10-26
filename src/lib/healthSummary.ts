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

// 消費目安(推定)に使う、直前の実測日をさかのぼる日数の上限。
const ESTIMATE_WINDOW = 7;

export type Verdict = "achieved" | "under" | "over" | "in_progress" | "no_consumption" | "no_record";

export interface DaySummary {
  date: string;
  consumption: {
    hasAny: boolean; // その日に実測(active/basal)が1件でも届いたか
    activeEnergy: number | null;
    basalEnergy: number | null;
    total: number | null; // 実測のみ。無ければnull
    lastSentAt: string | null;
    staleHours: number | null;
    estimated: boolean; // 判定・表示に実測ではなく消費目安(推定)を使ったか
  };
  // 消費目安(推定): 実測が無い日のための参考値。直前(最大7日)の実測ずみ消費の平均。
  // 実測が無ければnull。ring/グラフどちらも「実測total ?? この値」を使う。
  consumptionEstimate: number | null;
  weightKg: number | null;
  target: {
    deficit: number; // 目標の赤字 (kcal/日)。既定500
    intake: number | null; // 目標摂取 = (実測 or 推定の)消費-deficit。どちらも無ければnull
  };
  intake: {
    hasAnyRecord: boolean; // その日に meal_items の行が1件以上あるか
    totalMax: number | null; // kcal_max(無ければkcal_min)の合計。品が無ければnull
    hasUnknownKcalItem: boolean; // kcal_min/maxとも無い品が1つ以上あるか
  };
  verdict: Verdict;
}

interface RawDay {
  date: string;
  isToday: boolean;
  hasAny: boolean;
  activeEnergy: number | null;
  basalEnergy: number | null;
  total: number | null;
  lastSentAt: string | null;
  staleHours: number | null;
  weightKg: number | null;
  hasAnyRecord: boolean;
  totalMax: number | null;
  hasUnknownKcalItem: boolean;
}

function rawDay(date: string, health: HealthDay | undefined, items: MealItem[], isToday: boolean): RawDay {
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

  return {
    date,
    isToday,
    hasAny,
    activeEnergy: active,
    basalEnergy: basal,
    total,
    lastSentAt,
    staleHours,
    weightKg,
    hasAnyRecord,
    totalMax,
    hasUnknownKcalItem,
  };
}

// 消費目安(推定): dateより前の実測ずみ消費(最大7日ぶん, 直近優先)の平均。
function estimateFor(priorRealTotals: number[]): number | null {
  if (priorRealTotals.length === 0) return null;
  return priorRealTotals.reduce((a, b) => a + b, 0) / priorRealTotals.length;
}

function finalize(raw: RawDay, deficit: number, consumptionEstimate: number | null): DaySummary {
  // 消費が実測で届いていない日は、常に消費目安(推定)を使って判定を続ける
  // (「仮の数値で常に反映させて」の方針)。実測が届いていればそちらを優先する。
  const estimated = !raw.hasAny && consumptionEstimate != null;
  const effectiveTotal = raw.hasAny ? raw.total : consumptionEstimate;
  const targetIntake = effectiveTotal != null ? effectiveTotal - deficit : null;

  let verdict: Verdict;

  if (effectiveTotal == null) {
    verdict = "no_consumption";
  } else if (raw.isToday && raw.hasAny && raw.staleHours !== null && raw.staleHours > STALE_HOURS) {
    // 実測はあるがその日の分として古すぎる(iPhoneロック等で止まっている)。
    // 消費目安を使う対象は「実測が1件も無い日」のみなので、ここは従来どおり
    // 判定を確定させない。
    verdict = "in_progress";
  } else if (!raw.hasAnyRecord) {
    verdict = "no_record";
  } else {
    const t = targetIntake as number;
    const tot = effectiveTotal;
    if (raw.totalMax! <= t) {
      verdict = raw.hasUnknownKcalItem ? "under" : "achieved";
    } else if (raw.totalMax! <= tot) {
      verdict = "under";
    } else {
      verdict = "over";
    }
  }

  return {
    date: raw.date,
    consumption: {
      hasAny: raw.hasAny,
      activeEnergy: raw.activeEnergy,
      basalEnergy: raw.basalEnergy,
      total: raw.total,
      lastSentAt: raw.lastSentAt,
      staleHours: raw.staleHours,
      estimated,
    },
    consumptionEstimate,
    weightKg: raw.weightKg,
    target: { deficit, intake: targetIntake },
    intake: { hasAnyRecord: raw.hasAnyRecord, totalMax: raw.totalMax, hasUnknownKcalItem: raw.hasUnknownKcalItem },
    verdict,
  };
}

export async function getDaySummary(date: string, target?: number): Promise<DaySummary> {
  const deficit = target ?? (await getCalorieDeficitTarget());
  const isToday = date === todayJST();

  const [health, items, lookback] = await Promise.all([
    getHealthDay(date),
    listMealItems(date, date),
    getHealthRange(addDays(date, -ESTIMATE_WINDOW), addDays(date, -1)),
  ]);

  const raw = rawDay(date, health, items, isToday);
  const priorTotals = lookback.days
    .map((d) => {
      const a = d.metrics.find((m) => m.metric === "active_energy")?.value ?? null;
      const b = d.metrics.find((m) => m.metric === "basal_energy")?.value ?? null;
      return a !== null || b !== null ? (a ?? 0) + (b ?? 0) : null;
    })
    .filter((v): v is number => v != null)
    .slice(-ESTIMATE_WINDOW);
  const estimate = estimateFor(priorTotals);

  return finalize(raw, deficit, estimate);
}

// 期間内(両端含む, 最大90日)の日ごとのサマリーを返す。データの無い日も
// 「記録なし/消費データ未受信」のDaySummaryとして含める(欠落を暗黙に0扱いしない)。
// 消費が実測で届いていない日は、直前(最大7日)の実測平均を消費目安として使う。
export async function getRangeSummaries(from: string, to: string, target?: number): Promise<DaySummary[]> {
  const deficit = target ?? (await getCalorieDeficitTarget());
  const lookbackFrom = addDays(from, -ESTIMATE_WINDOW);
  // getHealthRange は最大90日までしか受け付けないため、表示期間(最大90日)とは
  // 別にlookback(最大7日)を分けて取得する(1回のリクエストにまとめると97日に
  // なり上限を超えてしまう)。
  const [healthRange, lookbackRange, items] = await Promise.all([
    getHealthRange(from, to),
    getHealthRange(lookbackFrom, addDays(from, -1)),
    listMealItems(from, to),
  ]);

  const healthByDate = new Map(
    [...healthRange.days, ...lookbackRange.days].map((d) => [d.date, d]),
  );
  const itemsByDate = new Map<string, MealItem[]>();
  for (const it of items) {
    const key = it.record_date.slice(0, 10);
    const list = itemsByDate.get(key) ?? [];
    list.push(it);
    itemsByDate.set(key, list);
  }

  const today = todayJST();
  const rawDates: string[] = [];
  for (let d = lookbackFrom; d <= to; d = addDays(d, 1)) rawDates.push(d);
  const raws = rawDates.map((d) => rawDay(d, healthByDate.get(d), itemsByDate.get(d) ?? [], d === today));

  const out: DaySummary[] = [];
  raws.forEach((raw, i) => {
    if (raw.date < from) return; // lookback専用の日はここでは出力しない
    const priorTotals: number[] = [];
    for (let j = i - 1; j >= 0 && priorTotals.length < ESTIMATE_WINDOW; j--) {
      if (raws[j].total != null) priorTotals.push(raws[j].total as number);
    }
    const estimate = estimateFor(priorTotals);
    out.push(finalize(raw, deficit, estimate));
  });
  return out;
}
