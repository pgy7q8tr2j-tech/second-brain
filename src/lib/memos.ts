import { sql } from "./db";

// ============================================================
// 型
// ============================================================
export type Kind = "memo" | "task" | "asset" | "decision";
export type Priority = "P0" | "P1" | "P2";
export type Status = "open" | "done";

export interface Memo {
  id: string;
  created_at: string;
  updated_at: string;
  content: string;
  kind: Kind;
  area: string | null;
  priority: Priority | null;
  status: Status | null;
  due_date: string | null;
}

export interface Link {
  from_id: string;
  to_id: string;
  reason: string | null;
  created_at: string;
}

export interface RelatedCandidate {
  id: string;
  content: string;
  kind: Kind;
  area: string | null;
  score: number;
}

// ============================================================
// add_memo
// 保存して、関連しそうな既存メモを全文検索で候補として一緒に返す。
// ============================================================
export async function addMemo(input: {
  content: string;
  kind?: Kind;
  area?: string | null;
  priority?: Priority | null;
  due_date?: string | null;
}): Promise<{ memo: Memo; related_candidates: RelatedCandidate[] }> {
  const kind: Kind = input.kind ?? "memo";
  // task は既定で status=open にしておくと list_tasks で拾える
  const status: Status | null = kind === "task" ? "open" : null;

  const rows = (await sql`
    INSERT INTO memos (content, kind, area, priority, status, due_date)
    VALUES (
      ${input.content},
      ${kind},
      ${input.area ?? null},
      ${input.priority ?? null},
      ${status},
      ${input.due_date ?? null}
    )
    RETURNING *
  `) as Memo[];

  const memo = rows[0];

  // 自分自身を除いて関連候補を検索
  const related_candidates = await searchRelated(input.content, memo.id, 5);

  return { memo, related_candidates };
}

// ============================================================
// 内部: トライグラムによる関連検索 (日本語対応のため ILIKE + similarity)
// ============================================================
async function searchRelated(
  query: string,
  excludeId: string | null,
  limit: number,
): Promise<RelatedCandidate[]> {
  const rows = (await sql`
    SELECT id, content, kind, area,
           similarity(content, ${query}) AS score
    FROM memos
    WHERE (${excludeId}::uuid IS NULL OR id <> ${excludeId}::uuid)
      AND (content ILIKE '%' || ${query} || '%'
           OR similarity(content, ${query}) > 0.15)
    ORDER BY score DESC, created_at DESC
    LIMIT ${limit}
  `) as RelatedCandidate[];
  return rows;
}

// ============================================================
// search_memos
// ============================================================
export async function searchMemos(input: {
  query: string;
  kind?: Kind;
  area?: string;
  limit?: number;
}): Promise<RelatedCandidate[]> {
  const limit = input.limit ?? 20;
  const rows = (await sql`
    SELECT id, content, kind, area,
           similarity(content, ${input.query}) AS score
    FROM memos
    WHERE (content ILIKE '%' || ${input.query} || '%'
           OR similarity(content, ${input.query}) > 0.1)
      AND (${input.kind ?? null}::text IS NULL OR kind = ${input.kind ?? null})
      AND (${input.area ?? null}::text IS NULL OR area = ${input.area ?? null})
    ORDER BY score DESC, created_at DESC
    LIMIT ${limit}
  `) as RelatedCandidate[];
  return rows;
}

// ============================================================
// link_memos
// ============================================================
export async function linkMemos(input: {
  from_id: string;
  to_id: string;
  reason?: string | null;
}): Promise<Link> {
  if (input.from_id === input.to_id) {
    throw new Error("from_id と to_id が同一です");
  }
  const rows = (await sql`
    INSERT INTO links (from_id, to_id, reason)
    VALUES (${input.from_id}::uuid, ${input.to_id}::uuid, ${input.reason ?? null})
    ON CONFLICT (from_id, to_id)
    DO UPDATE SET reason = EXCLUDED.reason
    RETURNING *
  `) as Link[];
  return rows[0];
}

