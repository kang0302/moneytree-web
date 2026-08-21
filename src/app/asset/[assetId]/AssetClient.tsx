"use client";

// src/app/asset/[assetId]/AssetClient.tsx
// 자산 상세 — (1)프로파일(핵심사업·수익률·밸류) (2)1년 주가 vs SPY·QQQ (3)연결 테마 카드.

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SearchBar from "@/components/SearchBar";

type ThemeRel = { themeId: string; themeName: string; relation: string; score7d?: number | null };
type Related = { assetId: string; name: string; relation: string; direction: "in" | "out"; themeId: string; themeName: string };
type MacroDrv = { name: string; count: number };
type BriefingInfo = { gFinanceUrl?: string | null; coreBiz?: string; ecosystem?: string; driver?: string; sourceTheme?: string };
type Metrics = Partial<Record<"return_1d" | "return_5d" | "return_15d" | "return_1m" | "return_ytd" | "return_1y" | "return_2y" | "return_3y" | "pe_ttm" | "marketCap" | "close", number>> & { returnsAsOf?: string };
type AssetEntry = {
  id: string; name: string; name_en?: string; ticker: string; exchange: string; country: string; asset_type: string;
  themes: ThemeRel[]; relatedAssets?: Related[]; macros?: MacroDrv[]; characters?: MacroDrv[]; businessFields?: MacroDrv[]; info?: BriefingInfo; metrics?: Metrics;
};
type Trend = { id: string; now: number; delta: number; turnUp: boolean; turnDown: boolean };
const TREND_URL = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/barometer_trend/trend.json";
type Perf = { assetId: string; ticker: string; start: string; end: string; dates: string[]; stock: number[]; spy: (number | null)[]; qqq: (number | null)[]; returns: Record<string, { stock: number | null; spy: number | null; qqq: number | null }> };

const IDX_LOCAL = "/data/asset/index.json";
const IDX_REMOTE = "https://raw.githubusercontent.com/kang0302/moneytree-web/main/public/data/asset/index.json";
const perfLocal = (id: string) => `/data/asset_perf/${id}.json`;
const perfRemote = (id: string) => `https://raw.githubusercontent.com/kang0302/moneytree-web/main/public/data/asset_perf/${id}.json`;

const CO = (c: string) => ({ US: "미국", KR: "한국", CN: "중국", HK: "홍콩", JP: "일본", TW: "대만", GB: "영국", DE: "독일", FR: "프랑스", CA: "캐나다", AU: "호주", IN: "인도" } as Record<string, string>)[c] || c;
const REL = (r: string) => ({ THEMED_AS: "1궤도", EXPOSED_TO: "ETF 노출", OPERATES: "사업영위", HAS_TRAIT: "특성" } as Record<string, string>)[r] || r;
// 관계 상대(other asset)의 역할 라벨
function RELA(r: string, dir: "in" | "out") {
  const M: Record<string, [string, string]> = { SUPPLIES: ["고객", "공급처"], INVESTS: ["투자처", "투자자"], PARTNERS: ["파트너", "파트너"], COMPETES: ["경쟁사", "경쟁사"], IN_ETF: ["편입 ETF", "구성종목"], OWNS: ["보유", "피보유"] };
  const pair = M[r]; if (!pair) return r; return dir === "out" ? pair[0] : pair[1];
}
const RELA_GROUPS: { key: string; label: string; color: string }[] = [
  { key: "공급처", label: "🏭 공급처", color: "#a5b4fc" }, { key: "고객", label: "📦 고객", color: "#fca5a5" },
  { key: "경쟁사", label: "⚔️ 경쟁사", color: "#fbbf24" }, { key: "파트너", label: "🤝 파트너", color: "#6ee7b7" },
  { key: "투자자", label: "💰 투자자", color: "#f0abfc" }, { key: "투자처", label: "💸 투자처", color: "#c4b5fd" },
  { key: "편입 ETF", label: "📊 편입 ETF", color: "#7dd3fc" }, { key: "구성종목", label: "🧺 구성종목", color: "#7dd3fc" },
];

