// src/app/api/board/route.ts
// 방문자 게시판 — 목록 조회(GET) / 글 작성(POST). 저장: Upstash Redis.
//   board:ids   = zset(score=ts, member=id)  — 정렬/페이지네이션
//   board:item:{id} = JSON string { id, name, message, ts, reply, replyTs }
import { NextResponse } from "next/server";
import { redis, redisReady } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDS_KEY = "board:ids";
const itemKey = (id: string) => `board:item:${id}`;

export type BoardPost = {
  id: string;
  name: string;
  message: string;
  ts: number;
  reply: string | null;
  replyTs: number | null;
};

export async function GET(req: Request) {
  if (!redisReady || !redis) {
    return NextResponse.json({ ok: false, error: "게시판 저장소가 아직 연결되지 않았습니다.", posts: [] }, { status: 503 });
  }
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  try {
    // 최신순
    const ids = (await redis.zrange<string[]>(IDS_KEY, 0, limit - 1, { rev: true })) ?? [];
    if (!ids.length) return NextResponse.json({ ok: true, posts: [] });
    const raw = await redis.mget<(BoardPost | null)[]>(...ids.map(itemKey));
    const posts = (raw ?? []).filter(Boolean) as BoardPost[];
    return NextResponse.json({ ok: true, posts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "조회 실패", posts: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!redisReady || !redis) {
    return NextResponse.json({ ok: false, error: "게시판 저장소가 아직 연결되지 않았습니다." }, { status: 503 });
  }
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  // 허니팟
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return NextResponse.json({ ok: true });
  }
  const message = String(body.message ?? "").trim();
  if (message.length < 2) {
    return NextResponse.json({ ok: false, error: "메시지를 입력해 주세요." }, { status: 422 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ ok: false, error: "메시지가 너무 깁니다(최대 2000자)." }, { status: 422 });
  }
  const name = (String(body.name ?? "").trim() || "익명").slice(0, 40);
  const ts = Date.now();
  const id = `${ts}-${Math.random().toString(36).slice(2, 8)}`;
  const post: BoardPost = { id, name, message, ts, reply: null, replyTs: null };

  try {
    await redis.set(itemKey(id), post);
    await redis.zadd(IDS_KEY, { score: ts, member: id });
    return NextResponse.json({ ok: true, post });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "저장 실패" }, { status: 500 });
  }
}
