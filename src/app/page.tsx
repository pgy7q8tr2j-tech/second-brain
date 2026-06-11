import Link from "next/link";
import { sql } from "@/lib/db";
import { bodyForDisplay, type Memo } from "@/lib/memos";
import { C, areaColor } from "./theme";

export const dynamic = "force-dynamic";

async function getData() {
  const memos = (await sql`
    SELECT m.*, COALESCE(l.cnt, 0)::int AS link_count
    FROM memos m
    LEFT JOIN (
      SELECT id, count(*) AS cnt FROM (
        SELECT from_id AS id FROM links
        UNION ALL
        SELECT to_id AS id FROM links
      ) t GROUP BY id
    ) l ON l.id = m.id
    ORDER BY m.created_at DESC
  `) as Array<Memo & { link_count: number }>;
  return memos;
}

function fmtDate(s: string): string {
  const d = new Date(s);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function Home() {
  const memos = await getData();

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", paddingBottom: 40 }}>
      {/* ヘッダ */}
      <div style={{ padding: "20px 20px 8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <h1 style={{ fontSize: 30, fontWeight: 700, color: C.text, margin: 0 }}>
            メモ
          </h1>
          <Link
            href="/graph"
            style={{
              color: C.accent,
              textDecoration: "none",
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            グラフ表示
          </Link>
        </div>
        <p style={{ color: C.secondary, fontSize: 13, margin: "6px 0 0" }}>
          {memos.length} 件のメモ
        </p>
      </div>

      {/* リスト (メールのインボックス風) */}
      <div
        style={{
          background: C.card,
          margin: "8px 16px",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {memos.length === 0 ? (
          <div style={{ padding: 24, color: C.secondary, fontSize: 14 }}>
            メモはまだありません。
          </div>
        ) : (
          memos.map((m, i) => {
            const body = bodyForDisplay(m.content);
            return (
              <Link
                key={m.id}
                href={`/memo/${m.id}`}
                style={{
                  display: "block",
                  padding: "12px 16px",
                  textDecoration: "none",
                  color: "inherit",
                  borderTop: i === 0 ? "none" : `1px solid ${C.separator}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: areaColor(m.area),
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, color: C.secondary, fontWeight: 600 }}>
                    {m.area ?? "未分類"}
                  </span>
                  {m.kind !== "memo" ? (
                    <span style={{ fontSize: 12, color: C.accent }}>{m.kind}</span>
                  ) : null}
                  {m.priority ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#fff",
                        background:
                          m.priority === "P0"
                            ? "#ff3b30"
                            : m.priority === "P1"
                              ? "#ff9500"
                              : "#8e8e93",
                        borderRadius: 5,
                        padding: "1px 5px",
                      }}
                    >
                      {m.priority}
                    </span>
                  ) : null}
                  {m.status === "open" ? (
                    <span style={{ fontSize: 12, color: "#ff9500" }}>未完</span>
                  ) : null}
                  <span style={{ marginLeft: "auto", fontSize: 12, color: C.secondary }}>
                    {fmtDate(m.created_at)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 15,
                    color: C.text,
                    lineHeight: 1.45,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {body}
                </div>
                {m.link_count > 0 ? (
                  <div style={{ fontSize: 12, color: C.secondary, marginTop: 4 }}>
                    関連 {m.link_count} 件
                  </div>
                ) : null}
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}
