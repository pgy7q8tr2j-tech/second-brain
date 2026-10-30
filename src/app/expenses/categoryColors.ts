import type { CategorySettings } from "@/lib/expenses";

// Google Calendar 由来の配色 (expenses.css の --ex-* 変数) を循環で割り当てる。
const PALETTE = [
  "var(--ex-peacock)",
  "var(--ex-tangerine)",
  "var(--ex-sage)",
  "var(--ex-grape)",
  "var(--ex-banana)",
  "var(--ex-blueberry)",
  "var(--ex-flamingo)",
  "var(--ex-basil)",
  "var(--ex-lavender)",
  "var(--ex-tomato)",
  "var(--ex-graphite)",
];

// app_settings.expense_categories の並び順でジャンルに色を固定する。
export function buildCategoryColorMap(categories: CategorySettings): Map<string, string> {
  const majors = Object.keys(categories);
  const map = new Map<string, string>();
  majors.forEach((m, i) => map.set(m, PALETTE[i % PALETTE.length]));
  return map;
}

// 設定に無い大分類(後から追加されたもの等)は名前のハッシュで安定した色を割り当てる。
export function colorFor(major: string, map: Map<string, string>): string {
  const known = map.get(major);
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < major.length; i++) hash = (hash * 31 + major.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
