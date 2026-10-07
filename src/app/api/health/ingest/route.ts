import {
  validateAndFlatten,
  upsertHealthRows,
  logIngest,
  ValidationError,
} from "@/lib/health";

// Neon を使うため Node.js ランタイムで動かす。
export const runtime = "nodejs";
export const maxDuration = 30;

// ---- 定数時間比較 ------------------------------------------
// 長さが違えば即 false (長さ自体は秘密ではない)。
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---- 認証 --------------------------------------------------
// Authorization: Bearer <HEALTH_INGEST_TOKEN>。MCP 用とは別の変数。
function isAuthorized(req: Request): boolean {
  const token = process.env.HEALTH_INGEST_TOKEN;
  if (!token) return false; // 未設定なら全拒否 (誤って無認証で開けない)
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  return timingSafeEqual(auth, expected);
}

export async function POST(req: Request): Promise<Response> {
  // サーバー未設定 (トークン無し) は 500。中身は出さない。
  if (!process.env.HEALTH_INGEST_TOKEN) {
    return Response.json(
      { error: "server misconfigured" },
      { status: 500 },
    );
  }

  // 認証。失敗時はトークンもデータも出さない。
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // JSON パース
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  // 検証 & 平坦化
  let parsed;
  try {
    parsed = validateAndFlatten(body);
  } catch (e) {
    if (e instanceof ValidationError) {
      // 検証メッセージは「どの項目がおかしいか」までで、値は含めすぎない。
      return Response.json({ error: e.message }, { status: 400 });
    }
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  try {
    // 生 JSON を 14 日分だけ保存 (調査用)。失敗しても保存本体は続ける。
    try {
      await logIngest(body);
    } catch {
      // ログ保存の失敗は本処理を止めない (握りつぶす。中身は出さない)。
    }

    const { upserted, skipped } = await upsertHealthRows(
      parsed.rows,
      parsed.sent_at,
      parsed.tz,
    );

    return Response.json({ ok: true, upserted, skipped }, { status: 200 });
  } catch {
    // DB エラー等。中身 (トークン・データ) はログにもレスポンスにも出さない。
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
