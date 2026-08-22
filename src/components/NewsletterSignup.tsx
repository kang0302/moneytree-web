"use client";

// 뉴스레터 구독 신청 폼 (홈 상단 노출).
// POST /api/subscribe — 이메일 검증·허니팟·상태 표시. 저장은 서버 웹훅에 위임.
import { useState } from "react";

type Status = "idle" | "loading" | "done" | "error";

export default function NewsletterSignup({ source = "home" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // 허니팟
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState<string>("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
      setStatus("error");
      setMsg("이메일 형식을 확인해 주세요.");
      return;
    }
    setStatus("loading");
    setMsg("");
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: v, company, source }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        setStatus("done");
        setMsg(
          j?.pending
            ? "신청이 접수되었습니다. 곧 첫 뉴스레터로 찾아뵙겠습니다."
            : "구독이 완료되었습니다. 매일 아침 인텔리전스 브리핑을 보내드립니다."
        );
        setEmail("");
      } else {
        setStatus("error");
        setMsg(j?.error ?? "일시적 오류입니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setStatus("error");
      setMsg("네트워크 오류입니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-indigo-400/30 bg-gradient-to-br from-indigo-500/[0.12] via-indigo-500/[0.05] to-transparent px-6 py-5 backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[15px]">✉️</span>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-indigo-200/85">
              Daily Newsletter
            </span>
          </div>
          <div className="text-[17px] font-bold text-white/95 sm:text-[18px]">
            매일 아침, 오늘의 테마 인텔리전스를 메일로
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/60 sm:text-[13px]">
            국면전환·핫테마·크로스마켓 시그널을 5분 안에 읽는 브리핑으로. 언제든 1‑클릭 구독 취소.
          </p>
        </div>

        {/* 준비중 — 정식 발행 전 구독 폼 대신 안내 (2026-08-22 사용자 요청) */}
        <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-[13px] font-semibold text-white/70 sm:max-w-[320px]">
          <span>🛠️</span>
          <span>준비중 · Coming Soon</span>
        </div>
      </div>
    </section>
  );
}
