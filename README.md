# 🧠 Second Brain (Personal MCP Server)

思いついたメモを投げると保存され、関連するメモ同士をリンクでき、後から検索・想起・タスク提案ができる、テキストベースの「第二の脳」。

- **個人利用・単一ユーザー**、**完全無料構成**（Vercel 無料枠 + Neon 無料枠）。固定費は出ません。
- 操作は **Claude アプリのチャット**から、この MCP サーバーの道具を呼んで行います。UI は稼働確認のみの最小構成。
- 「賢さ（リンク判断・タスク提案）」はチャット側の Claude が担当。サーバーの道具は **単純なデータ操作と検索だけ**で、サーバー側で有料の AI API は呼びません。
- データは **DB が正本**。`export_all` で全データを JSON / Markdown に吸い出せます。

---

## 公開している MCP 道具

| 道具 | 説明 |
| --- | --- |
| `add_memo(content, kind?, area?, priority?, due_date?)` | 保存して id を返す。**関連しそうな既存メモを全文検索して候補も一緒に返す**（リンク判断用）。`kind='task'` は自動で `status='open'`。 |
| `link_memos(from_id, to_id, reason?)` | 2つのメモを理由つきでリンク |
| `search_memos(query, kind?, area?, limit?)` | 全文検索（日本語対応のトライグラム部分一致 + 類似度） |
| `get_memo(id)` | 1件取得 |
| `list_memos(kind?, area?, status?, limit?)` | 一覧（新しい順） |
| `list_related(id)` | リンク済み（双方向）＋ 未リンクの関連候補 |
| `update_memo(id, fields)` | 部分更新 |
| `complete_task(id)` | タスクを完了に |
| `delete_memo(id)` | メモを1件削除（関連リンクも自動削除） |
| `list_tasks(status?, priority?)` | 未完タスクを優先度・締切順で（「今何すべき?」用） |
| `export_all(format='json'\|'markdown')` | 全データ書き出し |

### データモデル
- **memos**: `id, created_at, updated_at, content, kind('memo'|'task'|'asset'|'decision'), area, priority('P0'|'P1'|'P2'|null), status('open'|'done'|null), due_date`
- **links**: `from_id, to_id, reason, created_at`
- 検索は Postgres の `pg_trgm`（トライグラム）を使用。**埋め込み/ベクトルは使いません＝無料**。日本語は標準の全文検索だと分かち書きできないため、トライグラムの部分一致 + 類似度ランキングを採用しています。

---

# セットアップ手順（あなたが手でやること）

順番にやれば動きます。所要 15〜20 分。

## ① GitHub にリポジトリを接続

1. GitHub で空のリポジトリを新規作成（例: `second-brain`、Private 推奨）。
2. このフォルダで以下を実行（`<...>` は自分のに置き換え）:

   ```bash
   cd second-brain
   git init
   git add .
   git commit -m "init: second brain mcp server"
   git branch -M main
   git remote add origin https://github.com/<あなた>/second-brain.git
   git push -u origin main
   ```

   > `.env.local` は `.gitignore` 済みなので秘密情報は push されません。

## ② 無料 DB を作成して接続文字列を取得（Neon）

1. <https://neon.tech> にサインアップ（GitHub アカウントで OK、無料）。
2. **New Project** を作成（リージョンは Tokyo / ap 近辺が速い）。
3. プロジェクト作成後に表示される **Connection string** をコピー。
   - 形式: `postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`
   - 後で見るには Dashboard → **Connection Details** → "Connection string"（`Pooled connection` でも `Direct` でも可）。
4. **マイグレーション（テーブル作成）を実行**。次のどちらかで:

   **方法A: 自分の PC から（推奨・簡単）**
   ```bash
   # second-brain フォルダ内で
   echo "DATABASE_URL=ここに接続文字列" > .env.local
   npm install
   npm run migrate
   # -> ✅ Migration complete.
   ```

   **方法B: Neon の SQL Editor に貼る**
   - Neon Dashboard → **SQL Editor** を開き、`drizzle/0001_init.sql` の中身を全部貼って Run。

## ③ 環境変数を決める（DB 接続情報・シークレットトークン）

必要な環境変数は 2 つだけ:

| 変数名 | 値 |
| --- | --- |
| `DATABASE_URL` | ②でコピーした Neon の接続文字列 |
| `MCP_SECRET_TOKEN` | Claude から接続する時の合言葉（長いランダム文字列） |

トークンの生成（PC で実行してコピー）:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## ④ Vercel へデプロイ

1. <https://vercel.com> に GitHub アカウントでサインアップ（無料 Hobby プラン）。
2. **Add New… → Project** → ①の GitHub リポジトリを **Import**。
3. Framework は自動で **Next.js** が選ばれる。**Environment Variables** に③の 2 つを追加:
   - `DATABASE_URL` = Neon の接続文字列
   - `MCP_SECRET_TOKEN` = 生成したトークン
4. **Deploy** を押す。数分で完了。
5. 完了後に表示される URL を控える（例: `https://second-brain-xxxx.vercel.app`）。
   - ブラウザでその URL を開くと「DB 接続: OK / メモ総数」が出れば成功。NG ならマイグレーション(②-4) と `DATABASE_URL` を確認。

