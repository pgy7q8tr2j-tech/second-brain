import { C, FONT } from "../theme";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: C.bg,
        fontFamily: FONT,
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
          Second Brain
        </h1>
        <p style={{ color: C.secondary, margin: "0 0 24px", fontSize: 14 }}>
          閲覧用トークンを入力してください
        </p>
        <form
          action="/api/login"
          method="POST"
          style={{
            background: C.card,
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <input
            type="password"
            name="token"
            placeholder="MCP_SECRET_TOKEN"
            autoFocus
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: `1px solid ${C.separator}`,
              borderRadius: 10,
              padding: "12px 14px",
              fontSize: 16,
              color: C.text,
              outline: "none",
            }}
          />
          {e ? (
            <p style={{ color: "#ff3b30", fontSize: 13, margin: "10px 2px 0" }}>
              トークンが違います
            </p>
          ) : null}
          <button
            type="submit"
            style={{
              width: "100%",
              marginTop: 14,
              border: "none",
              borderRadius: 10,
              padding: "12px 14px",
              fontSize: 16,
              fontWeight: 600,
              color: "#fff",
              background: C.accent,
              cursor: "pointer",
            }}
          >
            ログイン
          </button>
        </form>
      </div>
    </main>
  );
}
