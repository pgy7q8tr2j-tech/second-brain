import Link from "next/link";
import { notFound } from "next/navigation";
import { listRelated, bodyForDisplay, titleOf } from "@/lib/memos";
import { C, areaColor } from "../../theme";

export const dynamic = "force-dynamic";

function fmtDate(s: string): string {
  const d = new Date(s);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function MemoDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const fromGraph = from === "graph";
  const backHref = fromGraph ? "/graph" : "/";
  const backLabel = fromGraph ? "← グラフ表示" : "← メモ一覧";
  const { memo, linked } = await listRelated(id);
  if (!memo) notFound();

  const meta: string[] = [memo.kind];
  if (memo.area) meta.push(memo.area);
  if (memo.priority) meta.push(memo.priority);
  if (memo.status) meta.push(memo.status);
  if (memo.due_date) meta.push(`締切 ${memo.due_date}`);
  meta.push(fmtDate(memo.created_at));

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ padding: "16px 20px 4px" }}>
        <Link
          href={backHref}
          style={{ color: C.accent, textDecoration: "none", fontSize: 16 }}
        >
          {backLabel}
        </Link>
      </div>

      {/* 本文カード */}
      <div
        style={{
          background: C.card,
          margin: "8px 16px",
          borderRadius: 14,
          padding: 18,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: areaColor(memo.area),
            }}
          />
          <span style={{ fontSize: 13, color: C.secondary }}>{meta.join("　·　")}</span>
        </div>
        <div
          style={{
            fontSize: 16,
            lineHeight: 1.7,
            color: C.text,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {bodyForDisplay(memo.content)}
        </div>
      </div>

      {/* 関連 (リンク済み・双方向) */}
      <div style={{ padding: "18px 20px 6px" }}>
        <h2 style={{ fontSize: 15, color: C.secondary, fontWeight: 600, margin: 0 }}>
          関連するメモ（{linked.length}）
        </h2>
      </div>
      <div
        style={{
          background: C.card,
          margin: "0 16px",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {linked.length === 0 ? (
          <div style={{ padding: 18, color: C.secondary, fontSize: 14 }}>
            リンクされたメモはありません。
          </div>
        ) : (
          linked.map((r, i) => (
            <Link
              key={r.id}
              href={`/memo/${r.id}${fromGraph ? "?from=graph" : ""}`}
              style={{
                display: "block",
                padding: "12px 16px",
                textDecoration: "none",
                color: "inherit",
                borderTop: i === 0 ? "none" : `1px solid ${C.separator}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: areaColor(r.area),
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 15, color: C.text }}>{titleOf(r.content)}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: C.secondary }}>
                  {r.direction === "out" ? "→" : "←"}
                </span>
              </div>
              {r.reason ? (
                <div style={{ fontSize: 12, color: C.secondary, marginTop: 4, paddingLeft: 17 }}>
                  {r.reason}
                </div>
              ) : null}
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
