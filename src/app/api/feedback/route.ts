// src/app/api/feedback/route.ts
// 방문자 → 발행자 메시지(소통) 수집. 저장은 외부 웹훅(FEEDBACK_WEBHOOK_URL, 없으면 NEWSLETTER_WEBHOOK_URL)에 위임.
// 웹훅 미설정 시 서버 로그만 남기고 접수 처리(pending). subscribe 라우트와 동일 패턴.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 허니팟(봇 차단)
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const message = String(body.message ?? "").trim();
  if (!message || message.length < 2) {
    return NextResponse.json({ ok: false, error: "메시지를 입력해 주세요." }, { status: 422 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ ok: false, error: "메시지가 너무 깁니다(최대 2000자)." }, { status: 422 });
  }

  const name = String(body.name ?? "").trim().slice(0, 60);
  const contact = String(body.contact ?? "").trim().slice(0, 200); // 선택: 이메일/연락처

  const payload = {
    type: "feedback",
    name: name || "익명",
    contact,
    message,
    ts: new Date().toISOString(),
    ua: (req.headers.get("user-agent") ?? "").slice(0, 200),
  };

  const webhook = process.env.FEEDBACK_WEBHOOK_URL || process.env.NEWSLETTER_WEBHOOK_URL;
  if (!webhook) {
    console.warn("[feedback] 웹훅 미설정 — 미저장:", payload.name, payload.message.slice(0, 40));
    return NextResponse.json({ ok: true, stored: false, pending: true });
  }
  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`webhook ${r.status}`);
    return NextResponse.json({ ok: true, stored: true });
  } catch (e: any) {
    console.error("[feedback] 웹훅 전달 실패:", e?.message);
    return NextResponse.json(
      { ok: false, error: "일시적 오류입니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
