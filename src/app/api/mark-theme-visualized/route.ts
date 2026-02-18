// src/app/api/mark-theme-visualized/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const themeId = (searchParams.get("themeId") ?? "").trim();

  // 지금은 서버에 저장하지 않고 "성공 응답"만 반환 (404 제거 목적)
  return NextResponse.json({
    ok: true,
    themeId,
    at: new Date().toISOString(),
  });
}
