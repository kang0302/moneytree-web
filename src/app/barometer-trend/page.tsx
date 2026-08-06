"use client";

// 바로미터 국면전환 — 최신 스냅샷의 다중 호라이즌 점수로 "최근 온도 vs 기준 기간 온도"의 밴드 이동을 포착.
// 최종 밴드 = 최근(3D) 바로미터. 전환 = 선택 기준(1주=7D / 2주=15D / 1개월=1M) 호라이즌 대비 밴드 변화.
// 데이터: import_MT/data/barometer/{최신일}.json (매일 갱신, rows[].scores = 호라이즌별 바로미터 점수).

import React, { useEffect, useMemo, useState } from "react";
import { TEMP_BANDS, bandOf } from "@/lib/marketTemp";

const BASE = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/barometer";

type Scores = Record<string, number | null>;
type SnapRow = { themeId: string; themeName: string; ok?: boolean; scores?: Scores };
type Snap = { date: string; generated?: string; themeCount?: number; rows: SnapRow[] };

// 기준(baseline) 기간 = 호라이즌. 최종은 항상 3D(최근).
const PERIODS = [
  { key: "1w", label: "1주", horizon: "7D" },
  { key: "2w", label: "2주", horizon: "15D" },
  { key: "1m", label: "1개월", horizon: "1M" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];
const FINAL_H = "3D"; // 최근(최종 밴드) 호라이즌
const SPARK_H = ["1D", "3D", "7D", "15D", "1M"]; // 온도 term-structure(단기→장기)

const bandIdx = (key: string) => TEMP_BANDS.findIndex((b) => b.key === key);
const bandUpperScore = (k: number) => (k === 0 ? 1000 : TEMP_BANDS[k - 1].min);

type Row = {
  id: string; name: string; finalScore: number; baseScore: number; delta: number;
  fromKey: string; toKey: string; steps: number; spark: number[];
};

function enrich(r: SnapRow, baseHorizon: string): Row | null {
  const sc = r.scores || {};
  const f = sc[FINAL_H];
  const b = sc[baseHorizon];
  if (f == null || b == null) return null;
  const fromKey = bandOf(b)?.key ?? "neutral"; // 기준 기간(과거 관점) 밴드
  const toKey = bandOf(f)?.key ?? "neutral";   // 최근 밴드
  const steps = bandIdx(fromKey) - bandIdx(toKey); // >0 = 최근이 더 뜨거움(승격)
  const spark = SPARK_H.map((h) => (typeof sc[h] === "number" ? (sc[h] as number) : null)).filter((x): x is number => x != null);
  return { id: r.themeId, name: r.themeName, finalScore: f, baseScore: b, delta: f - b, fromKey, toKey, steps, spark };
}

function BandChip({ k, dim }: { k: string; dim?: boolean }) {
  const b = TEMP_BANDS.find((x) => x.key === k);
  if (!b) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold"
      style={{ background: `${b.color}${dim ? "22" : "33"}`, color: "#fff", border: `1px solid ${b.color}${dim ? "44" : "88"}` }}>
      <span>{b.emoji}</span>{b.label}
    </span>
  );
}

