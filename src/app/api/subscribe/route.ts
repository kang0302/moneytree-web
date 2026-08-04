// src/app/api/subscribe/route.ts
// 뉴스레터 구독 신청 수집.
// 저장은 외부 웹훅(NEWSLETTER_WEBHOOK_URL)으로 전달 — Google Apps Script / Formspree /
// Zapier / Make 등 어떤 것이든 JSON POST를 받으면 됨. 웹훅 미설정 시 서버 로그만 남기고
// 사용자에겐 접수 처리(무음 손실 방지 위해 pending 플래그로 응답에 명시).
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 허니팟(봇 차단): 사람은 비워두는 숨은 필드
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return NextResponse.json({ ok: true }); // 조용히 성공 처리
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "이메일 형식을 확인해 주세요." }, { status: 422 });
  }

  const payload = {
    email,
    source: String(body.source ?? "home").slice(0, 40),
    ts: new Date().toISOString(),
    ua: (req.headers.get("user-agent") ?? "").slice(0, 200),
  };

  const webhook = process.env.NEWSLETTER_WEBHOOK_URL;
  if (!webhook) {
    // 저장소 미연결 — 손실 방지를 위해 로그로 남기고 pending 상태 반환.
    console.warn("[subscribe] NEWSLETTER_WEBHOOK_URL 미설정 — 미저장:", payload.email);
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
    console.error("[subscribe] webhook 전달 실패:", e?.message);
    return NextResponse.json(
      { ok: false, error: "일시적 오류입니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 }
    );
  }
}
