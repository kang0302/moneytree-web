"use client";

// 방문자 소통 공간 — 방문자가 발행자에게 남기는 한마디(의견·제안·문의).
// POST /api/feedback (웹훅 저장). 홈 하단 노출.
import { useState } from "react";

export default function VisitorNote() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState(""); // 허니팟
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    if (message.trim().length < 2) {
      setStatus("error");
      setMsg("메시지를 입력해 주세요.");
      return;
    }
    setStatus("loading");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, message, company }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        setStatus("done");
        setMsg(
          j?.pending
            ? "소중한 의견 감사합니다. 잘 전달되었습니다."
            : "소중한 의견 감사합니다! 발행자에게 전달되었습니다.",
        );
        setMessage("");
        setName("");
      } else {
        setStatus("error");
        setMsg(j?.error || "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setStatus("error");
      setMsg("네트워크 오류입니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.10] via-emerald-500/[0.04] to-transparent px-6 py-5 backdrop-blur">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[15px]">💬</span>
        <span className="text-[12px] font-semibold uppercase tracking-wider text-emerald-200/85">
          Visitor Note
        </span>
      </div>
      <div className="text-[17px] font-bold text-white/95 sm:text-[18px]">발행자에게 한마디</div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-white/60 sm:text-[13px]">
        Knowvest에 바라는 점, 다뤄줬으면 하는 테마, 오류 제보 등 무엇이든 남겨주세요. 발행자가 직접 읽습니다.
      </p>

      {status === "done" ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-[13px] font-medium text-emerald-100">
          <span>✅</span>
          <span>{msg}</span>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름/닉네임 (선택)"
            aria-label="이름 또는 닉네임 (선택)"
            className="w-full max-w-xs rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-[14px] text-white placeholder:text-white/35 outline-none transition focus:border-emerald-400/60"
          />
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            placeholder="여기에 의견을 남겨주세요…"
            aria-label="의견"
            className="min-h-[90px] w-full resize-y rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-[14px] leading-relaxed text-white placeholder:text-white/35 outline-none transition focus:border-emerald-400/60"
          />
          {/* 허니팟 */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="hidden"
            aria-hidden="true"
          />
          <div className="flex items-center justify-between gap-3">
            <span className={`text-[11.5px] ${status === "error" ? "text-rose-300/90" : "text-white/40"}`}>
              {status === "error" ? msg : `${message.length}/2000 · 익명으로 남길 수 있어요`}
            </span>
            <button
              type="submit"
              disabled={status === "loading"}
              className="shrink-0 rounded-xl border border-emerald-400/50 bg-emerald-500/25 px-5 py-2.5 text-[14px] font-semibold text-emerald-50 transition hover:border-emerald-300/70 hover:bg-emerald-500/40 disabled:opacity-60"
            >
              {status === "loading" ? "보내는 중…" : "남기기"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
