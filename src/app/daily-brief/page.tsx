"use client";

// 데일리 브리핑 아카이브 — 그동안 발송된 데일리 테마 매핑 브리핑을 날짜별로 조회.
// 데이터: public/data/daily_briefs/index.json + {date}.md (react-markdown 렌더)

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type BriefTheme = { rank: string; id: string; name: string; strength: string; reason: string };
type BriefEntry = { date: string; title: string; themes: BriefTheme[] };

const INDEX_URL = "/data/daily_briefs/index.json";
const mdUrl = (date: string) => `/data/daily_briefs/${date}.md`;

const MD_COMPONENTS = {
  h1: (p: any) => <h1 className="mt-2 mb-3 text-2xl font-extrabold text-white" {...p} />,
  h2: (p: any) => <h2 className="mt-6 mb-2 border-b border-white/10 pb-1 text-lg font-bold text-amber-200/90" {...p} />,
  h3: (p: any) => <h3 className="mt-4 mb-1 text-base font-semibold text-white/90" {...p} />,
  p: (p: any) => <p className="my-2 text-[13.5px] leading-relaxed text-white/75" {...p} />,
  ul: (p: any) => <ul className="my-2 list-disc pl-5 text-[13.5px] text-white/75" {...p} />,
  ol: (p: any) => <ol className="my-2 list-decimal pl-5 text-[13.5px] text-white/75" {...p} />,
  li: (p: any) => <li className="my-0.5" {...p} />,
  a: (p: any) => <a className="text-sky-400 hover:underline" target="_blank" rel="noreferrer" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-white/90" {...p} />,
  hr: () => <hr className="my-5 border-white/10" />,
  blockquote: (p: any) => <blockquote className="my-2 border-l-2 border-white/20 pl-3 text-white/60" {...p} />,
  code: (p: any) => <code className="rounded bg-white/10 px-1 py-0.5 text-[12px] text-amber-100" {...p} />,
  table: (p: any) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full border-collapse text-[12.5px]" {...p} />
    </div>
  ),
  thead: (p: any) => <thead className="bg-white/[0.06]" {...p} />,
  th: (p: any) => <th className="border-b border-white/10 px-2.5 py-1.5 text-left font-semibold text-white/80" {...p} />,
  td: (p: any) => <td className="border-b border-white/5 px-2.5 py-1.5 align-top text-white/70" {...p} />,
};

export default function DailyBriefArchivePage() {
  const [index, setIndex] = useState<BriefEntry[]>([]);
  const [sel, setSel] = useState<string>("");
  const [md, setMd] = useState<string>("");
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${INDEX_URL}?_cb=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) { setState("empty"); return; }
        const j = (await r.json()) as BriefEntry[];
        if (!Array.isArray(j) || !j.length) { setState("empty"); return; }
        setIndex(j);
        setSel(j[0].date);
      } catch {
        setState("error");
      }
    })();
  }, []);

  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const r = await fetch(`${mdUrl(sel)}?_cb=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) { if (!cancelled) setState("error"); return; }
        const text = await r.text();
        if (!cancelled) { setMd(text); setState("ok"); }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [sel]);

  const curIdx = useMemo(() => index.findIndex((e) => e.date === sel), [index, sel]);
  const cur = curIdx >= 0 ? index[curIdx] : undefined;
  const prev = curIdx >= 0 && curIdx < index.length - 1 ? index[curIdx + 1] : undefined; // 더 과거
  const next = curIdx > 0 ? index[curIdx - 1] : undefined; // 더 최근

  return (
    <main className="min-h-screen w-full bg-[#0a0a0b] text-white">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-white/45">Daily Brief Archive</div>
            <h1 className="text-2xl font-extrabold text-white">📰 데일리 테마 매핑 브리핑</h1>
            <div className="mt-1 text-xs text-white/50">그동안 발송된 데일리 브리핑을 날짜별로 조회할 수 있습니다. · 총 {index.length}건</div>
          </div>
          <Link href="/" className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">
            ← 홈으로
          </Link>
        </div>

        {/* prev/next + date dropdown */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            disabled={!next}
            onClick={() => next && setSel(next.date)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/80 enabled:hover:bg-white/10 disabled:opacity-30"
          >
            ← 최신
          </button>
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="h-9 rounded-lg border border-white/15 bg-black/40 px-3 text-sm text-white/85 outline-none"
          >
            {index.map((e) => (
              <option key={e.date} value={e.date}>{e.date}</option>
            ))}
          </select>
          <button
            disabled={!prev}
            onClick={() => prev && setSel(prev.date)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/80 enabled:hover:bg-white/10 disabled:opacity-30"
          >
            과거 →
          </button>
          {cur ? <span className="ml-2 text-xs text-white/40">{cur.date} 브리핑</span> : null}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
          {/* 날짜 리스트 (쌓인 아카이브) */}
          <aside className="hidden lg:block">
            <div className="sticky top-4 max-h-[80vh] overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
              <div className="mb-1 px-2 py-1 text-[11px] uppercase tracking-wider text-white/40">전체 브리핑</div>
              {index.map((e) => (
                <button
                  key={e.date}
                  onClick={() => setSel(e.date)}
                  className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs transition ${
                    e.date === sel ? "bg-amber-300/15 text-amber-200" : "text-white/65 hover:bg-white/5"
                  }`}
                  title={e.themes?.[0]?.name ? `핫: ${e.themes.map((t) => t.name).slice(0, 3).join(", ")}` : e.date}
                >
                  <div className="font-semibold">{e.date}</div>
                  {e.themes?.[0]?.name ? (
                    <div className="truncate text-[10.5px] text-white/40">{e.themes[0].name}</div>
                  ) : null}
                </button>
              ))}
            </div>
          </aside>

          {/* 본문 */}
          <section className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
            {state === "loading" && <div className="text-white/50">불러오는 중…</div>}
            {state === "error" && <div className="text-rose-300/80">브리핑을 불러오지 못했습니다.</div>}
            {state === "empty" && <div className="text-white/60">아직 저장된 데일리 브리핑이 없습니다.</div>}
            {state === "ok" && (
              <article className="min-w-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS as any}>
                  {md}
                </ReactMarkdown>
              </article>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
