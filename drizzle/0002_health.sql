-- ============================================================
-- Second Brain - health metrics schema (Phase 1)
-- iPhone ヘルスケアの日次合計を受け取る専用テーブル。
-- 何度実行しても安全な冪等マイグレーション (IF NOT EXISTS)。
--
-- 設計方針:
--  - 健康の数値はメモにせず、ここに保存する (「健康」エリアのメモを汚さない)。
--  - 日付は「送信元のタイムゾーンで区切った YYYY-MM-DD」をそのまま DATE に入れ、
--    どのタイムゾーンで区切ったかを tz 列に残す (渡英後も 1 日の境界がずれない)。
--  - 同じ (date, metric) は「足す」のではなく「置き換える」。
--    ただし保存済みより古い sent_at の送信では更新しない (アプリ側のロジック)。
-- ============================================================

-- ---- health_daily ------------------------------------------
-- 日 × 項目ごとに 1 行。主キー (date, metric) で upsert する。
CREATE TABLE IF NOT EXISTS health_daily (
  date         DATE        NOT NULL,
  metric       TEXT        NOT NULL
                 CHECK (metric IN (
                   'active_energy',   -- アクティブエネルギー (kcal)
                   'basal_energy',    -- 安静時エネルギー   (kcal)
                   'steps',           -- 歩数               (count)
                   'walking_distance',-- 歩行+ランニング距離 (km)
                   'body_mass'        -- 体重               (kg)
                 )),
  value        NUMERIC     NOT NULL,
  unit         TEXT        NOT NULL,
  tz           TEXT        NOT NULL,   -- 送信元タイムゾーン 例: 'Asia/Tokyo'
  sent_at      TIMESTAMPTZ NOT NULL,   -- ショートカットが送信した時刻
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(), -- サーバー受信時刻
  PRIMARY KEY (date, metric)
);

-- 期間検索 (get_health_range) 用。date 昇順で引く。
CREATE INDEX IF NOT EXISTS health_daily_date_idx ON health_daily (date);

-- ---- health_ingest_log -------------------------------------
-- 受信した生の JSON をそのまま保存する。不具合調査用に 14 日分だけ残す
-- (古い行は受信のたびにアプリ側で削除する)。
CREATE TABLE IF NOT EXISTS health_ingest_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload      JSONB       NOT NULL
);

-- 14 日より古い行の掃除を高速にするため received_at に索引。
CREATE INDEX IF NOT EXISTS health_ingest_log_received_idx
  ON health_ingest_log (received_at);
