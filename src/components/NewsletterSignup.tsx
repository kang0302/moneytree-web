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

        {status === "done" ? (
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-[13px] font-medium text-emerald-100 sm:max-w-[320px]">
            <span>✅</span>
            <span>{msg}</span>
          </div>
        ) : (
          <form onSubmit={submit} className="flex shrink-0 flex-col gap-2 sm:w-[380px]">
            <div className="flex gap-2">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") setStatus("idle");
                }}
                placeholder="이메일 주소"
                aria-label="이메일 주소"
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-[14px] text-white placeholder:text-white/35 outline-none transition focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/25"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="shrink-0 rounded-xl border border-indigo-400/50 bg-indigo-500/25 px-4 py-2.5 text-[14px] font-semibold text-indigo-50 transition hover:border-indigo-300/70 hover:bg-indigo-500/40 disabled:opacity-60"
              >
                {status === "loading" ? "신청 중…" : "구독 신청"}
              </button>
            </div>
            {/* 허니팟: 사람에겐 보이지 않음 */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="hidden"
              aria-hidden="true"
            />
            {status === "error" ? (
              <div className="text-[12px] text-rose-300/90">{msg}</div>
            ) : (
              <div className="text-[11px] text-white/40">
                구독 신청 시 개인정보는 뉴스레터 발송 목적으로만 사용됩니다.
              </div>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