function pct(v?: number | null, d = 2) { if (v == null || !Number.isFinite(v)) return "—"; return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`; }
function retColor(v?: number | null) { if (v == null) return "#94a3b8"; return v >= 0 ? "#f87171" : "#60a5fa"; }
function fmtCap(v?: number) { if (v == null || !Number.isFinite(v)) return "—"; if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`; if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`; if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`; return `$${v}`; }

function Bullets({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  const lines = body.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">{title}</div>
      <ul className="ml-1 list-disc space-y-0.5 pl-3.5 text-[12px] leading-relaxed text-white/80">
        {lines.map((l, i) => <li key={i}>{l.replace(/^[-·]\s*/, "")}</li>)}
      </ul>
    </div>
  );
}

function PerfChart({ perf }: { perf: Perf }) {
  const W = 720, H = 260, padL = 6, padR = 6, padT = 14, padB = 4;
  const all = [...perf.stock, ...perf.spy, ...perf.qqq].filter((v): v is number => v != null);
  const min = Math.min(100, ...all), max = Math.max(100, ...all);
  const span = Math.max(1, max - min), n = perf.dates.length;
  const sx = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const sy = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const line = (arr: (number | null)[]) => arr.map((v, i) => (v == null ? null : `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`)).filter(Boolean).join(" ");
  const y100 = sy(100);
  const series: [string, (number | null)[], string][] = [["종목", perf.stock, "#f5f5f5"], ["SPY", perf.spy, "#38bdf8"], ["QQQ", perf.qqq, "#fbbf24"]];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }}>
      <line x1={padL} x2={W - padR} y1={y100} y2={y100} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" strokeWidth={1} />
      <text x={padL + 2} y={y100 - 3} fontSize="9" fill="rgba(255,255,255,0.35)">100 (시작=1년 전)</text>
      {series.map(([, arr, col]) => <polyline key={col} points={line(arr)} fill="none" stroke={col} strokeWidth={1.8} strokeLinejoin="round" />)}
      {series.map(([, arr, col]) => { const last = [...arr].reverse().find((v) => v != null); return last != null ? <circle key={col + "d"} cx={sx(n - 1)} cy={sy(last)} r={2.6} fill={col} /> : null; })}
    </svg>
  );
}

