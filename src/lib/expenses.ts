import { sql } from "./db";
import { getSetting } from "./meals";

// ============================================================
// 家計簿(支出)の構造化データ。meal_items / app_settings と同じ設計方針。
// 日付(expense_date)は meal_items.record_date と同じく、
// サーバー側ではTZ計算を行わず呼び出し側(Claude)が判断した値をそのまま持つ。
// ============================================================

export type Currency = "JPY" | "GBP";
export const CURRENCIES: Currency[] = ["JPY", "GBP"];

export interface Expense {
  id: string;
  created_at: string;
  updated_at: string;
  expense_date: string; // YYYY-MM-DD
  amount: number;
  currency: Currency;
  amount_jpy: number | null;
  fx_rate: number | null;
  category_major: string;
  category_minor: string | null;
  memo: string | null;
  is_business: boolean;
  payment_method: string | null;
  source_meal_item_id: string | null;
}

export interface ExpenseInput {
  expense_date: string;
  amount: number;
  currency: Currency;
  category_major: string;
  category_minor?: string | null;
  memo?: string | null;
  is_business?: boolean;
  payment_method?: string | null;
  source_meal_item_id?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RATE_SETTING_KEY = "gbp_jpy_rate";

// expense_date は DATE列。Neonのドライバは DATE を JS Date として解釈するため、
// 素の SELECT/RETURNING * のままだと JSON化した際に "YYYY-MM-DDT00:00:00.000Z" のような
// タイムゾーン付きの表現になってしまう(meal_items.record_date も同じ問題を抱えている)。
// 必ず to_char() で "YYYY-MM-DD" の文字列に変換してから返す。
const SELECT_COLUMNS = `
  id, created_at, updated_at,
  to_char(expense_date, 'YYYY-MM-DD') AS expense_date,
  amount, currency, amount_jpy, fx_rate,
  category_major, category_minor, memo, is_business, payment_method, source_meal_item_id
`;

// Neon は NUMERIC 列を文字列で返す (meal_items と同じ理由で正規化する)。
function normalizeRow(row: Expense): Expense {
  return {
    ...row,
    amount: Number(row.amount),
    amount_jpy: row.amount_jpy == null ? null : Number(row.amount_jpy),
    fx_rate: row.fx_rate == null ? null : Number(row.fx_rate),
  };
}

function validate(input: ExpenseInput): void {
  if (!DATE_RE.test(input.expense_date)) {
    throw new Error(`expense_date が YYYY-MM-DD ではありません: ${input.expense_date}`);
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error(`amount が不正です: ${input.amount}`);
  }
  if (!CURRENCIES.includes(input.currency)) {
    throw new Error(`currency が不正です: ${input.currency}`);
  }
  if (!input.category_major || !input.category_major.trim()) {
    throw new Error("category_major は必須です");
  }
}

// 通貨と金額から amount_jpy / fx_rate を決める。
// JPY はレート不要でそのまま。GBP はそのとき保存されている gbp_jpy_rate 設定を使う
// (未設定なら換算なし=null)。後からレートが変わってもここで保存した値は再計算しない。
async function computeConversion(
  amount: number,
  currency: Currency,
): Promise<{ amount_jpy: number | null; fx_rate: number | null }> {
  if (currency === "JPY") {
    return { amount_jpy: amount, fx_rate: null };
  }
  const rateStr = await getSetting(RATE_SETTING_KEY);
  if (!rateStr) return { amount_jpy: null, fx_rate: null };
  const rate = Number(rateStr);
  if (!Number.isFinite(rate) || rate <= 0) return { amount_jpy: null, fx_rate: null };
  return { amount_jpy: amount * rate, fx_rate: rate };
}

// ---- add_expenses --------------------------------------------
// 複数件を一度に登録できる (add_meal_items と同様)。
export async function addExpenses(items: ExpenseInput[]): Promise<Expense[]> {
  if (items.length === 0) throw new Error("items が空です");
  const results: Expense[] = [];
  for (const item of items) {
    validate(item);
    const { amount_jpy, fx_rate } = await computeConversion(item.amount, item.currency);
    const rows = (await sql(
      `INSERT INTO expenses
         (expense_date, amount, currency, amount_jpy, fx_rate,
          category_major, category_minor, memo, is_business, payment_method, source_meal_item_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${SELECT_COLUMNS}`,
      [
        item.expense_date,
        item.amount,
        item.currency,
        amount_jpy,
        fx_rate,
        item.category_major,
        item.category_minor ?? null,
        item.memo ?? null,
        item.is_business ?? false,
        item.payment_method ?? null,
        item.source_meal_item_id ?? null,
      ],
    )) as Expense[];
    results.push(normalizeRow(rows[0]));
  }
  return results;
}

// ---- list_expenses ---------------------------------------------
export async function listExpenses(filters: {
  from: string;
  to: string;
  category_major?: string | null;
  is_business?: boolean | null;
  currency?: Currency | null;
}): Promise<Expense[]> {
  const { from, to } = filters;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new Error("from/to が YYYY-MM-DD ではありません");
  }
  const rows = (await sql(
    `SELECT ${SELECT_COLUMNS} FROM expenses
     WHERE expense_date BETWEEN $1 AND $2
       AND ($3::text IS NULL OR category_major = $3)
       AND ($4::boolean IS NULL OR is_business = $4)
       AND ($5::text IS NULL OR currency = $5)
     ORDER BY expense_date ASC, created_at ASC`,
    [from, to, filters.category_major ?? null, filters.is_business ?? null, filters.currency ?? null],
  )) as Expense[];
  return rows.map(normalizeRow);
}

