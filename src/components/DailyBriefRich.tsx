"use client";

// 데일리 브리프 리치 렌더러 — 구조화 JSON({date}.json)을 시각적으로 렌더.
// 뉴스: 좌측 해석 + 우측 테마 패널(온도 추세·미니 다이어그램·주요 종목, 클릭→/graph). 애널리스트 섹션. 키워드 리드인.

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { TEMP_BANDS, bandOf } from "@/lib/marketTemp";

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

type Mover = { n: string; t: string; r: number | null };
type BarRow = { themeId: string; scores?: Record<string, number | null>; headlineScore?: number | null; movers?: Mover[] };

const BAR_BASE = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/barometer";
const SPARK_H = ["1D", "3D", "5D", "15D", "1M"];
const bandUpper = (k: number) => (k === 0 ? 1000 : TEMP_BANDS[k - 1].min);

function dirStyle(dir: string): { bg: string; fg: string } {
  const d = dir || "";
  if (/(강세|상방|RISK[- ]?ON|개선|매수)/i.test(d)) return { bg: "rgba(239,68,68,0.18)", fg: "#fca5a5" };
  if (/(약세|하방|하락|RISK[- ]?OFF|악화)/i.test(d)) return { bg: "rgba(59,130,246,0.18)", fg: "#93c5fd" };
  return { bg: "rgba(255,255,255,0.08)", fg: "#d4d4d8" };
}
const retColor = (r: number | null | undefined) => (r == null ? "#94a3b8" : r >= 0 ? "#f87171" : "#60a5fa");

function KeywordRow({ label, items, accent }: { label: string; items?: string[]; accent: string }) {
  if (!items || !items.length) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>{label}</span>
      {items.map((k, i) => (
        <span key={i} className="rounded-full border px-2.5 py-1 text-[12px] font-medium" style={{ borderColor: `${accent}55`, background: `${accent}14`, color: "#fff" }}>#{k}</span>
      ))}
    </div>
  );
}

