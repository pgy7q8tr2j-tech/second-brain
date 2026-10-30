-- ============================================================
-- Second Brain - 家計簿 (expenses) スキーマ (Phase 4)
-- 「〇〇に△△円使った」をClaudeが記録・分類する用。
-- meal_items / app_settings と同じ設計方針 (UUID主キー, NUMERICは正規化,
-- ジャンルのような「後から編集したいもの」はCHECK制約を付けずTEXTで持つ)。
-- 既存テーブルは変更しない。何度実行しても安全な冪等マイグレーション (IF NOT EXISTS)。
-- ============================================================

-- ---- expenses -------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expense_date        DATE        NOT NULL, -- 支払った日(支払い場所の現地時間で区切った日付。TZ計算はサーバー側では行わない)
  amount              NUMERIC     NOT NULL CHECK (amount > 0), -- 金額(元の通貨)
  currency            TEXT        NOT NULL CHECK (currency IN ('JPY', 'GBP')),
  amount_jpy          NUMERIC,              -- 円換算額。レート未設定時はNULL(「換算なし」)
  fx_rate             NUMERIC,              -- 記録時点に使ったGBP→JPYレート。後から再計算しない
  category_major      TEXT        NOT NULL, -- 大分類。CHECK制約なし(app_settingsの設定値で後から編集できるように)
  category_minor      TEXT,                 -- 小分類(無い大分類はNULLのまま使える)
  memo                TEXT,                 -- 内容メモ(店名・品名など)
  is_business         BOOLEAN     NOT NULL DEFAULT false, -- タトゥー事業の経費か
  payment_method      TEXT,                 -- 支払い方法(任意)
  source_meal_item_id UUID        REFERENCES meal_items(id) ON DELETE SET NULL -- 同時記録した食事記録(任意)
);

CREATE INDEX IF NOT EXISTS expenses_date_idx        ON expenses (expense_date);
CREATE INDEX IF NOT EXISTS expenses_category_idx    ON expenses (category_major);
CREATE INDEX IF NOT EXISTS expenses_business_idx    ON expenses (is_business);
CREATE INDEX IF NOT EXISTS expenses_source_meal_idx ON expenses (source_meal_item_id);

-- updated_at 自動更新 (0001_init.sql で定義した set_updated_at() を再利用)
DROP TRIGGER IF EXISTS expenses_set_updated_at ON expenses;
CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- 初期ジャンル設定 (app_settings に保存。後から set_setting で編集可) ----
INSERT INTO app_settings (key, value) VALUES (
  'expense_categories',
  '{"食費":["外食","食材・自炊","コンビニ・軽食","カフェ・飲み物"],"住居":["家賃","光熱費","通信"],"交通":["電車・バス","長距離移動"],"日用品":["消耗品","衣服","美容"],"創作":["画材","印刷・版画","写真"],"タトゥー":["材料","スタジオ代","広告"],"健康・医療":[],"交際・娯楽":[],"学習":[],"渡英準備":["ビザ・手続き","荷物・送料"],"その他":[]}'
) ON CONFLICT (key) DO NOTHING;

-- gbp_jpy_rate は未設定のまま残す (set_setting('gbp_jpy_rate', '...') で後から設定)
