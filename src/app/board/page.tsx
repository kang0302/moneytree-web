"use client";

// 방문자 게시판 — 누구나 글을 남기고, 발행자가 답글. 저장: Upstash Redis(/api/board).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type BoardPost = {
  id: string;
  name: string;
  message: string;
  ts: number;
  reply: string | null;
  replyTs: number | null;
};

function fmt(ts: number): string {
  try {
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export default function BoardPage() {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error" | "unavailable">("loading");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  // 발행자 모드
  const [adminKey, setAdminKey] = useState("");
  const [adminOn, setAdminOn] = useState(false);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const k = localStorage.getItem("mt_board_admin_key");
      if (k) { setAdminKey(k); setAdminOn(true); }
    } catch {}
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/board?limit=100", { cache: "no-store" });
      const j = await r.json();
      if (r.status === 503) { setState("unavailable"); return; }
      if (r.ok && j?.ok) { setPosts(j.posts ?? []); setState("ok"); }
      else setState("error");
    } catch { setState("error"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (message.trim().length < 2) { setErr("메시지를 입력해 주세요."); return; }
    setSending(true); setErr("");
    try {
      const r = await fetch("/api/board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, message, company }),
      });
      const j = await r.json();
      if (r.ok && j?.ok) { setMessage(""); setName(""); await load(); }
      else setErr(j?.error || "등록 실패");
    } catch { setErr("네트워크 오류"); }
    finally { setSending(false); }
  }

  async function sendReply(id: string) {
    const reply = (replyDraft[id] ?? "").trim();
    try {
      const r = await fetch("/api/board/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, reply, key: adminKey }),
      });
      const j = await r.json();
      if (r.ok && j?.ok) { setReplyDraft((d) => ({ ...d, [id]: "" })); await load(); }
      else alert(j?.error || "답글 실패");
    } catch { alert("네트워크 오류"); }
  }

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
        <header className="mb-6 flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">VISITOR BOARD</div>
            <h1 className="mt-1 text-[26px] font-extrabold tracking-tight sm:text-[30px]">방문자 게시판</h1>
            <p className="mt-1 text-[13px] text-white/55">Knowvest에 바라는 점·다뤄줬으면 하는 테마·오류 제보 등 자유롭게 남겨주세요. 발행자가 직접 답글을 답니다.</p>
          </div>
          <Link href="/" className="shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/[0.08]">홈</Link>
        </header>

        {/* 글쓰기 */}
        <form onSubmit={submit} className="mb-6 rounded-2xl border border-white/12 bg-white/[0.03] p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름/닉네임 (선택)"
            className="mb-2 w-full max-w-xs rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-[14px] text-white placeholder:text-white/35 outline-none focus:border-emerald-400/60"
          />
          <textarea
            value={message}
            onChange={(e) => { setMessage(e.target.value); if (err) setErr(""); }}
            placeholder="여기에 남겨주세요…"
            className="min-h-[90px] w-full resize-y rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-[14px] leading-relaxed text-white placeholder:text-white/35 outline-none focus:border-emerald-400/60"
          />
          <input type="text" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} className="hidden" aria-hidden="true" />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className={`text-[11.5px] ${err ? "text-rose-300/90" : "text-white/40"}`}>{err || `${message.length}/2000 · 익명 가능`}</span>
            <button type="submit" disabled={sending} className="shrink-0 rounded-xl border border-emerald-400/50 bg-emerald-500/25 px-5 py-2.5 text-[14px] font-semibold text-emerald-50 transition hover:bg-emerald-500/40 disabled:opacity-60">
              {sending ? "등록 중…" : "글 남기기"}
            </button>
          </div>
        </form>

        {/* 목록 */}
        {state === "loading" && <div className="py-16 text-center text-white/40">불러오는 중…</div>}
        {state === "unavailable" && (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5 text-center text-[13.5px] text-amber-100/90">
            게시판 저장소 연결 준비 중입니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}
        {state === "error" && <div className="py-16 text-center text-rose-300/80">불러오지 못했습니다.</div>}
        {state === "ok" && posts.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] py-14 text-center text-[14px] text-white/55">첫 글의 주인공이 되어보세요 ✍️</div>
        )}
        {state === "ok" && posts.length > 0 && (
          <div className="flex flex-col gap-3">
            {posts.map((p) => (
              <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-[12px] text-white/45">
                  <span className="font-semibold text-white/70">{p.name}</span>
                  <span className="text-white/20">·</span>
                  <span>{fmt(p.ts)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-white/85">{p.message}</p>

                {p.reply && (
                  <div className="mt-3 rounded-xl border border-sky-400/25 bg-sky-500/[0.08] p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-sky-200/90">
                      <span>💬 발행자 답글</span>
                      {p.replyTs && <span className="font-normal text-white/40">· {fmt(p.replyTs)}</span>}
                    </div>
                    <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/85">{p.reply}</p>
                  </div>
                )}

                {adminOn && (
                  <div className="mt-3 flex items-start gap-2 border-t border-white/10 pt-3">
                    <textarea
                      value={replyDraft[p.id] ?? p.reply ?? ""}
                      onChange={(e) => setReplyDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                      placeholder="발행자 답글 작성/수정…"
                      className="min-h-[44px] flex-1 resize-y rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-sky-400/60"
                    />
                    <button onClick={() => sendReply(p.id)} className="shrink-0 rounded-lg border border-sky-400/50 bg-sky-500/20 px-3 py-2 text-[12.5px] font-semibold text-sky-100 hover:bg-sky-500/35">
                      답글
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 발행자 모드 토글 */}
        <div className="mt-8 border-t border-white/10 pt-4">
          {adminOn ? (
            <button
              onClick={() => { setAdminOn(false); try { localStorage.removeItem("mt_board_admin_key"); } catch {} }}
              className="text-[12px] text-white/40 hover:text-white/70"
            >
              발행자 모드 끄기
            </button>
          ) : (
            <details>
              <summary className="cursor-pointer list-none text-[12px] text-white/35 hover:text-white/60">· 발행자 로그인</summary>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="password"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  placeholder="관리자 키"
                  className="w-48 rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-sky-400/60"
                />
                <button
                  onClick={() => { if (adminKey) { setAdminOn(true); try { localStorage.setItem("mt_board_admin_key", adminKey); } catch {} } }}
                  className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-[12.5px] text-white/80 hover:bg-white/10"
                >
                  확인
                </button>
              </div>
            </details>
          )}
        </div>
      </div>
    </main>
  );
}
