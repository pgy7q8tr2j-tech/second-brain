// iOS メールアプリ風の配色 (白基調・絵文字なし)
export const C = {
  bg: "#f2f2f7", // グループ背景 (薄いグレー)
  card: "#ffffff",
  separator: "#e5e5ea",
  text: "#1c1c1e",
  secondary: "#8e8e93",
  accent: "#007aff", // iOS ブルー
  accentSoft: "#e9f1ff",
};

export const FONT =
  "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Segoe UI', Roboto, sans-serif";

// area ごとの色 (グラフ・バッジ用)。area は日本語。
export const AREA_COLORS: Record<string, string> = {
  創作: "#ff9500",
  人間関係: "#ff2d55",
  健康: "#34c759",
  知識: "#5856d6",
  開発: "#007aff",
  投資: "#30b0c7",
  習慣: "#af52de",
  実務: "#a2845e",
  旅行: "#00c7be",
  プロフィール: "#1c1c1e",
  その他: "#8e8e93",
};
export function areaColor(area: string | null): string {
  if (!area) return C.secondary;
  if (AREA_COLORS[area]) return AREA_COLORS[area];
  return "#636366";
}
