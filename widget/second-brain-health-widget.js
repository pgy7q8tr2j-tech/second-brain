// Second Brain - 今日のカロリー (Scriptableウィジェット)
//
// セットアップ:
// 1. App StoreでScriptable(無料)をインストール
// 2. Scriptableを開き、右上「+」で新規スクリプトを作成
// 3. このファイルの中身を全部コピーしてペースト
// 4. 下の TOKEN に、second-brain/.env.local の WIDGET_TOKEN の値を貼り付ける
// 5. ホーム画面を長押し→「+」→Scriptableを検索→中サイズを追加
// 6. 追加したウィジェットを長押し→「ウィジェットを編集」→
//    スクリプト:このスクリプト名 / パラメータ:空のまま / When Interacting: Run Script
//
// タップすると /health が開きます。

const BASE_URL = "https://second-brain-six-ashy.vercel.app";
const TOKEN = "PASTE_YOUR_WIDGET_TOKEN_HERE"; // second-brain/.env.local の WIDGET_TOKEN をここに貼る

async function fetchSummary() {
  const req = new Request(`${BASE_URL}/api/health/today?token=${TOKEN}`);
  req.timeoutInterval = 10;
  const data = await req.loadJSON();
  if (data.error) throw new Error(data.error);
  return data;
}

function formatTime(iso) {
  if (!iso) return "最終受信 —";
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return `最終受信 ${hh}:${mm} JST`;
}

function addStat(row, label, value, colorHex, note) {
  const col = row.addStack();
  col.layoutVertically();
  const l = col.addText(note ? `${label}${note}` : label);
  l.font = Font.systemFont(10);
  l.textColor = Color.gray();
  const v = col.addText(value != null ? `${Math.round(value)}` : "—");
  v.font = Font.boldSystemFont(15);
  v.textColor = new Color(colorHex);
}

function errorWidget(message) {
  const widget = new ListWidget();
  widget.url = `${BASE_URL}/health`;
  widget.backgroundColor = new Color("#8e8e93", 0.12);
  widget.setPadding(14, 14, 14, 14);
  const t = widget.addText(message);
  t.font = Font.systemFont(13);
  t.textColor = Color.gray();
  return widget;
}

async function buildWidget() {
  if (!TOKEN || TOKEN === "PASTE_YOUR_WIDGET_TOKEN_HERE") {
    return errorWidget("TOKENを設定してください");
  }

  let data;
  try {
    data = await fetchSummary();
  } catch {
    return errorWidget("健康データを取得できません");
  }

  const widget = new ListWidget();
  widget.url = `${BASE_URL}/health`;
  widget.setPadding(14, 14, 14, 14);
  widget.backgroundColor = new Color(data.color, 0.14);
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  const title = widget.addText("今日の健康");
  title.font = Font.semiboldSystemFont(11);
  title.textColor = Color.gray();

  widget.addSpacer(6);

  const big = widget.addText(data.big);
  big.font = Font.heavySystemFont(config.widgetFamily === "small" ? 28 : 34);
  big.textColor = new Color(data.color);
  big.minimumScaleFactor = 0.6;

  const sub = widget.addText(data.sub);
  sub.font = Font.systemFont(12);
  sub.textColor = Color.gray();

  if (config.widgetFamily !== "small") {
    widget.addSpacer(10);
    const row = widget.addStack();
    row.layoutHorizontally();
    addStat(row, "消費", data.consumption.total, data.ringColors.consumption, data.consumption.estimated ? "※" : "");
    row.addSpacer(18);
    addStat(row, "摂取", data.intake.totalMax, data.ringColors.intake, data.intake.hasUnknownKcalItem ? "※" : "");
  }

  widget.addSpacer();
  const updated = widget.addText(formatTime(data.lastSentAt));
  updated.font = Font.systemFont(10);
  updated.textColor = Color.gray();

  return widget;
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
