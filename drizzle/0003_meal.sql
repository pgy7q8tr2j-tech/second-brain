-- ============================================================
-- Second Brain - meal items schema (Phase 3, health dashboard)
-- 食事の品ごとの構造化データ。既存の「健康」エリアの自由文メモ
-- (memos.area='健康', タイトル【食事記録 YYYY-MM-DD】) はそのまま残し、
-- 別に集計用の構造化データをここに保存する。
-- 何度実行しても安全な冪等マイグレーション (IF NOT EXISTS)。
-- ============================================================

-- ---- meal_items ----------------------------------------------
CREATE TABLE IF NOT EXISTS meal_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  record_date     DATE        NOT NULL, -- 記録日(メモ本文タイトルの日付。作成日とは別)
  meal_slot       TEXT        NOT NULL
                    CHECK (meal_slot IN ('朝', '昼', '夜', '間食', '深夜')),
  item_name       TEXT        NOT NULL,
  kcal_min        NUMERIC,              -- 下限(補助表示)。不明なら NULL
  kcal_max        NUMERIC,              -- 上限(集計の軸)。不明なら NULL
  basis           TEXT        NOT NULL
                    CHECK (basis IN ('ラベル記載', '推測', '未計上', '要確認')),
  note            TEXT,                 -- 元メモからの抜粋・補足(出典URL等)
  source_memo_id  UUID        REFERENCES memos(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meal_items_date_idx        ON meal_items (record_date);
CREATE INDEX IF NOT EXISTS meal_items_source_memo_idx ON meal_items (source_memo_id);

-- ---- app_settings ---------------------------------------------
-- 汎用のキー・バリュー設定。まず「目標赤字(kcal/日)」を入れる。
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO app_settings (key, value)
VALUES ('calorie_deficit_target', '500')
ON CONFLICT (key) DO NOTHING;
