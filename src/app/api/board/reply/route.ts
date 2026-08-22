// src/app/api/board/reply/route.ts
// 발행자 답글 — BOARD_ADMIN_KEY 로 보호. 기존 글에 reply 추가/수정.
import { NextResponse } from "next/server";
import { redis, redisReady } from "@/lib/redis";
import type { BoardPost } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemKey = (id: string) => `board:item:${id}`;

export async function POST(req: Request) {
  if (!redisReady || !redis) {
    return NextResponse.json({ ok: false, error: "게시판 저장소가 아직 연결되지 않았습니다." }, { status: 503 });
  }
  const adminKey = process.env.BOARD_ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ ok: false, error: "관리자 키(BOARD_ADMIN_KEY)가 설정되지 않았습니다." }, { status: 503 });
  }
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (String(body.key ?? "") !== adminKey) {
    return NextResponse.json({ ok: false, error: "관리자 키가 올바르지 않습니다." }, { status: 401 });
  }
  const id = String(body.id ?? "").trim();
  const reply = String(body.reply ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "글 ID가 필요합니다." }, { status: 422 });
  if (reply.length > 2000) return NextResponse.json({ ok: false, error: "답글이 너무 깁니다." }, { status: 422 });

  try {
    const post = await redis.get<BoardPost>(itemKey(id));
    if (!post) return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
    post.reply = reply || null;
    post.replyTs = reply ? Date.now() : null;
    await redis.set(itemKey(id), post);
    return NextResponse.json({ ok: true, post });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "저장 실패" }, { status: 500 });
  }
}
