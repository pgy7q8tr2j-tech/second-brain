import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Second Brain",
  description: "Personal second-brain MCP server",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Hiragino Sans', sans-serif",
          margin: 0,
          background: "#0b0d12",
          color: "#e6e9ef",
        }}
      >
        {children}
      </body>
    </html>
  );
}
