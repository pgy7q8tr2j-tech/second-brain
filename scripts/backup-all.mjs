// 全テーブルの全件バックアップ (家計簿テーブル追加前の安全策)。
//   実行: node scripts/backup-all.mjs   (.env.local / .env を自動で読む)
// backups/ 以下にタイムスタンプ付きJSONを書き出す (.gitignore済み、コミットしない)。
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const sql = neon(url);

// 現時点で存在する全テーブル (家計簁テーブル追加前)
const TABLES = [
  "memos",
  "links",
  "meal_items",
  "app_settings",
  "health_daily",
  "health_ingest_log",
];

const out = { exported_at: new Date().toISOString(), tables: {} };

for (const table of TABLES) {
  const rows = await sql(`SELECT * FROM ${table}`);
  out.tables[table] = rows;
  console.log(`  ${table}: ${rows.length} 件`);
}

const dir = join(__dirname, "..", "backups");
mkdirSync(dir, { recursive: true });
const stamp = out.exported_at.replace(/[:.]/g, "-");
const outPath = join(dir, `backup-${stamp}.json`);
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`✅ バックアップ完了: ${outPath}`);
