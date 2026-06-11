import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const token = process.env.MCP_SECRET_TOKEN;
  const form = await req.formData();
  const input = String(form.get("token") ?? "");

  if (!token || input !== token) {
    const url = new URL("/login?e=1", req.url);
    return NextResponse.redirect(url, { status: 303 });
  }

  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  res.cookies.set("sb_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90日
  });
  return res;
}