## ⑤ デプロイ後の MCP エンドポイント URL

```
https://<あなたのVercel URL>/api/mcp
```

例: `https://second-brain-xxxx.vercel.app/api/mcp`

## ⑥ Claude アプリにカスタム MCP コネクタとして追加

> ⚠️ **重要**: Claude アプリ（web / デスクトップ）の「Add custom connector」UI は
> OAuth しか設定できず、Bearer トークンやカスタムヘッダを入れる欄がありません
> （2026 時点）。そこでこのサーバーは **URL のクエリでトークンを渡す方式**にも対応しています。
> アプリからはこちらを使います。

1. Claude アプリの **Settings → Connectors → Add custom connector**。
2. 入力:
   - **Name**: `Second Brain`（任意）
   - **URL**: エンドポイントの末尾に `?token=<MCP_SECRET_TOKEN>` を付けた URL
     ```
     https://<あなたのVercel URL>/api/mcp?token=ここにMCP_SECRET_TOKEN
     ```
3. 保存して接続。ツール一覧に `add_memo` など 10 個が出れば成功。

### 認証方式について
このサーバーは次の 2 通りでトークンを受け付けます（どちらか一致すればOK）:
- `Authorization: Bearer <TOKEN>` ヘッダ … Claude Code / API / デスクトップ設定ファイル向け
- `?token=<TOKEN>`（`?key=` も可）クエリ … Claude アプリのコネクタ UI 向け

> 🔐 URL にトークンを含めるのはアプリUIの制約による回避策です。URL 自体が秘密になるので
> 共有しないでください。漏れたら Vercel の `MCP_SECRET_TOKEN` を新しい値に変えて再デプロイすれば無効化できます。

#### 参考: Claude Code から繋ぐ場合（ヘッダ方式）
```bash
claude mcp add second-brain --transport http \
  --header "Authorization: Bearer <MCP_SECRET_TOKEN>" \
  https://<あなたのVercel URL>/api/mcp
```

接続できたらチャットでそのまま使えます。例:
- 「`add_memo` でこれメモして: 〇〇」→ 保存され、関連候補が返るのでリンクするか相談
- 「`list_tasks` で今やるべきタスク見せて」
- 「`export_all` で markdown 形式で全部出して」

---

## ローカル開発

```bash
npm install
echo "DATABASE_URL=...\nMCP_SECRET_TOKEN=local-dev-token" > .env.local
npm run migrate     # 初回のみ
npm run dev         # http://localhost:3000  (MCP: /api/mcp)
```

MCP の疎通確認（別ターミナル）:

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer local-dev-token" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## メンテナンス / 拡張
- スキーマを変えるときは `drizzle/` に `0002_*.sql` を追加し、同じ要領で適用（マイグレーションは冪等に書く）。
- バックアップは `export_all('json')` の結果を保存すれば全データを退避できます。

## コスト
- Neon 無料枠（ストレージ・コンピュート時間に上限あり、個人メモ用途なら十分）
- Vercel Hobby 無料枠
- サーバー側で AI API を呼ばないので **追加課金なし**。

---

## 日常運用：チャットの保存方法

「今後のチャットを全端末で**自動**保存」は Claude アプリ側に仕組みが無いため不可。代わりに次の2通り。

### 1. 手動保存（全端末で有効・推奨）
どの端末でも、チャットの最後に **「これを第二の脳に保存して」** と言えば、Claude が要約 → `add_memo` → 関連リンクまで実行する。コネクタはアカウント単位なのでどの端末でも使える。

### 2. Claude Code の自動保存（このMac限定／SessionEnd hook）
Claude Code のセッション終了時に、会話の軽量ダイジェスト（秘密情報は自動マスク）を自動で `add_memo` する。要約のために別 Claude を呼ぶと再帰するため、ここでは清書せずダイジェストを保存し、後でチャットで「直近の cc メモを整理して」と頼めば清書・リンクできる。

セットアップ:
```bash
mkdir -p ~/.claude/hooks
cp hooks/second-brain-save.mjs ~/.claude/hooks/
cp hooks/second-brain.env.example ~/.claude/hooks/second-brain.env   # 中の URL/TOKEN を自分のに
chmod 600 ~/.claude/hooks/second-brain.env
```
`~/.claude/settings.json` に SessionEnd hook を登録:
```json
{
  "hooks": {
    "SessionEnd": [
      { "hooks": [ { "type": "command",
        "command": "/usr/local/bin/node /Users/<you>/.claude/hooks/second-brain-save.mjs" } ] }
    ]
  }
}
```

## 過去ログの取り込み
- **Claude アプリの過去履歴**: 設定 → データのエクスポートで zip を取得し、チャットで渡して「これを取り込んで」と頼む（要約＋関連リンク＋元日付保持）。
- **Claude Code の過去履歴**: `~/.claude/projects/**/*.jsonl` をローカルで要約して取り込み可能。
- 取り込んだメモには出典フッターとマーカー（例 `[import:chatlog-...]`）を付け、重複防止・一括削除に使う。
