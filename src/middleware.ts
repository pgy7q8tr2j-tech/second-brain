import { NextResponse, type NextRequest } from "next/server";

// 閲覧用UIの簡易保護。
// - MCP エンドポイント(/api/mcp)は独自にトークン認証するので除外。
// - ログイン関連と静的アセットも除外。
// - それ以外のページ/APIは cookie `sb_session` が MCP_SECRET_TOKEN と一致する時のみ許可。
//   一致しなければページは /login にリダイレクト、APIは 401。
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api/mcp") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = process.env.MCP_SECRET_TOKEN;
  const session = req.cookies.get("sb_session")?.value;
  const authed = !!token && session === token;

  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
