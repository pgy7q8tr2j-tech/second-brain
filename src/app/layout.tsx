import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { C, FONT } from "./theme";

export const metadata: Metadata = {
  title: "Second Brain",
  description: "Personal second-brain MCP server",
};

// ブラウザ標準のピンチズームを無効化し、グラフ側のピンチ/回転を優先させる
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body
        style={{
          fontFamily: FONT,
          margin: 0,
          background: C.bg,
          color: C.text,
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {children}
      </body>
    </html>
  );
}
