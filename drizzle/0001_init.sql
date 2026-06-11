-- ============================================================
-- Second Brain - initial schema
-- 何度実行しても安全な冪等マイグレーション (IF NOT EXISTS)
-- ============================================================

-- 日本語にも効く部分一致/類似度検索のためにトライグラム拡張を有効化
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- UUID 生成用
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- memos --------------------------------------------------
CREATE TABLE IF NOT EXISTS memos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  content     TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'memo'
                CHECK (kind IN ('memo', 'task', 'asset', 'decision')),
  area        TEXT,
  priority    TEXT CHECK (priority IN ('P0', 'P1', 'P2')),
  status      TEXT CHECK (status IN ('open', 'done')),
  due_date    DATE
);

-- ---- links --------------------------------------------------
CREATE TABLE IF NOT EXISTS links (
  from_id     UUID NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  to_id       UUID NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_id, to_id)
);

-- ---- indexes ------------------------------------------------
-- 部分一致 / similarity() 用のトライグラム GIN インデックス
CREATE INDEX IF NOT EXISTS memos_content_trgm_idx
  ON memos USING gin (content gin_trgm_ops);

-- 'simple' 構成の全文検索インデックス (英数字・記号区切りに有効)
CREATE INDEX IF NOT EXISTS memos_content_fts_idx
  ON memos USING gin (to_tsvector('simple', content));

-- 絞り込み用
CREATE INDEX IF NOT EXISTS memos_kind_idx   ON memos (kind);
CREATE INDEX IF NOT EXISTS memos_area_idx   ON memos (area);
CREATE INDEX IF NOT EXISTS memos_status_idx ON memos (status);
CREATE INDEX IF NOT EXISTS links_to_idx     ON links (to_id);

-- ---- updated_at 自動更新トリガ ------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memos_set_updated_at ON memos;
CREATE TRIGGER memos_set_updated_at
  BEFORE UPDATE ON memos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
