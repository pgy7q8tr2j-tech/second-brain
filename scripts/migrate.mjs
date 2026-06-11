// マイグレーション実行スクリプト
//   ローカル:  npm run migrate   (.env.local / .env を自動で読む)
// 複数ステートメント & plpgsql 関数を含む DDL を流すため
// WebSocket ベースの Pool を使う。
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __dirname = dirname(fileURLToPath(import.meta.url));

// 簡易 .env ローダ (依存追加なし)
for (const f of [".env.local", ".env"]) {
  const p = join(__dirname, "..", f);
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL が未設定です (.env.local に設定してください)。");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const file = join(__dirname, "..", "drizzle", "0001_init.sql");
const ddl = readFileSync(file, "utf8");

console.log("Running migration: drizzle/0001_init.sql ...");
try {
  // パラメータなしの query は simple-query プロトコルになり複数文を実行できる
  await pool.query(ddl);
  console.log("✅ Migration complete.");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
