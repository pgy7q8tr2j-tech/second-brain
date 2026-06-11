import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Neon の HTTP ドライバ。サーバーレス(Vercel)上で接続プールを持たずに
// 1クエリ = 1 HTTP リクエストで実行できる。
//
// タグ付きテンプレート `sql\`...\`` でパラメータは自動でプレースホルダ化され、
// SQL インジェクションを防ぐ。動的クエリは `sql(text, params)` でも呼べる。
//
// 接続クライアントは「初回クエリ時」に遅延生成する。こうすることで
// DATABASE_URL 未設定でもモジュール import 自体は失敗せず、
// next build (環境変数なし) が通る。

let client: NeonQueryFunction<false, false> | null = null;

function getClient(): NeonQueryFunction<false, false> {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  client = neon(url);
  return client;
}

// tagged-template と (text, params) 呼び出しの両方を透過的に中継する
export const sql = ((...args: unknown[]) =>
  // @ts-expect-error 引数はそのまま neon の関数に委譲する
  getClient()(...args)) as NeonQueryFunction<false, false>;
