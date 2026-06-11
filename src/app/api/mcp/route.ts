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
  listTasks,
  exportAll,
} from "@/lib/memos";

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
        area: z.string().optional().describe("分類 例: creative/practice/investing/other"),
        priority: priorityEnum.optional().describe("P0|P1|P2 (task 用)"),
        due_date: z.string().optional().describe("締切 YYYY-MM-DD (task 用)"),
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