// 밴드 색 구간을 배경에 깐 온도 term-structure 스파크라인(왼쪽=단기, 오른쪽=장기).
function BandSpark({ series, up }: { series: number[]; up: boolean }) {
  const W = 150, H = 44, pad = 2;
  const s = series && series.length ? series : [500];
  const dmin = Math.min(...s), dmax = Math.max(...s);
  const min = dmin, max = Math.max(dmax, dmin + 1);
  const span = Math.max(1, max - min);
  const yOf = (v: number) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const pts = s.map((v, i) => `${(pad + (i / (s.length - 1 || 1)) * (W - 2 * pad)).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const zones = TEMP_BANDS.map((b, k) => {
    const hi = Math.min(bandUpperScore(k), max);
    const lo = Math.max(b.min, min);
    if (hi <= lo) return null;
    return { y: yOf(hi), h: Math.max(0.5, yOf(lo) - yOf(hi)), color: b.color };
  }).filter(Boolean) as { y: number; h: number; color: string }[];
  const line = up ? "#fb7185" : "#38bdf8";
  return (
    <svg width={W} height={H} className="shrink-0 rounded" style={{ background: "rgba(255,255,255,0.02)" }}>
      {zones.map((z, i) => <rect key={i} x={0} y={z.y} width={W} height={z.h} fill={z.color} fillOpacity={0.16} />)}
      {TEMP_BANDS.map((b, k) => (k === 0 ? null : b.min > min && b.min < max ? (
        <line key={b.key} x1={0} x2={W} y1={yOf(b.min)} y2={yOf(b.min)} stroke="rgba(255,255,255,0.14)" strokeWidth={0.6} />
      ) : null))}
      <polyline points={pts} fill="none" stroke={line} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      {/* 최근(맨 왼쪽=1D) 강조 점 */}
      <circle cx={pad} cy={yOf(s[0])} r={2.2} fill={line} />
    </svg>
  );
}

function Card({ t, baseLabel }: { t: Row; baseLabel: string }) {
  const up = t.steps > 0 || (t.steps === 0 && t.delta >= 0);
  const border = up ? "border-rose-400/20 hover:border-rose-300/60 hover:shadow-[0_0_0_1px_rgba(251,113,133,0.35)]" : "border-sky-400/20 hover:border-sky-300/60 hover:shadow-[0_0_0_1px_rgba(56,189,248,0.35)]";
  const bg = up ? "from-rose-500/[0.06]" : "from-sky-500/[0.06]";
  const nowCol = TEMP_BANDS.find((b) => b.key === t.toKey)?.color ?? "#fff";
  const stepLabel = t.steps !== 0 ? `${t.steps > 0 ? "⬆" : "⬇"} ${Math.abs(t.steps)}단계` : (t.delta >= 0 ? "▲ 밴드유지" : "▼ 밴드유지");
  return (
    <a href={`/graph/${t.id}`} target="_blank" rel="noreferrer"
      className={`group block rounded-xl border ${border} bg-gradient-to-br ${bg} to-white/[0.02] p-3 transition-all`}>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="truncate text-[13px] font-bold text-white/90 group-hover:text-white">{t.name}</span>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-white"
          style={{ background: up ? "rgba(239,68,68,0.35)" : "rgba(59,130,246,0.35)" }}>{stepLabel}</span>
      </div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <BandChip k={t.fromKey} dim />
        <span className="text-white/35">→</span>
        <BandChip k={t.toKey} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[19px] font-bold tabular-nums leading-none" style={{ color: nowCol }}>{t.finalScore}</div>
          <div className="mt-0.5 text-[10px] text-white/40 tabular-nums">
            <span className="text-white/30">{baseLabel}</span> {t.baseScore} → <span className="text-white/30">최근</span> {t.finalScore}{" "}
            <span style={{ color: t.delta >= 0 ? "#f87171" : "#60a5fa" }}>({t.delta >= 0 ? "+" : ""}{t.delta})</span>
          </div>
        </div>
        <BandSpark series={t.spark} up={up} />
      </div>
    </a>
  );
}

export default function BarometerTrendPage() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [period, setPeriod] = useState<PeriodKey>("1m");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const ri = await fetch(`${BASE}/index.json?_cb=${Date.now()}`, { cache: "no-store" });
        if (!ri.ok) throw new Error();
        const idx = (await ri.json()) as { date: string }[];
        const latest = idx?.[0]?.date;
        if (!latest) throw new Error();
        const rs = await fetch(`${BASE}/${latest}.json?_cb=${Date.now()}`, { cache: "no-store" });
        if (!rs.ok) throw new Error();
        const j = (await rs.json()) as Snap;
        if (!cancel) { setSnap(j); setState("ok"); }
      } catch { if (!cancel) setState("error"); }
    })();
    return () => { cancel = true; };
  }, []);

  const periodDef = PERIODS.find((p) => p.key === period)!;
  const CAP = 36;

  const groups = useMemo(() => {
    const rows = (snap?.rows ?? []).map((r) => enrich(r, periodDef.horizon)).filter((x): x is Row => x != null);
    const up = rows.filter((r) => r.steps > 0).sort((a, b) => b.steps - a.steps || b.delta - a.delta);
    const down = rows.filter((r) => r.steps < 0).sort((a, b) => a.steps - b.steps || a.delta - b.delta);
    const risingHold = rows.filter((r) => r.steps === 0 && r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 9);
    const fallingHold = rows.filter((r) => r.steps === 0 && r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 9);
    return { up, down, risingHold, fallingHold };
  }, [snap, periodDef.horizon]);

  const Section = ({ title, sub, list, accent, cap }: { title: string; sub: string; list: Row[]; accent: string; cap?: number }) => {
    const shown = cap ? list.slice(0, cap) : list;
    return (
      <section className="mb-6">
        <h2 className="mb-1 text-sm font-semibold" style={{ color: accent }}>
          {title} <span className="text-white/35">{list.length}</span>
          {cap && list.length > cap ? <span className="ml-1 text-[10.5px] font-normal text-white/30">· 상위 {cap} 표시</span> : null}
        </h2>
        <p className="mb-2 text-[11px] text-white/45">{sub}</p>
        {shown.length === 0 ? <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[12px] text-white/40">해당 테마 없음.</div>
          : <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">{shown.map((t) => <Card key={t.id} t={t} baseLabel={periodDef.label} />)}</div>}
      </section>
    );
  };

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">← 홈으로</a>
            <h1 className="text-lg font-semibold text-white/90">🌡️ 바로미터 국면전환</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-white/40">기준 기간</span>
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition ${period === p.key ? "bg-indigo-500/30 text-indigo-100 border border-indigo-400/50" : "text-white/50 hover:text-white/80"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mb-3 text-[12.5px] leading-relaxed text-white/55">
          각 테마의 <b className="text-white/80">최근 온도(3거래일 기준 바로미터)</b>가 <b className="text-white/80">기준 기간({periodDef.label}) 온도</b>보다 몇 단계 뜨겁거나 식었는지로 국면 전환을 포착합니다.
          최근이 더 <b className="text-rose-300/90">뜨거우면 승격(가열)</b>, 더 <b className="text-sky-300/90">차가우면 강등(냉각)</b>. 스파크라인은 단기→장기 온도(왼쪽=최근).
        </p>

        {/* 산출 공식·방법 — 상단 고정 */}
        <div className="mb-3 rounded-xl border border-white/12 bg-white/[0.035] px-4 py-3 text-[11.5px] leading-relaxed text-white/60">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[12px] font-semibold text-white/80">📐 산출 공식·방법</span>
            {snap?.date && <span className="text-[10.5px] text-white/40">스냅샷 {snap.date} · 테마 {snap.themeCount ?? snap.rows.length}개{snap.generated ? ` · 갱신 ${snap.generated.slice(0, 10)}` : ""}</span>}
          </div>
          <ul className="ml-1 space-y-0.5">
            <li>· <b className="text-white/75">온도 단계</b> = 바로미터 점수를 6밴드로 구분 (Blazing≥850 · Hot≥700 · Warm≥550 · Neutral≥420 · Cool≥280 · Cold&lt;280).</li>
            <li>· <b className="text-white/75">최종 밴드</b> = <b className="text-amber-200/90">최근 3거래일(3D) 바로미터</b>로 판정.</li>
            <li>· <b className="text-white/75">전환</b> = <b className="text-indigo-200/90">기준 기간({periodDef.label} = {periodDef.horizon}) 바로미터</b> 밴드 대비 단계 변화. 최근이 더 뜨거우면 승격/식으면 강등. Δ = 최근(3D) − {periodDef.label}.</li>
            <li>· 같은 날짜의 단기·장기 호라이즌 바로미터를 비교하므로 <b className="text-white/70">최신 스냅샷 하나로 즉시 산출</b>(항상 최신). 탐지·경보이며 미래를 보장하지 않습니다(투자 자문 아님).</li>
          </ul>
        </div>

        {/* 온도 밴드 범례 */}
        {state === "ok" && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span className="text-white/40">온도 단계:</span>
            {TEMP_BANDS.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                style={{ background: `${b.color}22`, border: `1px solid ${b.color}66`, color: "#fff" }}>
                {b.emoji} {b.label} <span className="text-white/40">≥{b.min}</span>
              </span>
            ))}
          </div>
        )}

        {state === "loading" && <div className="text-white/50">불러오는 중…</div>}
        {state === "error" && <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-[12.5px] text-white/55">스냅샷을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</div>}

        {state === "ok" && snap && (
          <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-rose-400/15 bg-rose-500/[0.03] p-3">
              <Section title="🔥 밴드 승격 (온도 단계 ↑)" sub={`최근(3D) 온도가 ${periodDef.label} 기준보다 뜨거운 테마 — 큰 폭(여러 단계) 순. 가열 신호.`} list={groups.up} accent="#fca5a5" cap={CAP} />
              <Section title="📈 같은 밴드 내 가열중" sub="단계 이동은 없지만 최근 점수가 기준보다 높은 테마(전환 임박 후보)." list={groups.risingHold} accent="#fca5a5" />
            </div>
            <div className="rounded-2xl border border-sky-400/15 bg-sky-500/[0.03] p-3">
              <Section title="🧊 밴드 강등 (온도 단계 ↓)" sub={`최근(3D) 온도가 ${periodDef.label} 기준보다 식은 테마 — 큰 폭 순. 냉각 신호.`} list={groups.down} accent="#93c5fd" cap={CAP} />
              <Section title="📉 같은 밴드 내 냉각중" sub="단계는 유지하나 최근 점수가 기준보다 낮은 테마." list={groups.fallingHold} accent="#93c5fd" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
