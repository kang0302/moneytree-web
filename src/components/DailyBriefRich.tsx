"use client";

// 데일리 브리프 리치 렌더러 — 구조화 JSON({date}.json)을 시각적으로 임팩트 있게 렌더.
// 뉴스: 좌측 해석 + 우측 테마 미니 다이어그램(클릭 시 /graph). 애널리스트 리포트 섹션. 각 섹션 키워드 리드인.

import React, { useEffect, useState } from "react";
import Link from "next/link";
import MiniThemeGraph from "@/components/MiniThemeGraph";
import { buildMiniGraph, MiniGraph } from "@/lib/loadThemes";

type Src = { label?: string; url?: string };
type NewsItem = { themeId: string; themeName: string; strength?: string; keywords?: string[]; news: string; meaning: string; source?: Src };
type AnalystItem = { themeId?: string; themeName?: string; firm?: string; rating?: string; title: string; summary: string; keywords?: string[]; source?: Src };
type MacroRow = { axis: string; dir: string; text: string };
export type BriefData = {
  date: string; title?: string; intro?: string;
  macro?: { summary?: string; rows?: MacroRow[] };
  newsKeywords?: string[]; news?: NewsItem[];
  analystKeywords?: string[]; analyst?: AnalystItem[];
};

function dirStyle(dir: string): { bg: string; fg: string } {
  const d = dir || "";
  if (/(강세|상방|RISK[- ]?ON|개선|매수)/i.test(d)) return { bg: "rgba(239,68,68,0.18)", fg: "#fca5a5" };
  if (/(약세|하방|하락|RISK[- ]?OFF|악화)/i.test(d)) return { bg: "rgba(59,130,246,0.18)", fg: "#93c5fd" };
  return { bg: "rgba(255,255,255,0.08)", fg: "#d4d4d8" };
}

function KeywordRow({ label, items, accent }: { label: string; items?: string[]; accent: string }) {
  if (!items || !items.length) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>{label}</span>
      {items.map((k, i) => (
        <span key={i} className="rounded-full border px-2.5 py-1 text-[12px] font-medium"
          style={{ borderColor: `${accent}55`, background: `${accent}14`, color: "#fff" }}>
          #{k}
        </span>
      ))}
    </div>
  );
}

// 테마 JSON을 로드해 미니 다이어그램 그래프를 만든다(로컬→GitHub raw 폴백).
function ThemeMini({ themeId }: { themeId: string }) {
  const [g, setG] = useState<MiniGraph | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty">("loading");
  useEffect(() => {
    let c = false;
    (async () => {
      const tryFetch = async (u: string) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
      let tj = await tryFetch(`/data/theme/${themeId}.json`);
      if (!tj) tj = await tryFetch(`https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/${themeId}.json`);
      if (c) return;
      const mg = tj ? buildMiniGraph(tj) : null;
      setG(mg);
      setState(mg && mg.nodes.length ? "ok" : "empty");
    })();
    return () => { c = true; };
  }, [themeId]);
  return (
    <Link
      href={`/graph/${themeId}`}
      className="group relative block h-[132px] w-full overflow-hidden rounded-xl border border-white/12 bg-[radial-gradient(120%_120%_at_50%_0%,rgba(56,189,248,0.10),transparent)] transition hover:border-sky-400/50"
      title={`${themeId} 테마 그래프 열기`}
    >
      {state === "loading" && <div className="flex h-full items-center justify-center text-[10px] text-white/30">그래프 불러오는 중…</div>}
      {state !== "loading" && <MiniThemeGraph seed={themeId} graph={g} />}
      <span className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/70 opacity-0 transition group-hover:opacity-100">
        {themeId} 열기 →
      </span>
    </Link>
  );
}

const STRENGTH_COLOR = (s?: string) => (s?.includes("★★★") ? "#fca5a5" : s?.includes("★★") ? "#fcd34d" : "#a3a3a3");