// 관계망 — 공급망 흐름 다이어그램 (공급처·투자자 → 이 종목 → 고객·투자처, 경쟁/파트너/ETF 측면)
function RoleBox({ label, color, items, align = "left" }: { label: string; color: string; items: Related[]; align?: "left" | "right" | "center" }) {
  if (!items.length) return null;
  const CAP = 10;
  const shown = items.slice(0, CAP), extra = items.length - shown.length;
  return (
    <div className="rounded-xl border bg-white/[0.02] p-2.5" style={{ borderColor: color + "44" }}>
      <div className="mb-1.5 text-[11px] font-bold" style={{ color, textAlign: align }}>{label} <span className="font-normal text-white/35">{items.length}</span></div>
      <div className={`flex flex-wrap gap-1 ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : ""}`}>
        {shown.map((r) => (
          <a key={r.assetId} href={`/asset/${r.assetId}`} title={`${r.themeName} 맥락`}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11.5px] text-white/80 transition-all hover:border-white/40 hover:bg-white/[0.09] hover:text-white">{r.name}</a>
        ))}
        {extra > 0 && <span className="rounded-md px-1.5 py-0.5 text-[11px] text-white/40">+{extra}</span>}
      </div>
    </div>
  );
}
function RelationFlow({ centerName, ticker, total, byRole }: { centerName: string; ticker: string; total: number; byRole: (k: string) => Related[] }) {
  const inputs = [{ k: "공급처", c: "#a5b4fc" }, { k: "투자자", c: "#f0abfc" }].filter((x) => byRole(x.k).length);
  const outputs = [{ k: "고객", c: "#fca5a5" }, { k: "투자처", c: "#c4b5fd" }].filter((x) => byRole(x.k).length);
  const lateral = [{ k: "경쟁사", c: "#fbbf24" }, { k: "파트너", c: "#6ee7b7" }, { k: "편입 ETF", c: "#7dd3fc" }, { k: "구성종목", c: "#7dd3fc" }].filter((x) => byRole(x.k).length);
  const Arrow = () => <div className="hidden items-center justify-center text-white/25 lg:flex"><span className="text-lg">→</span></div>;
  return (
    <div>
      <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[minmax(0,1fr)_24px_minmax(200px,auto)_24px_minmax(0,1fr)]">
        <div className="space-y-2">
          {inputs.length ? inputs.map((x) => <RoleBox key={x.k} label={x.k} color={x.c} items={byRole(x.k)} align="right" />) : <div className="text-center text-[11px] text-white/25">— 공급/투자 유입 없음 —</div>}
        </div>
        <Arrow />
        <div className="rounded-2xl border-2 border-white/35 bg-gradient-to-br from-white/[0.1] to-white/[0.02] px-5 py-4 text-center shadow-[0_0_34px_rgba(255,255,255,0.07)]">
          <div className="text-[15px] font-extrabold leading-tight text-white">{centerName}</div>
          {ticker && <div className="mt-0.5 text-[10.5px] font-mono text-white/50">{ticker}</div>}
          <div className="mt-1 text-[9.5px] uppercase tracking-wider text-white/35">관계 {total}</div>
        </div>
        <Arrow />
        <div className="space-y-2">
          {outputs.length ? outputs.map((x) => <RoleBox key={x.k} label={x.k} color={x.c} items={byRole(x.k)} align="left" />) : <div className="text-center text-[11px] text-white/25">— 고객/투자 유출 없음 —</div>}
        </div>
      </div>
      {lateral.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {lateral.map((x) => <RoleBox key={x.k} label={x.k} color={x.c} items={byRole(x.k)} align="center" />)}
        </div>
      )}
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-white/40">
        <span>← 공급처·투자자 (유입)</span><span>이 종목</span><span>고객·투자처 (유출) →</span>
      </div>
    </div>
  );
}

