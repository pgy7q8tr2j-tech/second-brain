import { sql } from "./db";

// ============================================================
// 健康の数値 (iPhone ヘルスケアの日次合計) の保存・読み出し。
// 既存の memos 系とは独立。計算 (消費−摂取など) はここでは行わず、
// 値をそのまま出し入れする。差し引きは claude.ai 側で行う方針。
// ============================================================

// 受け付ける項目と、その「正準の単位」。
// 単位はショートカットの表示に依存せず、サーバー側で固定して保存する。
export const METRICS = {
  active_energy: "kcal",
  basal_energy: "kcal",
  steps: "count",
  walking_distance: "km",
  body_mass: "kg",
} as const;

export type Metric = keyof typeof METRICS;

// 明らかにおかしい値を弾くための範囲 (下限・上限とも含む)。
// null は「上限/下限なし」。
const RANGES: Record<Metric, { min: number; max: number }> = {
  active_energy: { min: 0, max: 30000 }, // kcal/日
  basal_energy: { min: 0, max: 30000 }, // kcal/日
  steps: { min: 0, max: 200000 }, // 歩/日 (20万超は異常)
  walking_distance: { min: 0, max: 500 }, // km/日
  body_mass: { min: 20, max: 300 }, // kg (20未満・300超は異常)
};

export interface DayInput {
  date: string; // YYYY-MM-DD (送信元タイムゾーンで区切った日付)
  active_energy_kcal?: number | string | null;
  basal_energy_kcal?: number | string | null;
  steps?: number | string | null;
  walking_distance_km?: number | string | null;
  body_mass_kg?: number | string | null;
}

export interface IngestInput {
  sent_at: string; // タイムゾーン付き ISO 8601
  tz: string; // 例: 'Asia/Tokyo'
  days: DayInput[];
}

// JSON のキー → metric 名のマップ。
const FIELD_TO_METRIC: Record<string, Metric> = {
  active_energy_kcal: "active_energy",
  basal_energy_kcal: "basal_energy",
  steps: "steps",
  walking_distance_km: "walking_distance",
  body_mass_kg: "body_mass",
};

export class ValidationError extends Error {}

// ---- 数値の正規化 ------------------------------------------
// ショートカットは数値を文字列で送ることがある (未確認) ため、
// "512.3" のような数値文字列も受け付けて数値に変換する。
// null / undefined / 空文字は「送られていない」= undefined を返す
// (既存の値を消さない)。
function normalizeNumber(raw: unknown, field: string): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      throw new ValidationError(`${field}: 数値が不正です`);
    }
    return raw;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return undefined; // 空文字は未送信扱い
    // カンマ区切り (例: "8,123") も許容
    const n = Number(t.replace(/,/g, ""));
    if (!Number.isFinite(n)) {
      throw new ValidationError(`${field}: 数値に変換できません ("${raw}")`);
    }
    return n;
  }
  throw new ValidationError(`${field}: 数値でも文字列でもありません`);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- 入力全体の検証と正規化 --------------------------------
// 戻り値は upsert しやすい「平たい行」の配列。不正があれば throw。
interface Row {
  date: string;
  metric: Metric;
  value: number;
  unit: string;
}

export function validateAndFlatten(input: unknown): {
  sent_at: string;
  tz: string;
  rows: Row[];
} {
  if (typeof input !== "object" || input === null) {
    throw new ValidationError("JSON オブジェクトではありません");
  }
  const obj = input as Record<string, unknown>;

  // sent_at: タイムゾーン付き ISO 8601
  const sentAtRaw = obj.sent_at;
  if (typeof sentAtRaw !== "string" || sentAtRaw.trim() === "") {
    throw new ValidationError("sent_at が必要です");
  }
  const sentMs = Date.parse(sentAtRaw);
  if (!Number.isFinite(sentMs)) {
    throw new ValidationError("sent_at が ISO 8601 ではありません");
  }
  // タイムゾーン指定 (Z または ±hh:mm) が無いと境界判定ができないため必須。
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(sentAtRaw.trim())) {
    throw new ValidationError("sent_at にタイムゾーン (Z または ±hh:mm) が必要です");
  }
  const sent_at = sentAtRaw.trim();

  // tz
  const tzRaw = obj.tz;
  if (typeof tzRaw !== "string" || tzRaw.trim() === "") {
    throw new ValidationError("tz が必要です");
  }
  const tz = tzRaw.trim();

  // days: 最大 7 件
  const days = obj.days;
  if (!Array.isArray(days)) {
    throw new ValidationError("days が配列ではありません");
  }
  if (days.length === 0) {
    throw new ValidationError("days が空です");
  }
  if (days.length > 7) {
    throw new ValidationError("days は最大 7 件です");
  }

  const rows: Row[] = [];
  const seenKeys = new Set<string>();

  for (const d of days) {
    if (typeof d !== "object" || d === null) {
      throw new ValidationError("days の要素がオブジェクトではありません");
    }
    const day = d as Record<string, unknown>;
    const date = day.date;
    if (typeof date !== "string" || !DATE_RE.test(date)) {
      throw new ValidationError(`date が YYYY-MM-DD ではありません: ${String(date)}`);
    }
    // 実在日付か (例: 2026-13-40 を弾く)
    const [y, m, dd] = date.split("-").map(Number);
    const probe = new Date(Date.UTC(y, m - 1, dd));
    if (
      probe.getUTCFullYear() !== y ||
      probe.getUTCMonth() !== m - 1 ||
      probe.getUTCDate() !== dd
    ) {
      throw new ValidationError(`存在しない日付です: ${date}`);
    }

    for (const [field, metric] of Object.entries(FIELD_TO_METRIC)) {
      const value = normalizeNumber(day[field], field);
      if (value === undefined) continue; // 未送信 → スキップ (既存値を保持)

      const range = RANGES[metric];
      if (value < range.min || value > range.max) {
        throw new ValidationError(
          `${field} が許容範囲外です: ${value} (${range.min}〜${range.max})`,
        );
      }

      const key = `${date}|${metric}`;
      if (seenKeys.has(key)) {
        throw new ValidationError(`同一ペイロード内で ${date} の ${metric} が重複しています`);
      }
      seenKeys.add(key);

      rows.push({ date, metric, value, unit: METRICS[metric] });
    }
  }

  return { sent_at, tz, rows };
}