export default function DailyBriefRich({ data }: { data: BriefData }) {
  return (
    <div className="min-w-0">
      {/* Title + intro */}
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-white">📰 데일리 브리프 <span className="text-white/40">— {data.date}</span></h1>
        {data.intro && <p className="mt-1 text-[13.5px] text-white/55">{data.intro}</p>}
      </div>

      {/* 매크로 한 판 */}
      {data.macro && (
        <section className="mb-6 overflow-hidden rounded-2xl border border-white/12 bg-white/[0.03]">
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
            <span className="text-[15px]">🌐</span>
            <span className="text-[14px] font-bold text-white/90">매크로 한 판</span>
          </div>
          <div className="divide-y divide-white/5">
            {(data.macro.rows ?? []).map((r, i) => {
              const s = dirStyle(r.dir);
              return (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="w-[104px] shrink-0 text-[12.5px] font-semibold text-white/70">{r.axis}</span>
                  <span className="mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: s.bg, color: s.fg }}>{r.dir}</span>
                  <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-white/75">{r.text}</span>
                </div>
              );
            })}
          </div>
          {data.macro.summary && (
            <div className="border-t border-amber-400/20 bg-amber-500/[0.06] px-4 py-3 text-[13.5px] leading-relaxed text-amber-100/90">
              <b className="text-amber-200">한 줄 요약 —</b> <span className="italic">“{data.macro.summary}”</span>
            </div>
          )}
        </section>
      )}

      {/* 뉴스 → 테마 해석 */}
      {data.news && data.news.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 flex items-center gap-2 text-[16px] font-bold text-white/90">📌 오늘 이 뉴스, 이 테마엔 이런 의미</h2>
          <KeywordRow label="오늘의 키워드" items={data.newsKeywords} accent="#38bdf8" />
          <div className="space-y-3">
            {data.news.map((n, i) => (
              <article key={i} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 transition hover:border-white/20 md:grid-cols-[1fr_300px]">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="shrink-0 tabular-nums text-[13px] font-bold text-white/30">{i + 1}</span>
                    <Link href={`/graph/${n.themeId}`} className="text-[15px] font-bold text-sky-300 hover:text-sky-200 hover:underline">
                      {n.themeName}
                    </Link>
                    <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10.5px] font-semibold text-white/50">{n.themeId}</span>
                    {n.strength && <span className="text-[13px] font-bold" style={{ color: STRENGTH_COLOR(n.strength) }}>{n.strength}</span>}
                  </div>
                  {n.keywords && n.keywords.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {n.keywords.map((k, j) => (
                        <span key={j} className="rounded border border-sky-400/25 bg-sky-500/10 px-1.5 py-0.5 text-[10.5px] text-sky-200/90">#{k}</span>
                      ))}
                    </div>
                  )}
                  <p className="mb-1.5 text-[13.5px] leading-relaxed text-white/85">
                    <b className="text-white/60">뉴스</b> — {n.news}
                    {n.source?.url && (
                      <a href={n.source.url} target="_blank" rel="noreferrer" className="ml-1 text-[11.5px] text-white/35 hover:text-sky-300/80">[{n.source.label || "출처"}]</a>
                    )}
                  </p>
                  <p className="mb-2 rounded-lg border border-amber-400/15 bg-amber-500/[0.05] px-3 py-2 text-[13.5px] leading-relaxed text-amber-50/85">
                    <b className="text-amber-200/90">의미</b> — {n.meaning}
                  </p>
                  <Link href={`/graph/${n.themeId}`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-sky-300/90 hover:text-sky-200">
                    → 테마 그래프에서 수혜/피해 종목 지도 확인
                  </Link>
                </div>
                {/* 우측: 테마 미니 다이어그램 */}
                <div className="min-w-0">
                  <ThemeMini themeId={n.themeId} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 애널리스트 리포트 */}
      {data.analyst && data.analyst.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-1 flex items-center gap-2 text-[16px] font-bold text-white/90">🧑‍💼 오늘의 애널리스트 리포트</h2>
          <KeywordRow label="리포트 키워드" items={data.analystKeywords} accent="#a78bfa" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.analyst.map((a, i) => (
              <div key={i} className="rounded-2xl border border-violet-400/15 bg-violet-500/[0.04] p-3.5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {a.rating && <span className="rounded-md bg-violet-500/25 px-1.5 py-0.5 text-[10.5px] font-bold text-violet-100">{a.rating}</span>}
                  {a.firm && <span className="text-[11.5px] text-white/50">{a.firm}</span>}
                </div>
                <div className="mb-1.5 text-[14px] font-bold text-white/90">{a.title}</div>
                {a.keywords && a.keywords.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {a.keywords.map((k, j) => (
                      <span key={j} className="rounded border border-violet-400/25 bg-violet-500/10 px-1.5 py-0.5 text-[10.5px] text-violet-200/90">#{k}</span>
                    ))}
                  </div>
                )}
                <p className="mb-2 text-[13px] leading-relaxed text-white/75">{a.summary}</p>
                <div className="flex items-center justify-between">
                  {a.themeId ? (
                    <Link href={`/graph/${a.themeId}`} className="text-[12px] font-semibold text-violet-300/90 hover:text-violet-200">→ {a.themeName || a.themeId} 보기</Link>
                  ) : <span />}
                  {a.source?.url && <a href={a.source.url} target="_blank" rel="noreferrer" className="text-[11px] text-white/35 hover:text-violet-300/80">[{a.source.label || "출처"}]</a>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-white/40">
        해석은 편집자 관점의 정보 제공이며 투자 자문이 아닙니다. 각 테마 그래프에서 근거·출처·온도를 직접 확인하세요.
      </p>
    </div>
  );
}
