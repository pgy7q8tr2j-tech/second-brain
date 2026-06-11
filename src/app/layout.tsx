import type { Metadata } from "next";
import type { ReactNode } from "react";
import { C, FONT } from "./theme";

export const metadata: Metadata = {
  title: "Second Brain",
  description: "Personal second-brain MCP server",
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
