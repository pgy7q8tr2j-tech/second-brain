import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // 閲覧用パスワード。UI_PASSWORD があればそれ、無ければ MCP_SECRET_TOKEN にフォールバック。
  const password = process.env.UI_PASSWORD || process.env.MCP_SECRET_TOKEN;
  const form = await req.formData();
  const input = String(form.get("password") ?? form.get("token") ?? "");

  if (!password || input !== password) {
    const url = new URL("/login?e=1", req.url);
    return NextResponse.redirect(url, { status: 303 });
  }

  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  res.cookies.set("sb_session", password, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90日
  });
  return res;
}
