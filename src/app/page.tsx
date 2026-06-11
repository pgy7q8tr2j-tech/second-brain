// 最小 UI: 稼働確認とメモ件数の表示のみ。操作は Claude チャット経由が主。
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getStats() {
  try {
    const rows = (await sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE kind = 'task' AND status = 'open')::int AS open_tasks
      FROM memos
    `) as Array<{ total: number; open_tasks: number }>;
    return { ok: true as const, ...rows[0] };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function Home() {
  const stats = await getStats();
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>🧠 Second Brain</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>
        Personal MCP server. 操作は Claude アプリのチャットから行います。
      </p>

      <section
        style={{
          marginTop: 24,
          padding: 20,
          borderRadius: 12,
          background: "#151922",
          border: "1px solid #232a36",
        }}
      >
        {stats.ok ? (
          <>
            <p style={{ margin: "4px 0" }}>
              DB 接続: <strong style={{ color: "#5ee6a8" }}>OK</strong>
            </p>
            <p style={{ margin: "4px 0" }}>メモ総数: {stats.total}</p>
            <p style={{ margin: "4px 0" }}>未完タスク: {stats.open_tasks}</p>
          </>
        ) : (
          <>
            <p style={{ margin: "4px 0", color: "#ff8a8a" }}>
              DB 接続: NG
            </p>
            <p style={{ margin: "4px 0", opacity: 0.7, fontSize: 13 }}>
              {stats.error}
            </p>
          </>
        )}
      </section>

      <section style={{ marginTop: 24, fontSize: 14, opacity: 0.8 }}>
        <p>
          MCP エンドポイント: <code>/api/mcp</code>
        </p>
        <p>接続手順は README を参照してください。</p>
      </section>
    </main>
  );
}