// ============================================================
// get_memo
// ============================================================
export async function getMemo(id: string): Promise<Memo | null> {
  const rows = (await sql`
    SELECT * FROM memos WHERE id = ${id}::uuid
  `) as Memo[];
  return rows[0] ?? null;
}

// ============================================================
// list_memos
// ============================================================
export async function listMemos(input: {
  kind?: Kind;
  area?: string;
  status?: Status;
  limit?: number;
}): Promise<Memo[]> {
  const limit = input.limit ?? 50;
  const rows = (await sql`
    SELECT * FROM memos
    WHERE (${input.kind ?? null}::text IS NULL OR kind = ${input.kind ?? null})
      AND (${input.area ?? null}::text IS NULL OR area = ${input.area ?? null})
      AND (${input.status ?? null}::text IS NULL OR status = ${input.status ?? null})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as Memo[];
  return rows;
}

// ============================================================
// list_related
// リンク済み (双方向) + 候補関連 を返す
// ============================================================
export async function listRelated(id: string): Promise<{
  memo: Memo | null;
  linked: Array<Memo & { reason: string | null; direction: "out" | "in" }>;
  candidates: RelatedCandidate[];
}> {
  const memo = await getMemo(id);
  if (!memo) {
    return { memo: null, linked: [], candidates: [] };
  }

  // 双方向のリンク先を取得
  const linked = (await sql`
    SELECT m.*, l.reason,
           CASE WHEN l.from_id = ${id}::uuid THEN 'out' ELSE 'in' END AS direction
    FROM links l
    JOIN memos m
      ON m.id = CASE WHEN l.from_id = ${id}::uuid THEN l.to_id ELSE l.from_id END
    WHERE l.from_id = ${id}::uuid OR l.to_id = ${id}::uuid
    ORDER BY l.created_at DESC
  `) as Array<Memo & { reason: string | null; direction: "out" | "in" }>;

  // すでにリンク済みの id を候補から除く
  const linkedIds = new Set(linked.map((r) => r.id));
  linkedIds.add(id);

  const rawCandidates = await searchRelated(memo.content, id, 10);
  const candidates = rawCandidates.filter((c) => !linkedIds.has(c.id)).slice(0, 5);

  return { memo, linked, candidates };
}

// ============================================================
// update_memo
// ============================================================
const UPDATABLE: Array<keyof Memo> = [
  "content",
  "kind",
  "area",
  "priority",
  "status",
  "due_date",
];

export async function updateMemo(
  id: string,
  fields: Partial<Pick<Memo, "content" | "kind" | "area" | "priority" | "status" | "due_date">>,
): Promise<Memo | null> {
  const entries = Object.entries(fields).filter(
    ([k, v]) => UPDATABLE.includes(k as keyof Memo) && v !== undefined,
  );
  if (entries.length === 0) {
    return getMemo(id);
  }

  // 動的な SET 句のため positional placeholders で実行する。
  // neon の関数は tagged-template だけでなく sql(text, params) でも呼べる。
  // カラム名はホワイトリスト(UPDATABLE)済みなので連結しても安全。
  const setParts = entries.map(([k], i) => `${k} = $${i + 2}`);
  const params = [id, ...entries.map(([, v]) => v)];
  const text = `
    UPDATE memos
    SET ${setParts.join(", ")}
    WHERE id = $1::uuid
    RETURNING *
  `;
  const rows = (await sql(text, params)) as Memo[];
  return rows[0] ?? null;
}

// ============================================================
// complete_task
// ============================================================
export async function completeTask(id: string): Promise<Memo | null> {
  const rows = (await sql`
    UPDATE memos
    SET status = 'done'
    WHERE id = ${id}::uuid
    RETURNING *
  `) as Memo[];
  return rows[0] ?? null;
}

// ============================================================
// delete_memo
// メモを1件削除する。関連リンクは ON DELETE CASCADE で自動削除。
// ============================================================
export async function deleteMemo(id: string): Promise<Memo | null> {
  const rows = (await sql`
    DELETE FROM memos WHERE id = ${id}::uuid RETURNING *
  `) as Memo[];
  return rows[0] ?? null;
}

// ============================================================
// UI 用: グラフデータ (ノード=メモ, エッジ=リンク)
// ============================================================
export interface GraphNode {
  id: string;
  title: string;
  kind: Kind;
  area: string | null;
  degree: number;
}
export interface GraphEdge {
  source: string;
  target: string;
  reason: string | null;
}
export async function getGraphData(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const memos = (await sql`SELECT id, content, kind, area FROM memos`) as Array<
    Pick<Memo, "id" | "content" | "kind" | "area">
  >;
  const links = (await sql`SELECT from_id, to_id, reason FROM links`) as Array<{
    from_id: string;
    to_id: string;
    reason: string | null;
  }>;
  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.from_id, (degree.get(l.from_id) ?? 0) + 1);
    degree.set(l.to_id, (degree.get(l.to_id) ?? 0) + 1);
  }
  const nodes: GraphNode[] = memos.map((m) => ({
    id: m.id,
    title: titleOf(m.content),
    kind: m.kind,
    area: m.area,
    degree: degree.get(m.id) ?? 0,
  }));
  const edges: GraphEdge[] = links.map((l) => ({
    source: l.from_id,
    target: l.to_id,
    reason: l.reason,
  }));
  return { nodes, edges };
}

// content の先頭から短いタイトルを作る
export function titleOf(content: string): string {
  const firstLine = content.split("\n").find((l) => l.trim()) ?? "";
  return firstLine.replace(/\s+/g, " ").trim().slice(0, 40);
}

// 表示用に出典フッター ("---\n出典: ...") を取り除いた本文を返す
export function bodyForDisplay(content: string): string {
  const i = content.indexOf("\n---\n出典:");
  return (i >= 0 ? content.slice(0, i) : content).trim();
}

// ============================================================
// list_tasks
// 未完タスクを優先度・締切つきで返す (既定は open)
// ============================================================
export async function listTasks(input: {
  status?: Status;
  priority?: Priority;
}): Promise<Memo[]> {
  const status: Status = input.status ?? "open";
  const rows = (await sql`
    SELECT * FROM memos
    WHERE kind = 'task'
      AND status = ${status}
      AND (${input.priority ?? null}::text IS NULL OR priority = ${input.priority ?? null})
    ORDER BY
      (priority = 'P0') DESC,
      (priority = 'P1') DESC,
      (priority = 'P2') DESC,
      due_date ASC NULLS LAST,
      created_at ASC
  `) as Memo[];
  return rows;
}

// ============================================================
// export_all
// ============================================================
export async function exportAll(
  format: "json" | "markdown",
): Promise<string> {
  const memos = (await sql`SELECT * FROM memos ORDER BY created_at ASC`) as Memo[];
  const links = (await sql`SELECT * FROM links ORDER BY created_at ASC`) as Link[];

  if (format === "json") {
    return JSON.stringify({ memos, links, exported_at: new Date().toISOString() }, null, 2);
  }

  // markdown
  const byId = new Map(memos.map((m) => [m.id, m]));
  const lines: string[] = [`# Second Brain Export`, ``, `_${new Date().toISOString()}_`, ``];

  for (const m of memos) {
    lines.push(`## ${m.kind.toUpperCase()} · ${m.id}`);
    const meta: string[] = [];
    if (m.area) meta.push(`area: ${m.area}`);
    if (m.priority) meta.push(`priority: ${m.priority}`);
    if (m.status) meta.push(`status: ${m.status}`);
    if (m.due_date) meta.push(`due: ${m.due_date}`);
    meta.push(`created: ${m.created_at}`);
    lines.push(`_${meta.join(" · ")}_`, ``);
    lines.push(m.content, ``);

    const outgoing = links.filter((l) => l.from_id === m.id);
    if (outgoing.length > 0) {
      lines.push(`**Links:**`);
      for (const l of outgoing) {
        const target = byId.get(l.to_id);
        const snippet = target ? target.content.slice(0, 40).replace(/\n/g, " ") : "(missing)";
        lines.push(`- → ${l.to_id} (${l.reason ?? "no reason"}): ${snippet}`);
      }
      lines.push(``);
    }
    lines.push(`---`, ``);
  }

  return lines.join("\n");
}
