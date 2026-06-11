#!/usr/bin/env node
// Claude Code SessionEnd hook:
//   セッション終了時に、その会話の軽量ダイジェストを「第二の脳」MCPサーバーへ
//   自動保存する。要約のために別の claude を呼ぶと再帰の危険があるため、
//   ここでは要約せず「ユーザー発話中心のダイジェスト」を保存する。
//   後で第二の脳側のチャットで「直近のメモを整理して」と言えば清書・リンクできる。
//
// 設定ファイル: ~/.claude/hooks/second-brain.env
//   SECOND_BRAIN_URL=https://<your-app>/api/mcp
//   SECOND_BRAIN_TOKEN=<MCP_SECRET_TOKEN>
//
// 失敗してもセッションを妨げないよう、常に exit 0。

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";

const done = (msg) => { if (msg) process.stderr.write(`[second-brain] ${msg}\n`); process.exit(0); };

try {
  // ---- config ----
  const envPath = join(homedir(), ".claude", "hooks", "second-brain.env");
  if (!existsSync(envPath)) done("no config (second-brain.env)");
  const cfg = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) cfg[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const URL = cfg.SECOND_BRAIN_URL, TOKEN = cfg.SECOND_BRAIN_TOKEN;
  if (!URL || !TOKEN) done("config missing URL/TOKEN");

  // ---- read hook stdin ----
  const raw = readFileSync(0, "utf8");
  const payload = raw ? JSON.parse(raw) : {};
  const transcript = payload.transcript_path;
  const cwd = payload.cwd || "";
  const sessionId = payload.session_id || "";
  if (!transcript || !existsSync(transcript)) done("no transcript");

  // ---- extract digest ----
  const lines = readFileSync(transcript, "utf8").split("\n").filter(Boolean);
  const users = [];
  let turns = 0, firstT = null, lastT = null;
  for (const ln of lines) {
    let o; try { o = JSON.parse(ln); } catch { continue; }
    if (o.timestamp) { if (!firstT) firstT = o.timestamp; lastT = o.timestamp; }
    const msg = o.message;
    if (o.type === "assistant") turns++;
    if (o.type === "user" && msg) {
      let c = msg.content, txt = "";
      if (typeof c === "string") txt = c;
      else if (Array.isArray(c)) txt = c.filter((p) => p && p.type === "text").map((p) => p.text).join("\n");
      txt = (txt || "").trim();
      if (txt && !txt.startsWith("<") && !txt.startsWith("Caveat:") && !txt.startsWith("[Image")) {
        users.push(txt.replace(/\s+/g, " ").slice(0, 200));
      }
    }
  }
  if (users.length < 2) done("session too small, skipped");

  // ---- redact secrets ----
  const redact = (s) => s
    .replace(/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]+/g, "[REDACTED_KEY]")
    .replace(/\bghp_[A-Za-z0-9]+/g, "[REDACTED_GH]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+/g, "[REDACTED_GH]")
    .replace(/\bvcp_[A-Za-z0-9]+/g, "[REDACTED_VERCEL]")
    .replace(/\bnpg_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DB_URL]")
    .replace(/\bBearer\s+[A-Za-z0-9._\-]+/g, "Bearer [REDACTED]")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]+/g, "[REDACTED]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS]");

  const project = basename(cwd) || "unknown";
  const date = (firstT || new Date().toISOString()).slice(0, 10);
  const bullets = users.slice(0, 18).map((u) => "・" + redact(u)).join("\n");
  let content =
    `【Claude Code自動保存】プロジェクト: ${project} / ${date} / 往復${turns}回\n` +
    `主なユーザー発話:\n${bullets}\n\n---\n` +
    `出典: Claude Codeセッション ${sessionId.slice(0, 8)} / ${date} [auto:cc]`;
  if (content.length > 2500) content = content.slice(0, 2500) + " …";

  // ---- POST to MCP add_memo ----
  const body = {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "add_memo", arguments: { content, kind: "memo", area: "cc:" + project } },
  };
  const res = await fetch(URL + (URL.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(TOKEN), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
               Authorization: "Bearer " + TOKEN },
    body: JSON.stringify(body),
  });
  done(res.ok ? "saved" : "post failed " + res.status);
} catch (e) {
  done("error: " + (e && e.message));
}