// ---- 保存 --------------------------------------------------
// (date, metric) で upsert。保存済みより古い sent_at では更新しない。
// 実際に書き込まれた行数 (upserted) と、古い送信などで据え置いた行数 (skipped)
// を返す。
export async function upsertHealthRows(
  rows: Row[],
  sent_at: string,
  tz: string,
): Promise<{ upserted: number; skipped: number }> {
  let upserted = 0;

  for (const r of rows) {
    // ON CONFLICT ... WHERE で「新しい送信のときだけ」更新する。
    // RETURNING があれば実際に書かれたということ。無ければ据え置き。
    const written = (await sql`
      INSERT INTO health_daily (date, metric, value, unit, tz, sent_at)
      VALUES (${r.date}, ${r.metric}, ${r.value}, ${r.unit}, ${tz}, ${sent_at})
      ON CONFLICT (date, metric) DO UPDATE
        SET value = EXCLUDED.value,
            unit = EXCLUDED.unit,
            tz = EXCLUDED.tz,
            sent_at = EXCLUDED.sent_at,
            received_at = now()
        WHERE EXCLUDED.sent_at >= health_daily.sent_at
      RETURNING date
    `) as { date: string }[];

    if (written.length > 0) upserted += 1;
  }

  return { upserted, skipped: rows.length - upserted };
}

// ---- 受信ログ ----------------------------------------------
// 生の JSON を保存し、14 日より古い行を削除する。
export async function logIngest(payload: unknown): Promise<void> {
  await sql`
    INSERT INTO health_ingest_log (payload)
    VALUES (${JSON.stringify(payload)}::jsonb)
  `;
  await sql`
    DELETE FROM health_ingest_log
    WHERE received_at < now() - INTERVAL '14 days'
  `;
}

// ============================================================
// 読み出し (フェーズ2 の MCP ツールが使う)
// ============================================================

export interface MetricReading {
  metric: Metric;
  value: number;
  unit: string;
  tz: string;
  sent_at: string; // 最終受信時刻 (この値の時点)
  received_at: string;
}

export interface HealthDay {
  date: string;
  has_data: boolean;
  // その日の中で最も新しい sent_at。Claude が「何時以降は未反映」を判断する用。
  last_sent_at: string | null;
  metrics: MetricReading[];
}

// 指定日の各項目を返す。データが無ければ has_data=false。
export async function getHealthDay(date: string): Promise<HealthDay> {
  if (!DATE_RE.test(date)) {
    throw new ValidationError(`date が YYYY-MM-DD ではありません: ${date}`);
  }
  const rows = (await sql`
    SELECT metric, value, unit, tz,
           to_char(sent_at,     'YYYY-MM-DD"T"HH24:MI:SSOF') AS sent_at,
           to_char(received_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS received_at
    FROM health_daily
    WHERE date = ${date}
    ORDER BY metric
  `) as (MetricReading & { value: string })[];

  const metrics: MetricReading[] = rows.map((r) => ({
    metric: r.metric,
    value: Number(r.value),
    unit: r.unit,
    tz: r.tz,
    sent_at: r.sent_at,
    received_at: r.received_at,
  }));

  const last_sent_at =
    metrics.length === 0
      ? null
      : metrics.reduce(
          (max, m) => (m.sent_at > max ? m.sent_at : max),
          metrics[0].sent_at,
        );

  return {
    date,
    has_data: metrics.length > 0,
    last_sent_at,
    metrics,
  };
}

// 期間内の日ごとの一覧 (最大 90 日)。from〜to は YYYY-MM-DD で両端含む。
export async function getHealthRange(
  from: string,
  to: string,
): Promise<{ from: string; to: string; days: HealthDay[] }> {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new ValidationError("from/to が YYYY-MM-DD ではありません");
  }
  if (from > to) {
    throw new ValidationError("from が to より後です");
  }
  // 日数上限 90 日 (両端含む)
  const spanDays =
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86400000,
    ) + 1;
  if (spanDays > 90) {
    throw new ValidationError("期間は最大 90 日です");
  }

  const rows = (await sql`
    SELECT to_char(date, 'YYYY-MM-DD') AS date,
           metric, value, unit, tz,
           to_char(sent_at,     'YYYY-MM-DD"T"HH24:MI:SSOF') AS sent_at,
           to_char(received_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS received_at
    FROM health_daily
    WHERE date BETWEEN ${from} AND ${to}
    ORDER BY date, metric
  `) as (MetricReading & { date: string; value: string })[];

  const byDate = new Map<string, MetricReading[]>();
  for (const r of rows) {
    const list = byDate.get(r.date) ?? [];
    list.push({
      metric: r.metric,
      value: Number(r.value),
      unit: r.unit,
      tz: r.tz,
      sent_at: r.sent_at,
      received_at: r.received_at,
    });
    byDate.set(r.date, list);
  }

  const days: HealthDay[] = [...byDate.entries()].map(([date, metrics]) => ({
    date,
    has_data: true,
    last_sent_at: metrics.reduce(
      (max, m) => (m.sent_at > max ? m.sent_at : max),
      metrics[0].sent_at,
    ),
    metrics,
  }));

  return { from, to, days };
}