export default function AssetClient({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [entry, setEntry] = useState<AssetEntry | null>(null);
  const [perf, setPerf] = useState<Perf | null>(null);
  const [trend, setTrend] = useState<Record<string, Trend>>({});
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`${TREND_URL}?_cb=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        const map: Record<string, Trend> = {};
        for (const t of j.themes ?? []) map[t.id] = { id: t.id, now: t.now, delta: t.delta, turnUp: t.turnUp, turnDown: t.turnDown };
        if (!cancel) setTrend(map);
      } catch { /* 국면 데이터 없으면 생략 */ }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        let res = await fetch(IDX_LOCAL, { cache: "no-store" }).catch(() => null);
        if (!res || !res.ok) res = await fetch(IDX_REMOTE, { cache: "no-store" });
        const idx = (await res!.json()) as Record<string, AssetEntry>;
        if (cancel) return;
        const e = idx[assetId] || null;
        setEntry(e); setState(e ? "ok" : "notfound");
      } catch { if (!cancel) setState("notfound"); }
    })();
    return () => { cancel = true; };
  }, [assetId]);

  useEffect(() => {
    let cancel = false;
    setPerf(null);
    (async () => {
      try {
        let res = await fetch(perfLocal(assetId), { cache: "no-store" }).catch(() => null);
        if (!res || !res.ok) res = await fetch(perfRemote(assetId), { cache: "no-store" }).catch(() => null);
        if (res && res.ok) { const p = await res.json(); if (!cancel) setPerf(p); }
      } catch { /* 성과 데이터 없으면 차트 생략 */ }
    })();
    return () => { cancel = true; };
  }, [assetId]);

  const themes = useMemo(() => (entry?.themes ?? []).slice().sort((a, b) => (b.score7d ?? -999) - (a.score7d ?? -999)), [entry]);
  const m = entry?.metrics;
  const RET_ROWS: [string, keyof Metrics][] = [["1일", "return_1d"], ["5일", "return_5d"], ["1개월", "return_1m"], ["YTD", "return_ytd"], ["1년", "return_1y"], ["3년", "return_3y"]];

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-5">
        {/* 헤더 */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <a href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">← 홈으로</a>
          <div className="min-w-[220px] flex-1">
            <SearchBar indexUrl="/data/search/search_index.json"
              onGoTheme={(tid) => router.push(`/graph/${tid}`)}
              onGoThemeFocus={(tid, fid) => router.push(`/graph/${tid}?focus=${encodeURIComponent(fid)}`)}
              onGoAsset={(aid) => router.push(`/asset/${aid}`)} />
          </div>
        </div>

        {state === "loading" && <div className="text-white/50">불러오는 중…</div>}
        {state === "notfound" && <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-[13px] text-white/60">자산을 찾을 수 없습니다: {assetId}</div>}

        {state === "ok" && entry && (
          <>
            {/* 타이틀 */}
            <div className="mb-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <h1 className="text-2xl font-bold text-white/95">{entry.name}</h1>
                {entry.name_en && <span className="text-[13px] text-white/45">{entry.name_en}</span>}
              </div>
              <div className="mt-0.5 text-[12.5px] text-white/55">
                {entry.ticker && <b className="text-white/75">{entry.ticker}</b>} · {entry.exchange} · {CO(entry.country)} · {entry.asset_type}
                {entry.info?.gFinanceUrl && <> · <a href={entry.info.gFinanceUrl} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">프로파일 ↗</a></>}
              </div>
            </div>

            {/* ① 프로파일 */}
            <section className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
              <div className="rounded-xl border border-white/12 bg-white/[0.03] p-4">
                <h2 className="mb-2.5 text-sm font-semibold text-white/85">종목 프로파일</h2>
                {entry.info ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Bullets title="핵심 사업" body={entry.info.coreBiz} />
                    <Bullets title="사업 생태계" body={entry.info.ecosystem} />
                    <Bullets title="주가 동인" body={entry.info.driver} />
                  </div>
                ) : <div className="text-[12.5px] text-white/45">브리핑 프로파일 미연결.</div>}
                {entry.info?.sourceTheme && <div className="mt-2.5 text-[10.5px] text-white/35">출처: {entry.info.sourceTheme} 브리핑</div>}
              </div>
              <div className="rounded-xl border border-white/12 bg-white/[0.03] p-4">
                <h2 className="mb-2.5 text-sm font-semibold text-white/85">수익률 · 밸류</h2>
                {m ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {RET_ROWS.map(([lbl, k]) => { const v = m[k] as number | undefined; return (
                        <div key={lbl} className="rounded-lg border border-white/8 bg-white/[0.02] px-2 py-1.5 text-center">
                          <div className="text-[9.5px] text-white/40">{lbl}</div>
                          <div className="text-[13px] font-bold tabular-nums" style={{ color: retColor(v) }}>{pct(v, 1)}</div>
                        </div>
                      ); })}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/60">
                      <span>PER <b className="text-white/85">{m.pe_ttm != null ? m.pe_ttm.toFixed(1) : "—"}</b></span>
                      <span>시총 <b className="text-white/85">{fmtCap(m.marketCap)}</b></span>
                      <span>종가 <b className="text-white/85">{m.close != null ? m.close.toLocaleString() : "—"}</b></span>
                      {m.returnsAsOf && <span className="text-white/35">기준 {m.returnsAsOf}</span>}
                    </div>
                  </>
                ) : <div className="text-[12.5px] text-white/45">수익률 데이터 없음.</div>}
              </div>
            </section>

            {/* 특성 · 사업영역 (Character / Business Field) */}
            {((entry.characters?.length ?? 0) > 0 || (entry.businessFields?.length ?? 0) > 0) && (
              <section className="mb-5 rounded-xl border border-white/12 bg-white/[0.03] p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {entry.characters && entry.characters.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold text-emerald-300/85">🧬 특성 (Character)</div>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.characters.map((c) => (
                          <span key={c.name} className="rounded-full border border-emerald-400/25 bg-emerald-500/[0.08] px-2.5 py-0.5 text-[11.5px] text-emerald-100/90">{c.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {entry.businessFields && entry.businessFields.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold text-sky-300/85">🏗️ 사업영역 (Business Field)</div>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.businessFields.map((b) => (
                          <span key={b.name} className="rounded-full border border-sky-400/25 bg-sky-500/[0.08] px-2.5 py-0.5 text-[11.5px] text-sky-100/90">{b.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Knowvest 렌즈 ① 이 종목을 흔드는 매크로 동인 */}
            {entry.macros && entry.macros.length > 0 && (() => {
              const maxc = Math.max(...entry.macros.map((x) => x.count));
              return (
                <section className="mb-5 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.05] p-4">
                  <h2 className="mb-1 text-sm font-semibold text-fuchsia-200/85">🎯 이 종목을 흔드는 매크로 동인</h2>
                  <p className="mb-2.5 text-[10.5px] text-white/45">이 종목이 속한 테마들을 움직이는 매크로를 빈도순으로 집계 — 무엇이 주가를 흔드는가.</p>
                  <div className="flex flex-wrap gap-2">
                    {entry.macros.map((mc) => (
                      <div key={mc.name} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                        <span className="text-[12px] font-semibold text-white/85">{mc.name}</span>
                        <span className="relative block h-1.5 w-12 rounded bg-white/10"><span className="absolute top-0 h-1.5 rounded bg-fuchsia-400/70" style={{ width: `${Math.round(mc.count / maxc * 100)}%` }} /></span>
                        <span className="text-[10px] tabular-nums text-white/45">{mc.count}</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* ② 1년 주가 vs SPY·QQQ */}
            <section className="mb-5 rounded-xl border border-white/12 bg-white/[0.03] p-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white/85">최근 1년 주가 추이 <span className="text-white/40">vs SPY · QQQ</span></h2>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm" style={{ background: "#f5f5f5" }} />종목</span>
                  <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm" style={{ background: "#38bdf8" }} />SPY</span>
                  <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm" style={{ background: "#fbbf24" }} />QQQ</span>
                </div>
              </div>
              {perf ? (
                <>
                  <p className="mb-1 text-[10.5px] text-white/40">1년 전 = 100 으로 환산한 상대 추이 (환율 미조정). {perf.start} ~ {perf.end}</p>
                  <PerfChart perf={perf} />
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full border-collapse text-[12px] whitespace-nowrap">
                      <thead><tr className="text-white/60"><th className="px-2 py-1 text-left">기간</th><th className="px-2 py-1 text-right">종목</th><th className="px-2 py-1 text-right">SPY</th><th className="px-2 py-1 text-right">QQQ</th><th className="px-2 py-1 text-right">vs SPY</th></tr></thead>
                      <tbody>
                        {["1M", "3M", "6M", "1Y"].map((k) => { const r = perf.returns[k]; const ex = r.stock != null && r.spy != null ? r.stock - r.spy : null; return (
                          <tr key={k} className="border-t border-white/5">
                            <td className="px-2 py-1 text-white/70">{k}</td>
                            <td className="px-2 py-1 text-right font-semibold tabular-nums" style={{ color: retColor(r.stock) }}>{pct(r.stock)}</td>
                            <td className="px-2 py-1 text-right tabular-nums" style={{ color: retColor(r.spy) }}>{pct(r.spy)}</td>
                            <td className="px-2 py-1 text-right tabular-nums" style={{ color: retColor(r.qqq) }}>{pct(r.qqq)}</td>
                            <td className="px-2 py-1 text-right font-semibold tabular-nums" style={{ color: retColor(ex) }}>{pct(ex)}</td>
                          </tr>); })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : <div className="py-8 text-center text-[12.5px] text-white/40">주가 성과 데이터가 없습니다(상장 이력 부족 등).</div>}
            </section>

            {/* Knowvest 렌즈 ② 관계망 (공급망 흐름) */}
            {entry.relatedAssets && entry.relatedAssets.length > 0 && (() => {
              const byRoleMap = new Map<string, Related[]>();
              for (const r of entry.relatedAssets!) { const role = RELA(r.relation, r.direction); if (!byRoleMap.has(role)) byRoleMap.set(role, []); byRoleMap.get(role)!.push(r); }
              const byRole = (k: string) => { const seen = new Set<string>(); return (byRoleMap.get(k) || []).filter((r) => { if (seen.has(r.assetId)) return false; seen.add(r.assetId); return true; }); };
              const groups = RELA_GROUPS.filter((g) => byRoleMap.has(g.key));
              return (
                <section className="mb-5">
                  <h2 className="mb-1 text-sm font-semibold text-white/85">관계망 · 공급망 흐름 <span className="text-white/40">{entry.relatedAssets!.length}</span></h2>
                  <p className="mb-2.5 text-[10.5px] text-white/45">온톨로지가 연결한 <b className="text-white/60">공급처·고객·경쟁사·파트너·투자 관계</b> — 시세엔 안 보이는 구조적 흐름. 노드를 클릭하면 이동합니다.</p>
                  <div className="rounded-xl border border-white/12 bg-gradient-to-b from-white/[0.04] to-transparent p-3.5">
                    <RelationFlow centerName={entry.name} ticker={entry.ticker} total={entry.relatedAssets!.length} byRole={byRole} />
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer select-none text-[11.5px] text-white/45 hover:text-white/75">전체 목록 펼치기 ▾</summary>
                    <div className="mt-2 space-y-2.5">
                      {groups.map((g) => (
                        <div key={g.key}>
                          <div className="mb-1 text-[11px] font-semibold" style={{ color: g.color }}>{g.label} <span className="text-white/35">{byRole(g.key).length}</span></div>
                          <div className="flex flex-wrap gap-1.5">
                            {byRole(g.key).map((r) => (
                              <a key={r.assetId} href={`/asset/${r.assetId}`} title={`${r.themeName} 맥락`}
                                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[12px] text-white/80 transition-all hover:border-white/35 hover:bg-white/[0.07] hover:text-white">{r.name}</a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </section>
              );
            })()}

            {/* Knowvest 렌즈 ③ 소속 테마 · 국면 */}
            <section className="mb-6">
              <h2 className="mb-1 text-sm font-semibold text-white/85">소속 테마 · 국면 <span className="text-white/40">{themes.length}</span></h2>
              <p className="mb-2 text-[10.5px] text-white/45">이 종목이 걸려 있는 테마가 지금 <b className="text-rose-300/80">상승 국면</b>인지 <b className="text-sky-300/80">하락 국면</b>인지 — 바로미터 점수와 최근 추세로 확인.</p>
              {themes.length ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {themes.map((t) => {
                    const tr = trend[t.themeId];
                    return (
                      <a key={t.themeId + t.relation} href={`/graph/${t.themeId}`}
                        className="group rounded-xl border border-white/12 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-3 transition-all hover:border-white/35 hover:bg-white/[0.06]">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-semibold text-white/90 group-hover:text-white">{t.themeName}</span>
                          <span className="shrink-0 rounded border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[9.5px] text-white/50">{REL(t.relation)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          {tr ? (
                            <span className="flex items-center gap-1.5">
                              <span className="text-white/45">바로미터</span>
                              <b className="tabular-nums" style={{ color: tr.now >= 500 ? "#f87171" : "#60a5fa" }}>{tr.now}</b>
                              <span className="tabular-nums" style={{ color: retColor(tr.delta) }}>{tr.delta >= 0 ? "▲" : "▼"}{Math.abs(tr.delta)}</span>
                              {tr.turnUp && <span className="rounded bg-rose-500/20 px-1 py-0.5 text-[9px] font-bold text-rose-200">상승전환</span>}
                              {tr.turnDown && <span className="rounded bg-sky-500/20 px-1 py-0.5 text-[9px] font-bold text-sky-200">하락전환</span>}
                            </span>
                          ) : <span className="text-white/30">{t.themeId}</span>}
                          <span className="font-semibold tabular-nums text-white/50" title="테마 7D EW 수익률">7D {pct(t.score7d, 1)}</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : <div className="text-[12.5px] text-white/45">연결된 테마가 없습니다.</div>}
            </section>

          </>
        )}
      </div>
    </main>
  );
}