// 온도 term-structure 스파크라인(단기→장기) + 밴드 색 구간.
function TempSpark({ scores }: { scores: Record<string, number | null> }) {
  const vals = SPARK_H.map((h) => scores[h]).filter((v): v is number => typeof v === "number");
  if (vals.length < 2) return null;
  const W = 300, H = 40, pad = 2;
  const min = Math.min(...vals), max = Math.max(Math.max(...vals), min + 1);
  const span = Math.max(1, max - min);
  const yOf = (v: number) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const pts = vals.map((v, i) => `${(pad + (i / (vals.length - 1)) * (W - 2 * pad)).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const rising = vals[vals.length - 1] >= vals[0];
  const line = rising ? "#fb7185" : "#38bdf8";
  const zones = TEMP_BANDS.map((b, k) => {
    const hi = Math.min(bandUpper(k), max), lo = Math.max(b.min, min);
    if (hi <= lo) return null;
    return { y: yOf(hi), h: Math.max(0.5, yOf(lo) - yOf(hi)), c: b.color };
  }).filter(Boolean) as { y: number; h: number; c: string }[];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[38px] w-full rounded" preserveAspectRatio="none" style={{ background: "rgba(255,255,255,0.02)" }}>
      {zones.map((z, i) => <rect key={i} x={0} y={z.y} width={W} height={z.h} fill={z.c} fillOpacity={0.16} />)}
      <polyline points={pts} fill="none" stroke={line} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={W - pad} cy={yOf(vals[vals.length - 1])} r={2.4} fill={line} />
    </svg>
  );
}

// 온도 밴드 전환(최근 3D vs 1주 7D) 계산 — 바로미터 국면전환 카드와 동일 개념.
function bandTransition(bar?: BarRow) {
  const sc = bar?.scores || {};
  const final = typeof sc["3D"] === "number" ? sc["3D"] : null;
  const base = typeof sc["5D"] === "number" ? sc["5D"] : (typeof sc["1M"] === "number" ? sc["1M"] : null);
  if (final == null || base == null) return null;
  const fromKey = bandOf(base)?.key ?? "neutral";
  const toKey = bandOf(final)?.key ?? "neutral";
  const bi = (k: string) => TEMP_BANDS.findIndex((b) => b.key === k);
  return { final, base, delta: final - base, fromKey, toKey, steps: bi(fromKey) - bi(toKey) };
}
function BandChip({ k }: { k: string }) {
  const b = TEMP_BANDS.find((x) => x.key === k);
  if (!b) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[9.5px] font-bold" style={{ background: `${b.color}30`, border: `1px solid ${b.color}77`, color: "#fff" }}>
      {b.emoji}{b.label}
    </span>
  );
}

// 우측 테마 패널(컴팩트) — 종목명 옆 온도 스파크라인 + 밴드 전환 + 점수 + 주요 종목. 전체 클릭 → /graph.
function ThemePanel({ themeId, themeName, bar }: { themeId: string; themeName: string; bar?: BarRow }) {
  const t = bandTransition(bar);
  const scores = bar?.scores;
  const score = t?.final ?? bar?.headlineScore ?? (typeof scores?.["5D"] === "number" ? scores!["5D"] : null);
  const band = score != null ? bandOf(score) : null;
  const nowCol = band?.color ?? "#e5e7eb";
  const up = t ? t.steps > 0 || (t.steps === 0 && t.delta >= 0) : true;
  const stepLabel = t && t.steps !== 0 ? `${t.steps > 0 ? "⬆" : "⬇"} ${Math.abs(t.steps)}단계` : null;
  const movers = (bar?.movers ?? []).slice(0, 5);
  return (
    <Link
      href={`/graph/${themeId}`}
      className="group block rounded-xl border border-white/12 bg-white/[0.02] p-2.5 transition hover:border-sky-400/50 hover:bg-white/[0.04]"
      title={`${themeName} 테마 그래프 열기`}
    >
      {/* 개요: 종목명 + 단계뱃지 / 밴드 전환 / 점수 */}
      <div className="mb-2 border-b border-white/8 pb-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate text-[12px] font-bold text-white/85 group-hover:text-white">{themeName}</span>
          {stepLabel && <span className="shrink-0 rounded px-1 py-0.5 text-[9.5px] font-bold text-white" style={{ background: up ? "rgba(239,68,68,0.35)" : "rgba(59,130,246,0.35)" }}>{stepLabel}</span>}
        </div>
        <div className="flex items-end justify-between gap-2">
          {t ? (
            <div className="flex items-center gap-1">
              <BandChip k={t.fromKey} /><span className="text-[10px] text-white/30">→</span><BandChip k={t.toKey} />
            </div>
          ) : band ? <BandChip k={band.key} /> : <span />}
          <div className="text-[22px] font-bold leading-none tabular-nums" style={{ color: nowCol }}>{score ?? "—"}</div>
        </div>
        {t && <div className="mt-1 text-right text-[10px] tabular-nums text-white/40">1주 {t.base} → 최근 {t.final} <span style={{ color: t.delta >= 0 ? "#f87171" : "#60a5fa" }}>({t.delta >= 0 ? "+" : ""}{t.delta})</span></div>}
      </div>

      {/* 온도 추세 — 별도 섹션(개요와 분리) */}
      {scores && (
        <div className="mb-2 overflow-hidden rounded-lg border border-white/8 bg-white/[0.015] px-2 pb-1.5 pt-1">
          <div className="mb-0.5 flex items-center justify-between text-[9px] text-white/30"><span>온도 추세</span><span>단기 → 장기</span></div>
          <div className="h-[34px] w-full overflow-hidden"><TempSpark scores={scores} /></div>
        </div>
      )}

      {/* 주요 종목 */}
      {movers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {movers.map((m, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px]">
              <span className="max-w-[74px] truncate text-white/75">{m.n}</span>
              <span className="tabular-nums font-semibold" style={{ color: retColor(m.r) }}>{m.r == null ? "—" : `${m.r >= 0 ? "+" : ""}${m.r}%`}</span>
            </span>
          ))}
        </div>
      )}
      <div className="mt-1.5 text-right text-[10px] text-white/30 group-hover:text-sky-300/80">테마 그래프 열기 →</div>
    </Link>
  );
}

const STRENGTH_COLOR = (s?: string) => (s?.includes("★★★") ? "#fca5a5" : s?.includes("★★") ? "#fcd34d" : "#a3a3a3");

export default function DailyBriefRich({ data }: { data: BriefData }) {
  const [barMap, setBarMap] = useState<Map<string, BarRow>>(new Map());
  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const ri = await fetch(`${BAR_BASE}/index.json?_cb=${Date.now()}`, { cache: "no-store" });
        if (!ri.ok) return;
        const idx = (await ri.json()) as { date: string }[];
        const latest = idx?.[0]?.date;
        if (!latest) return;
        const rs = await fetch(`${BAR_BASE}/${latest}.json?_cb=${Date.now()}`, { cache: "no-store" });
        if (!rs.ok) return;
        const snap = (await rs.json()) as { rows: BarRow[] };
        if (c) return;
        setBarMap(new Map((snap.rows ?? []).map((r) => [r.themeId, r])));
      } catch { /* 온도/종목 없이도 렌더 */ }
    })();
    return () => { c = true; };
  }, []);

  return (
    <div className="min-w-0">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-white">📰 데일리 브리프 <span className="text-white/40">— {data.date}</span></h1>
        {data.intro && <p className="mt-1 text-[13.5px] text-white/55">{data.intro}</p>}
      </div>

      {/* 매크로 한 판 */}
      {data.macro && (
        <section className="mb-6 overflow-hidden rounded-2xl border border-white/12 bg-white/[0.03]">
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
            <span className="text-[15px]">🌐</span><span className="text-[14px] font-bold text-white/90">매크로 한 판</span>
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
            {data.news.map((n, i) => {
              const bar = barMap.get(n.themeId);
              const t = bandTransition(bar);
              const score = t?.final ?? bar?.headlineScore ?? null;
              const band = score != null ? bandOf(score) : null;
              const top = (bar?.movers ?? [])[0];
              return (
              <article
                key={i}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 transition hover:border-white/20"
                style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}
              >
                {/* 좌: 해석 (~7할) */}
                <div className="min-w-0" style={{ flex: "6 1 0%", minWidth: 340 }}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="shrink-0 tabular-nums text-[13px] font-bold text-white/30">{i + 1}</span>
                    <Link href={`/graph/${n.themeId}`} className="text-[15px] font-bold text-sky-300 hover:text-sky-200 hover:underline">{n.themeName}</Link>
                    <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10.5px] font-semibold text-white/50">{n.themeId}</span>
                    {n.strength && <span className="text-[13px] font-bold" style={{ color: STRENGTH_COLOR(n.strength) }}>{n.strength}</span>}
                  </div>
                  {/* 지금 이 테마 — 실시간 온도 상태 */}
                  {(band || top) && (
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-[11.5px]">
                      <span className="text-white/40">지금</span>
                      {band && <span className="font-semibold" style={{ color: band.color }}>{band.emoji} {band.label} {score}</span>}
                      {t && t.steps !== 0 && <span className="text-white/45">{t.steps > 0 ? "▲ 온도 상승" : "▼ 온도 하락"}({Math.abs(t.steps)}단계)</span>}
                      {top && <span className="text-white/50">대표 {top.n} <b className="tabular-nums" style={{ color: retColor(top.r) }}>{top.r == null ? "—" : `${top.r >= 0 ? "+" : ""}${top.r}%`}</b></span>}
                    </div>
                  )}
                  {n.keywords && n.keywords.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {n.keywords.map((k, j) => <span key={j} className="rounded border border-sky-400/25 bg-sky-500/10 px-1.5 py-0.5 text-[10.5px] text-sky-200/90">#{k}</span>)}
                    </div>
                  )}
                  <p className="mb-2 text-[13.5px] leading-relaxed text-white/85">
                    <b className="mr-1 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">뉴스</b>{n.news}
                    {n.source?.url && <a href={n.source.url} target="_blank" rel="noreferrer" className="ml-1 text-[11.5px] text-white/35 hover:text-sky-300/80">[{n.source.label || "출처"}]</a>}
                  </p>
                  <div className="mb-2 rounded-lg border-l-2 border-amber-400/50 bg-amber-500/[0.05] px-3 py-2">
                    <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300/80">이 뉴스의 의미</div>
                    <p className="text-[13.5px] leading-relaxed text-amber-50/85">{n.meaning}</p>
                  </div>
                  <Link href={`/graph/${n.themeId}`} className="inline-flex items-center gap-1 rounded-lg border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[12.5px] font-semibold text-sky-200/90 transition hover:border-sky-300/60 hover:bg-sky-500/20">→ {n.themeName} 그래프에서 수혜/피해 종목 지도 확인</Link>
                </div>
                {/* 우: 테마 패널(컴팩트) (~3할) */}
                <aside className="min-w-0" style={{ flex: "4 1 0%", minWidth: 280 }}>
                  <ThemePanel themeId={n.themeId} themeName={n.themeName} bar={bar} />
                </aside>
              </article>
              );
            })}
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
                    {a.keywords.map((k, j) => <span key={j} className="rounded border border-violet-400/25 bg-violet-500/10 px-1.5 py-0.5 text-[10.5px] text-violet-200/90">#{k}</span>)}
                  </div>
                )}
                <p className="mb-2 text-[13px] leading-relaxed text-white/75">{a.summary}</p>
                <div className="flex items-center justify-between">
                  {a.themeId ? <Link href={`/graph/${a.themeId}`} className="text-[12px] font-semibold text-violet-300/90 hover:text-violet-200">→ {a.themeName || a.themeId} 보기</Link> : <span />}
                  {a.source?.url && <a href={a.source.url} target="_blank" rel="noreferrer" className="text-[11px] text-white/35 hover:text-violet-300/80">[{a.source.label || "출처"}]</a>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-white/40">해석은 편집자 관점의 정보 제공이며 투자 자문이 아닙니다. 각 테마 그래프에서 근거·출처·온도를 직접 확인하세요.</p>
    </div>
  );
}
