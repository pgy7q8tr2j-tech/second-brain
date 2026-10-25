import { sql } from "./db";

// ============================================================
// 食事の品ごとの構造化データ (健康ダッシュボード用)。
// 既存の memos (area='健康', 自由文の食事記録) とは独立。
// ============================================================

export type MealSlot = "朝" | "昼" | "夜" | "間食" | "深夜";
export type Basis = "ラベル記載" | "推測" | "未計上" | "要確認";

export const MEAL_SLOTS: MealSlot[] = ["朝", "昼", "夜", "間食", "深夜"];
export const BASES: Basis[] = ["ラベル記載", "推測", "未計上", "要確認"];

export interface MealItem {
  id: string;
  record_date: string; // YYYY-MM-DD
  meal_slot: MealSlot;
  item_name: string;
  kcal_min: number | null;
  kcal_max: number | null;
  basis: Basis | null;
  note: string | null;
  source_memo_id: string | null;
  created_at: string;
}

export interface MealItemInput {
  record_date: string;
  meal_slot: MealSlot;
  item_name: string;
  kcal_min?: number | null;
  kcal_max?: number | null;
  basis?: Basis | null;
  note?: string | null;
  source_memo_id?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validate(input: MealItemInput): void {
  if (!DATE_RE.test(input.record_date)) {
    throw new Error(`record_date が YYYY-MM-DD ではありません: ${input.record_date}`);
  }
  if (!MEAL_SLOTS.includes(input.meal_slot)) {
    throw new Error(`meal_slot が不正です: ${input.meal_slot}`);
  }
  if (!input.item_name || !input.item_name.trim()) {
    throw new Error("item_name は必須です");
  }
  if (input.basis != null && !BASES.includes(input.basis)) {
    throw new Error(`basis が不正です: ${input.basis}`);
  }
}

// ---- add_meal_items ----------------------------------------
// 複数品を一度に登録する (1日の取り込み・1食の追加どちらにも使う)。
export async function addMealItems(items: MealItemInput[]): Promise<MealItem[]> {
  if (items.length === 0) throw new Error("items が空です");
  const results: MealItem[] = [];
  for (const item of items) {
    validate(item);
    const rows = (await sql`
      INSERT INTO meal_items
        (record_date, meal_slot, item_name, kcal_min, kcal_max, basis, note, source_memo_id)
      VALUES (
        ${item.record_date}, ${item.meal_slot}, ${item.item_name},
        ${item.kcal_min ?? null}, ${item.kcal_max ?? null}, ${item.basis},
        ${item.note ?? null}, ${item.source_memo_id ?? null}
      )
      RETURNING *
    `) as MealItem[];
    results.push(rows[0]);
  }
  return results;
}

// ---- list_meal_items -----------------------------------------
// 期間内 (両端含む) の品を日付・食事区分順で返す。
export async function listMealItems(from: string, to: string): Promise<MealItem[]> {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new Error("from/to が YYYY-MM-DD ではありません");
  }
  const slotOrder = `CASE meal_slot
    WHEN '朝' THEN 0 WHEN '昼' THEN 1 WHEN '夜' THEN 2
    WHEN '間食' THEN 3 WHEN '深夜' THEN 4 ELSE 5 END`;
  const rows = (await sql(
    `SELECT * FROM meal_items
     WHERE record_date BETWEEN $1 AND $2
     ORDER BY record_date ASC, ${slotOrder} ASC, created_at ASC`,
    [from, to],
  )) as MealItem[];
  return rows;
}

// ---- update_meal_item -----------------------------------------
const UPDATABLE: Array<keyof MealItemInput> = [
  "record_date",
  "meal_slot",
  "item_name",
  "kcal_min",
  "kcal_max",
  "basis",
  "note",
  "source_memo_id",
];

export async function updateMealItem(
  id: string,
  fields: Partial<MealItemInput>,
): Promise<MealItem | null> {
  const entries = Object.entries(fields).filter(
    ([k, v]) => UPDATABLE.includes(k as keyof MealItemInput) && v !== undefined,
  );
  if (entries.length === 0) {
    const rows = (await sql`SELECT * FROM meal_items WHERE id = ${id}::uuid`) as MealItem[];
    return rows[0] ?? null;
  }
  const setParts = entries.map(([k], i) => `${k} = $${i + 2}`);
  const params = [id, ...entries.map(([, v]) => v)];
  const text = `UPDATE meal_items SET ${setParts.join(", ")} WHERE id = $1::uuid RETURNING *`;
  const rows = (await sql(text, params)) as MealItem[];
  return rows[0] ?? null;
}

// ---- delete_meal_item -----------------------------------------
export async function deleteMealItem(id: string): Promise<MealItem | null> {
  const rows = (await sql`
    DELETE FROM meal_items WHERE id = ${id}::uuid RETURNING *
  `) as MealItem[];
  return rows[0] ?? null;
}

// ============================================================
// app_settings (汎用キー・バリュー設定)
// ============================================================
export async function getSetting(key: string): Promise<string | null> {
  const rows = (await sql`
    SELECT value FROM app_settings WHERE key = ${key}
  `) as { value: string }[];
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO app_settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

export async function getCalorieDeficitTarget(): Promise<number> {
  const v = await getSetting("calorie_deficit_target");
  return v ? Number(v) : 500;
}
