"use client";

// 인사이트 아카이브 — 게시판(목록 + 검색). 발행자가 작성한 글을 카드형으로 나열.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadInsights,
  searchInsights,
  excerpt,
  formatDate,
  type Insight,
} from "@/lib/insights";

export default function InsightsArchivePage() {
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await loadInsights();
      if (!alive) return;
      setItems(list);
      // URL ?tag= 또는 ?q= 로 진입 시 초기 검색어 반영 (await 이후라 effect 동기 setState 아님)
      try {
        const sp = new URLSearchParams(window.location.search);
        const init = sp.get("tag") || sp.get("q");
        if (init) setQ(init);
      } catch {}
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => searchInsights(items, q), [items, q]);
  const allTags = useMemo(() => {
    const c = new Map<string, number>();
    for (const a of items) for (const t of a.tags) c.set(t, (c.get(t) ?? 0) + 1);
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [items]);

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
        {/* 헤더 */}
        <header className="mb-6 flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300/80">
              INSIGHT ARCHIVE
            </div>
            <h1 className="mt-1 text-[26px] font-extrabold tracking-tight sm:text-[32px]">
              인사이트 아카이브
            </h1>
            <p className="mt-1 text-[13px] text-white/55">
              발행자가 기록하는 시장·테마·종목 관점의 아카이브
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/[0.08]"
            >
              홈
            </Link>
            <Link
              href="/insights/new"
              className="rounded-lg border border-sky-400/50 bg-sky-500/15 px-3.5 py-2 text-[13px] font-semibold text-sky-100 transition hover:border-sky-300/70 hover:bg-sky-500/25"
            >
              ✍️ 새 글 작성
            </Link>
          </div>
        </header>

        {/* 검색 */}
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35">
            🔍
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제목·본문·태그 검색…"
            className="w-full rounded-xl border border-white/12 bg-white/[0.04] py-3 pl-10 pr-4 text-[14px] text-white placeholder:text-white/35 outline-none transition focus:border-sky-400/50 focus:bg-white/[0.06]"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-0.5 text-[12px] text-white/45 hover:bg-white/10 hover:text-white/80"
            >
              지우기
            </button>
          )}
        </div>

        {/* 태그 칩 */}
        {allTags.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {allTags.map(([t, n]) => (
              <button
                key={t}
                onClick={() => setQ((cur) => (cur === t ? "" : t))}
                className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
                  q === t
                    ? "border-sky-400/60 bg-sky-500/20 text-sky-100"
                    : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.08]"
                }`}
              >
                #{t} <span className="text-white/35">{n}</span>
              </button>
            ))}
          </div>
        )}

        {/* 목록 */}
        {loading ? (
          <div className="py-20 text-center text-white/40">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] py-16 text-center">
            <div className="text-[15px] text-white/60">
              {q ? "검색 결과가 없습니다." : "아직 게시된 글이 없습니다."}
            </div>
            {!q && (
              <Link
                href="/insights/new"
                className="mt-4 inline-block rounded-lg border border-sky-400/50 bg-sky-500/15 px-4 py-2 text-[13px] font-semibold text-sky-100 hover:bg-sky-500/25"
              >
                첫 글 작성하기
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-[12px] text-white/40">
              {q ? `“${q}” 검색결과 ` : "전체 "}
              <span className="font-semibold text-white/70">{filtered.length}</span>건
            </div>
            {filtered.map((a) => (
              <Link
                key={a.id}
                href={`/insights/${a.id}`}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.06]"
              >
                <div className="flex items-center gap-2 text-[12px] text-white/45">
                  <span>{formatDate(a.publishedAt)}</span>
                  <span className="text-white/20">·</span>
                  <span>{a.author}</span>
                </div>
                <h2 className="mt-1.5 text-[19px] font-bold leading-snug text-white transition group-hover:text-sky-200">
                  {a.title}
                </h2>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">
                  {excerpt(a.body)}
                </p>
                {a.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {a.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[11px] text-white/50"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
