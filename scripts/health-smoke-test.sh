#!/usr/bin/env bash
# ============================================================
# health ingest エンドポイントのスモークテスト (4 パターン)
#
# 使い方:
#   BASE_URL="https://<あなたの本番ドメイン>" \
#   HEALTH_INGEST_TOKEN="<ステップ3で作ったトークン>" \
#   bash scripts/health-smoke-test.sh
#
# 期待する結果:
#   (a) 正常            → 200 {"ok":true,"upserted":5,"skipped":0}
#   (b) 同じ日を2回送る  → 200 upserted、値は倍にならず置き換え (Neon で確認)
#   (c) 古い sent_at    → 200 だが upserted=0 / skipped=5 (据え置き)
#   (d) トークン間違い   → 401
# ============================================================
set -u

: "${BASE_URL:?BASE_URL を指定してください}"
: "${HEALTH_INGEST_TOKEN:?HEALTH_INGEST_TOKEN を指定してください}"

URL="${BASE_URL%/}/api/health/ingest"
AUTH="Authorization: Bearer ${HEALTH_INGEST_TOKEN}"
CT="Content-Type: application/json"

echo "== (a) 正常 =="
curl -sS -i -X POST "$URL" -H "$AUTH" -H "$CT" -d '{
  "sent_at": "2026-10-08T21:30:00+09:00",
  "tz": "Asia/Tokyo",
  "days": [
    {
      "date": "2026-10-08",
      "active_energy_kcal": 512.3,
      "basal_energy_kcal": 1560,
      "steps": 8123,
      "walking_distance_km": 5.9,
      "body_mass_kg": 72.4
    }
  ]
}'
echo; echo

echo "== (b) 同じ日をもう一度 (新しい sent_at・違う値) → 置き換え =="
curl -sS -i -X POST "$URL" -H "$AUTH" -H "$CT" -d '{
  "sent_at": "2026-10-08T22:00:00+09:00",
  "tz": "Asia/Tokyo",
  "days": [
    {
      "date": "2026-10-08",
      "active_energy_kcal": "600",
      "steps": "9000"
    }
  ]
}'
echo; echo
echo "  → Neon で: SELECT date,metric,value,sent_at FROM health_daily WHERE date='2026-10-08';"
echo "    active_energy が 1112.3 ではなく 600 になっていれば OK (足し算でなく置き換え)。"
echo

echo "== (c) 古い sent_at → 据え置き (upserted=0, skipped=2) =="
curl -sS -i -X POST "$URL" -H "$AUTH" -H "$CT" -d '{
  "sent_at": "2026-10-08T20:00:00+09:00",
  "tz": "Asia/Tokyo",
  "days": [
    {
      "date": "2026-10-08",
      "active_energy_kcal": 999,
      "steps": 1
    }
  ]
}'
echo; echo
echo "  → 値が (b) の 600 / 9000 のまま変わっていなければ OK。"
echo

echo "== (d) トークン間違い → 401 =="
curl -sS -i -X POST "$URL" -H "Authorization: Bearer WRONG-TOKEN" -H "$CT" -d '{
  "sent_at": "2026-10-08T21:30:00+09:00",
  "tz": "Asia/Tokyo",
  "days": [{ "date": "2026-10-08", "steps": 1 }]
}'
echo; echo