// ---- update_expense -----------------------------------------
const UPDATABLE: Array<keyof ExpenseInput> = [
  "expense_date",
  "amount",
  "currency",
  "category_major",
  "category_minor",
  "memo",
  "is_business",
  "payment_method",
  "source_meal_item_id",
];

export async function updateExpense(
  id: string,
  fields: Partial<ExpenseInput>,
): Promise<Expense | null> {
  const entries = Object.entries(fields).filter(
    ([k, v]) => UPDATABLE.includes(k as keyof ExpenseInput) && v !== undefined,
  );
  if (entries.length === 0) {
    const rows = (await sql(`SELECT ${SELECT_COLUMNS} FROM expenses WHERE id = $1::uuid`, [id])) as Expense[];
    return rows[0] ? normalizeRow(rows[0]) : null;
  }

  // amount か currency を変更するときは、変更後の値で円換算額・レートを
  // 記録時点の値として作り直す(既存の換算は変えない限りそのまま)。
  const extra: Record<string, unknown> = {};
  if ("amount" in fields || "currency" in fields) {
    const current = (await sql`SELECT amount, currency FROM expenses WHERE id = ${id}::uuid`) as Array<
      Pick<Expense, "amount" | "currency">
    >;
    if (!current[0]) return null;
    const amount = fields.amount ?? Number(current[0].amount);
    const currency = fields.currency ?? current[0].currency;
    const { amount_jpy, fx_rate } = await computeConversion(amount, currency);
    extra.amount_jpy = amount_jpy;
    extra.fx_rate = fx_rate;
  }

  const allEntries = [...entries, ...Object.entries(extra)];
  const setParts = allEntries.map(([k], i) => `${k} = $${i + 2}`);
  const params = [id, ...allEntries.map(([, v]) => v)];
  const text = `UPDATE expenses SET ${setParts.join(", ")} WHERE id = $1::uuid RETURNING ${SELECT_COLUMNS}`;
  const rows = (await sql(text, params)) as Expense[];
  return rows[0] ? normalizeRow(rows[0]) : null;
}

// ---- delete_expense -----------------------------------------
export async function deleteExpense(id: string): Promise<Expense | null> {
  const rows = (await sql(
    `DELETE FROM expenses WHERE id = $1::uuid RETURNING ${SELECT_COLUMNS}`,
    [id],
  )) as Expense[];
  return rows[0] ? normalizeRow(rows[0]) : null;
}

// ---- get_spending_summary ------------------------------------
// 期間内の合計を ジャンル別・通貨別・事業/私生活別 に集計する。
// 円換算なし(GBPでレート未設定)の分は amount_jpy に含まれないため、
// unconverted_* として別枠で返す。
export interface SpendingSummary {
  from: string;
  to: string;
  total_jpy: number; // 換算できた分だけの合計(JPY支出 + 換算済みGBP支出)
  unconverted_gbp: number; // 換算されていないGBP支出の合計(元のGBP単位)
  by_currency: Array<{
    currency: Currency;
    amount: number; // 元の通貨での合計
    amount_jpy: number; // 円換算できた分の合計
    unconverted_amount: number; // 換算されていない分(GBPのみ発生。JPYは常に0)
    count: number;
  }>;
  by_category: Array<{
    category_major: string;
    category_minor: string | null;
    amount_jpy: number;
    unconverted_amount: number;
    count: number;
  }>;
  by_business: Array<{ is_business: boolean; amount_jpy: number; count: number }>;
}

