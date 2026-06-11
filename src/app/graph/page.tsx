import Link from "next/link";
import { C } from "../theme";
import GraphClient from "./GraphClient";

export const dynamic = "force-dynamic";

export default function GraphPage() {
  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: C.card,
          borderBottom: `1px solid ${C.separator}`,
        }}
      >
        <Link href="/" style={{ color: C.accent, textDecoration: "none", fontSize: 16 }}>
          ← メモ一覧
        </Link>
        <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>グラフ表示</span>
        <span style={{ width: 64 }} />
      </div>
      <div style={{ flex: 1, position: "relative", background: C.card }}>
        <GraphClient />
      </div>
    </main>
  );
}
