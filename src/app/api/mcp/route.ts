import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  addMemo,
  linkMemos,
  searchMemos,
  getMemo,
  listMemos,
  listRelated,
  updateMemo,
  completeTask,
  deleteMemo,
  listTasks,
  exportAll,
} from "@/lib/memos";
import { getHealthDay, getHealthRange } from "@/lib/health";
import {
  addMealItems,
  listMealItems,
  updateMealItem,
  deleteMealItem,
  getSetting,
  setSetting,
  MEAL_SLOTS,
  BASES,
} from "@/lib/meals";
import {
  addExpenses,
  listExpenses,
  updateExpense,
  deleteExpense,
  getSpendingSummary,
  CURRENCIES,
} from "@/lib/expenses";

// Neon + ストリーミングのため Node.js ランタイムで動かす
export const runtime = "nodejs";
export const maxDuration = 60;

const kindEnum = z.enum(["memo", "task", "asset", "decision"]);
const priorityEnum = z.enum(["P0", "P1", "P2"]);
const statusEnum = z.enum(["open", "done"]);

// ツール結果を MCP の content 形式に整える
function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

const handler = createMcpHandler(
  (server) => {
    // -------- add_memo --------
    server.tool(
      "add_memo",
      "メモを保存し、その内容に関連しそうな既存メモを全文検索して候補として返す。候補を見てリンクするか判断する。kind 未指定は 'memo'。kind='task' は自動で status='open' になる。",
      {
        content: z.string().min(1).describe("メモ本文"),
        kind: kindEnum.optional().describe("memo|task|asset|decision (既定 memo)"),
        area: z
          .string()
          .optional()
          .describe("分類(日本語) 例: 創作/開発/投資/健康/人間関係/思考/知識/語学/エンタメ/実務/旅行/時事/習慣/その他"),
        priority: priorityEnum.optional().describe("P0|P1|P2 (task の優先度。締切は使わない方針)"),
        due_date: z.string().optional().describe("締切 YYYY-MM-DD (基本は未使用)"),
      },
      async (args) => {
        try {
          return ok(await addMemo(args));
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- link_memos --------
    server.tool(
      "link_memos",
      "2つのメモを理由つきでリンクする。既に存在する場合は理由を更新する。",
      {
        from_id: z.string().describe("リンク元メモ id"),
        to_id: z.string().describe("リンク先メモ id"),
        reason: z.string().optional().describe("関連の理由"),
      },
      async (args) => {
        try {
          return ok(await linkMemos(args));
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- search_memos --------
    server.tool(
      "search_memos",
      "メモを全文検索する (日本語対応のトライグラム部分一致 + 類似度ランキング)。kind/area で絞り込み可。",
      {
        query: z.string().min(1).describe("検索語"),
        kind: kindEnum.optional(),
        area: z.string().optional(),
        limit: z.number().int().positive().max(100).optional().describe("最大件数 (既定 20)"),
      },
      async (args) => {
        try {
          return ok(await searchMemos(args));
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- get_memo --------
    server.tool(
      "get_memo",
      "id を指定して1件のメモを取得する。",
      { id: z.string().describe("メモ id") },
      async ({ id }) => {
        try {
          const memo = await getMemo(id);
          return memo ? ok(memo) : fail(`memo not found: ${id}`);
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- list_memos --------
    server.tool(
      "list_memos",
      "メモ一覧を新しい順で返す。kind/area/status で絞り込み可。",
      {
        kind: kindEnum.optional(),
        area: z.string().optional(),
        status: statusEnum.optional(),
        limit: z.number().int().positive().max(200).optional().describe("最大件数 (既定 50)"),
      },
      async (args) => {
        try {
          return ok(await listMemos(args));
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- list_related --------
    server.tool(
      "list_related",
      "指定メモの「リンク済み (双方向)」と「未リンクの関連候補」を返す。",
      { id: z.string().describe("メモ id") },
      async ({ id }) => {
        try {
          const result = await listRelated(id);
          return result.memo ? ok(result) : fail(`memo not found: ${id}`);
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- update_memo --------
    server.tool(
      "update_memo",
      "メモのフィールドを部分更新する。指定したフィールドのみ変更される。",
      {
        id: z.string().describe("メモ id"),
        content: z.string().optional(),
        kind: kindEnum.optional(),
        area: z.string().nullable().optional(),
        priority: priorityEnum.nullable().optional(),
        status: statusEnum.nullable().optional(),
        due_date: z.string().nullable().optional().describe("YYYY-MM-DD または null"),
      },
      async ({ id, ...fields }) => {
        try {
          const memo = await updateMemo(id, fields);
          return memo ? ok(memo) : fail(`memo not found: ${id}`);
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- complete_task --------
    server.tool(
      "complete_task",
      "タスクを完了 (status='done') にする。",
      { id: z.string().describe("タスク id") },
      async ({ id }) => {
        try {
          const memo = await completeTask(id);
          return memo ? ok(memo) : fail(`memo not found: ${id}`);
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- delete_memo --------
    server.tool(
      "delete_memo",
      "メモを1件削除する。関連リンクも自動で削除される。取り消せないので注意。",
      { id: z.string().describe("削除するメモ id") },
      async ({ id }) => {
        try {
          const memo = await deleteMemo(id);
          return memo
            ? ok({ deleted: true, memo })
            : fail(`memo not found: ${id}`);
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- list_tasks --------
    server.tool(
      "list_tasks",
      "未完タスクを優先度 (P0>P1>P2)・締切順で返す。「今何すべき?」用。status 既定は open。",
      {
        status: statusEnum.optional().describe("既定 open"),
        priority: priorityEnum.optional(),
      },
      async (args) => {
        try {
          return ok(await listTasks(args));
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- get_health_day --------
    server.tool(
      "get_health_day",
      "指定日の健康の数値 (iPhoneヘルスケアの日次合計) を返す。各項目に value / unit / tz と、その値の『最終受信時刻 (sent_at)』が付く。日全体の最新時刻 last_sent_at も返す。数値はこの last_sent_at 時点のもので、それ以降の活動は含まれない (iPhoneがロック中は送信されないため)。値は加工せずそのまま返すので、消費と摂取の差し引きは呼び出し側で計算すること。データが無い日は has_data=false。metric: active_energy(kcal)/basal_energy(kcal)/steps(count)/walking_distance(km)/body_mass(kg)。",
      {
        date: z.string().describe("対象日 YYYY-MM-DD (送信元タイムゾーンで区切った日付)"),
      },
      async ({ date }) => {
        try {
          return ok(await getHealthDay(date));
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- get_health_range --------
    server.tool(
      "get_health_range",
      "期間内 (最大90日) の健康の数値を日ごとに返す。体重や消費カロリーの推移を見る用。各日に last_sent_at が付く。数値は各日の last_sent_at 時点のもので、それ以降の活動は含まれない。値は加工せずそのまま返す (計算は呼び出し側)。データのある日だけ返る。",
      {
        from: z.string().describe("開始日 YYYY-MM-DD (両端含む)"),
        to: z.string().describe("終了日 YYYY-MM-DD (両端含む)"),
      },
      async ({ from, to }) => {
        try {
          return ok(await getHealthRange(from, to));
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- add_meal_items --------
    server.tool(
      "add_meal_items",
      "食事の品を1件以上まとめて登録する(健康ダッシュボード集計用の構造化データ)。既存の自由文メモ(健康エリアの食事記録)とは独立。source_memo_idで元メモを紐づけられる。kcalが不明な品はkcal_min/kcal_maxを省略する(推測で埋めない)。",
      {
        items: z
          .array(
            z.object({
              record_date: z.string().describe("記録日 YYYY-MM-DD(メモ本文タイトルの日付)"),
              meal_slot: z.enum(MEAL_SLOTS as [string, ...string[]]).describe("朝|昼|夜|間食|深夜"),
              item_name: z.string().min(1).describe("品名"),
              kcal_min: z.number().nullable().optional().describe("kcal下限(補助表示)"),
              kcal_max: z.number().nullable().optional().describe("kcal上限(集計の軸)"),
              basis: z.enum(BASES as [string, ...string[]]).nullable().optional().describe("任意。ラベル記載|推測|未計上|要確認"),
              note: z.string().nullable().optional().describe("出典・補足"),
              source_memo_id: z.string().nullable().optional().describe("元メモのid"),
            }),
          )
          .min(1),
      },
      async ({ items }) => {
        try {
          return ok(await addMealItems(items as never));
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- list_meal_items --------
    server.tool(
      "list_meal_items",
      "期間内(両端含む)の食事の品を記録日・食事区分順で返す。",
      {
        from: z.string().describe("開始日 YYYY-MM-DD"),
        to: z.string().describe("終了日 YYYY-MM-DD"),
      },
      async ({ from, to }) => {
        try {
          return ok(await listMealItems(from, to));
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- update_meal_item --------
    server.tool(
      "update_meal_item",
      "食事の品を部分更新する。",
      {
        id: z.string(),
        record_date: z.string().optional(),
        meal_slot: z.enum(MEAL_SLOTS as [string, ...string[]]).optional(),
        item_name: z.string().optional(),
        kcal_min: z.number().nullable().optional(),
        kcal_max: z.number().nullable().optional(),
        basis: z.enum(BASES as [string, ...string[]]).nullable().optional(),
        note: z.string().nullable().optional(),
        source_memo_id: z.string().nullable().optional(),
      },
      async ({ id, ...fields }) => {
        try {
          const item = await updateMealItem(id, fields as never);
          return item ? ok(item) : fail(`meal item not found: ${id}`);
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- delete_meal_item --------
    server.tool(
      "delete_meal_item",
      "食事の品を1件削除する。",
      { id: z.string() },
      async ({ id }) => {
        try {
          const item = await deleteMealItem(id);
          return item ? ok({ deleted: true, item }) : fail(`meal item not found: ${id}`);
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- get_setting / set_setting --------
    server.tool(
      "get_setting",
      "設定値を取得する(例: calorie_deficit_target)。",
      { key: z.string() },
      async ({ key }) => {
        try {
          const value = await getSetting(key);
          return ok({ key, value });
        } catch (e) {
          return fail(e);
        }
      },
    );
    server.tool(
      "set_setting",
      "設定値を変更する(例: calorie_deficit_target='400')。",
      { key: z.string(), value: z.string() },
      async ({ key, value }) => {
        try {
          await setSetting(key, value);
          return ok({ key, value });
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- add_expenses --------
    server.tool(
      "add_expenses",
      "支出を1件以上まとめて登録する(家計簿)。ユーザーが金額を伝えたら、ジャンル(category_major/category_minor)はClaudeが判断して付ける。判断に迷うものは記録後にユーザーへ確認する。ジャンルの選択肢は get_setting('expense_categories') で確認できる(JSON: 大分類→小分類配列。小分類が空配列の大分類はcategory_minorを省略してよい)。currency='GBP'でget_setting('gbp_jpy_rate')が未設定の場合、amount_jpyはnullになり集計では「換算なし」として扱われる。",
      {
        items: z
          .array(
            z.object({
              expense_date: z
                .string()
                .describe(
                  "支払った日 YYYY-MM-DD。支払った場所の現地時間のカレンダー日付で判断する(日本ならJST、ロンドンならイギリス時間)。深夜0時を過ぎた支払いは翌日扱い。",
                ),
              amount: z.number().positive().describe("金額(元の通貨。税込の実際の支払額)"),
              currency: z.enum(CURRENCIES as [string, ...string[]]).describe("JPY|GBP"),
              category_major: z.string().min(1).describe("大分類"),
              category_minor: z.string().nullable().optional().describe("小分類。無い大分類では省略可"),
              memo: z.string().nullable().optional().describe("内容メモ(店名・品名など)"),
              is_business: z.boolean().optional().describe("タトゥー事業の経費か(既定false)"),
              payment_method: z.string().nullable().optional().describe("支払い方法(任意。現金/カード名など)"),
              source_meal_item_id: z.string().nullable().optional().describe("食事と同時に記録した場合、関連する食事記録(meal_items)のid"),
            }),
          )
          .min(1),
      },
      async ({ items }) => {
        try {
          return ok(await addExpenses(items as never));
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- list_expenses --------
    server.tool(
      "list_expenses",
      "期間内(両端含む)の支出を日付順で返す。category_major/is_business/currencyで絞り込み可。",
      {
        from: z.string().describe("開始日 YYYY-MM-DD"),
        to: z.string().describe("終了日 YYYY-MM-DD"),
        category_major: z.string().optional().describe("大分類で絞り込み"),
        is_business: z.boolean().optional().describe("事業(true)/私生活(false)で絞り込み"),
        currency: z.enum(CURRENCIES as [string, ...string[]]).optional().describe("JPY|GBPで絞り込み"),
      },
      async ({ from, to, category_major, is_business, currency }) => {
        try {
          return ok(
            await listExpenses({
              from,
              to,
              category_major: category_major ?? null,
              is_business: is_business ?? null,
              currency: (currency as "JPY" | "GBP" | undefined) ?? null,
            }),
          );
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- update_expense --------
    server.tool(
      "update_expense",
      "支出を部分更新する。amountまたはcurrencyを変更すると、その時点の gbp_jpy_rate 設定を使って円換算額(amount_jpy)とレート(fx_rate)が自動で再計算される(他のフィールドだけの更新では換算は変わらない)。",
      {
        id: z.string(),
        expense_date: z.string().optional(),
        amount: z.number().positive().optional(),
        currency: z.enum(CURRENCIES as [string, ...string[]]).optional(),
        category_major: z.string().optional(),
        category_minor: z.string().nullable().optional(),
        memo: z.string().nullable().optional(),
        is_business: z.boolean().optional(),
        payment_method: z.string().nullable().optional(),
        source_meal_item_id: z.string().nullable().optional(),
      },
      async ({ id, ...fields }) => {
        try {
          const expense = await updateExpense(id, fields as never);
          return expense ? ok(expense) : fail(`expense not found: ${id}`);
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- delete_expense --------
    server.tool(
      "delete_expense",
      "支出を1件削除する。",
      { id: z.string() },
      async ({ id }) => {
        try {
          const expense = await deleteExpense(id);
          return expense ? ok({ deleted: true, expense }) : fail(`expense not found: ${id}`);
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- get_spending_summary --------
    server.tool(
      "get_spending_summary",
      "期間指定で支出の合計を ジャンル別・通貨別・事業/私生活別 に集計して返す。円換算できていない(GBPでレート未設定)分は unconverted_gbp / unconverted_amount として別枠で返るので、total_jpyだけでは「換算なし」の支出が漏れることに注意。",
      {
        from: z.string().describe("開始日 YYYY-MM-DD"),
        to: z.string().describe("終了日 YYYY-MM-DD"),
        is_business: z.boolean().optional().describe("事業(true)/私生活(false)で絞り込み"),
        currency: z.enum(CURRENCIES as [string, ...string[]]).optional().describe("JPY|GBPで絞り込み"),
      },
      async ({ from, to, is_business, currency }) => {
        try {
          return ok(
            await getSpendingSummary({
              from,
              to,
              is_business: is_business ?? null,
              currency: (currency as "JPY" | "GBP" | undefined) ?? null,
            }),
          );
        } catch (e) {
          return fail(e);
        }
      },
    );

    // -------- export_all --------
    server.tool(
      "export_all",
      "全メモとリンクを書き出す。format='json' か 'markdown'。",
      { format: z.enum(["json", "markdown"]).optional().describe("既定 json") },
      async ({ format }) => {
        try {
          const text = await exportAll(format ?? "json");
          return { content: [{ type: "text" as const, text }] };
        } catch (e) {
          return fail(e);
        }
      },
    );
  },
  {
    // サーバーメタ情報
    serverInfo: { name: "second-brain", version: "1.0.0" },
  },
  {
    // /api/mcp で Streamable HTTP を提供 (basePath + 既定の /mcp)
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: true,
  },
);

// ---- 単一ユーザー用の認証ラッパー ----
// 2 通りの渡し方を受け付ける:
//   (1) Authorization: Bearer <TOKEN>       … Claude Code / API / デスクトップ設定向け
//   (2) URL クエリ ?token=<TOKEN> (?key= も可) … Claude アプリのコネクタUI向け
//       （アプリのコネクタUIはヘッダを設定できず URL しか入れられないため）
function withBearer(
  inner: (req: Request) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const token = process.env.MCP_SECRET_TOKEN;
    if (!token) {
      return Response.json(
        { error: "server misconfigured: MCP_SECRET_TOKEN not set" },
        { status: 500 },
      );
    }

    // (1) Authorization ヘッダ
    const auth = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${token}`;
    const headerOk =
      auth.length === expected.length && timingSafeEqual(auth, expected);

    // (2) URL クエリ
    const url = new URL(req.url);
    const q = url.searchParams.get("token") ?? url.searchParams.get("key") ?? "";
    const queryOk = q.length === token.length && timingSafeEqual(q, token);

    if (!headerOk && !queryOk) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return inner(req);
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const authed = withBearer(handler);

export { authed as GET, authed as POST, authed as DELETE };