export async function getSpendingSummary(filters: {
  from: string;
  to: string;
  is_business?: boolean | null;
  currency?: Currency | null;
}): Promise<SpendingSummary> {
  const { from, to } = filters;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new Error("from/to が YYYY-MM-DD ではありません");
  }

  const rows = (await sql`
    SELECT currency, is_business, category_major, category_minor,
           SUM(amount) AS amount_sum,
           SUM(COALESCE(amount_jpy, 0)) AS amount_jpy_sum,
           SUM(CASE WHEN amount_jpy IS NULL THEN amount ELSE 0 END) AS unconverted_sum,
           COUNT(*) AS cnt
    FROM expenses
    WHERE expense_date BETWEEN ${from} AND ${to}
      AND (${filters.is_business ?? null}::boolean IS NULL OR is_business = ${filters.is_business ?? null})
      AND (${filters.currency ?? null}::text IS NULL OR currency = ${filters.currency ?? null})
    GROUP BY currency, is_business, category_major, category_minor
  `) as Array<{
    currency: Currency;
    is_business: boolean;
    category_major: string;
    category_minor: string | null;
    amount_sum: string;
    amount_jpy_sum: string;
    unconverted_sum: string;
    cnt: string;
  }>;

  const byCurrency = new Map<
    Currency,
    { amount: number; amount_jpy: number; unconverted_amount: number; count: number }
  >();
  const byCategory = new Map<
    string,
    {
      category_major: string;
      category_minor: string | null;
      amount_jpy: number;
      unconverted_amount: number;
      count: number;
    }
  >();
  const byBusiness = new Map<boolean, { amount_jpy: number; count: number }>();
  let total_jpy = 0;
  let unconverted_gbp = 0;

  for (const r of rows) {
    const amountSum = Number(r.amount_sum);
    const amountJpySum = Number(r.amount_jpy_sum);
    const unconvertedSum = Number(r.unconverted_sum);
    const cnt = Number(r.cnt);

    total_jpy += amountJpySum;
    if (r.currency === "GBP") unconverted_gbp += unconvertedSum;

    const c = byCurrency.get(r.currency) ?? {
      amount: 0,
      amount_jpy: 0,
      unconverted_amount: 0,
      count: 0,
    };
    c.amount += amountSum;
    c.amount_jpy += amountJpySum;
    c.unconverted_amount += unconvertedSum;
    c.count += cnt;
    byCurrency.set(r.currency, c);

    const catKey = `${r.category_major}|${r.category_minor ?? ""}`;
    const cat = byCategory.get(catKey) ?? {
      category_major: r.category_major,
      category_minor: r.category_minor,
      amount_jpy: 0,
      unconverted_amount: 0,
      count: 0,
    };
    cat.amount_jpy += amountJpySum;
    cat.unconverted_amount += unconvertedSum;
    cat.count += cnt;
    byCategory.set(catKey, cat);

    const biz = byBusiness.get(r.is_business) ?? { amount_jpy: 0, count: 0 };
    biz.amount_jpy += amountJpySum;
    biz.count += cnt;
    byBusiness.set(r.is_business, biz);
  }

  return {
    from,
    to,
    total_jpy,
    unconverted_gbp,
    by_currency: [...byCurrency.entries()].map(([currency, v]) => ({ currency, ...v })),
    by_category: [...byCategory.values()].sort((a, b) => b.amount_jpy - a.amount_jpy),
    by_business: [...byBusiness.entries()].map(([is_business, v]) => ({ is_business, ...v })),
  };
}

// ============================================================
// ジャンル設定 (app_settings.expense_categories) の読み取りヘルパー。
// Web UI 用。MCPツールとしては汎用の get_setting/set_setting をそのまま使う。
// ============================================================
export interface CategorySettings {
  [major: string]: string[];
}

export async function getExpenseCategories(): Promise<CategorySettings> {
  const v = await getSetting("expense_categories");
  if (!v) return {};
  try {
    return JSON.parse(v) as CategorySettings;
  } catch {
    return {};
  }
}

export async function getGbpJpyRate(): Promise<number | null> {
  const v = await getSetting(RATE_SETTING_KEY);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
