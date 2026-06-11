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

// area ごとの色 (グラフ・バッジ用)
export const AREA_COLORS: Record<string, string> = {
  creative: "#ff9500",
  relationship: "#ff2d55",
  health: "#34c759",
  knowledge: "#5856d6",
  dev: "#007aff",
  investing: "#30b0c7",
  practice: "#af52de",
  practical: "#a2845e",
  travel: "#00c7be",
  profile: "#1c1c1e",
  other: "#8e8e93",
};
export function areaColor(area: string | null): string {
  if (!area) return C.secondary;
  if (AREA_COLORS[area]) return AREA_COLORS[area];
  // cc:project などは固定色
  return "#636366";
}
