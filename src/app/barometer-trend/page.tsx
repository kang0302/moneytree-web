"use client";

// 바로미터 국면전환 — 각 테마 바로미터 점수 추세를 온도 단계(Blazing~Cold) 이동으로 포착.
// 500 중립선이 아니라 "몇 단계 뜨거워졌나/식었나"(밴드 승격·강등)를 보여준다.
// 데이터: import_MT/data/barometer_trend/trend.json (px_hist 기반 사전계산, series[N] = 바로미터 점수 시계열).

import React, { useEffect, useMemo, useState } from "react";
import { TEMP_BANDS, bandOf } from "@/lib/marketTemp";

const RAW = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/barometer_trend/trend.json";

type T = { id: string; name: string; now: number; prevK: number; delta: number; slope: number; series: number[]; turnUp: boolean; turnDown: boolean };
type Meta = { generated: string; period: string; days: number; asofStart: string; asofEnd: string; deltaDays: number; themeCount: number; method: string };
type Payload = { meta: Meta; themes: T[] };

// 밴드 인덱스: 0=Blazing(가장 뜨거움) … 5=Cold. 낮을수록 뜨겁다.
const bandIdx = (key: string) => TEMP_BANDS.findIndex((b) => b.key === key);
const bandUpperScore = (k: number) => (k === 0 ? 1000 : TEMP_BANDS[k - 1].min); // 해당 밴드 상단 점수

type Row = T & {
  fromKey: string; toKey: string; steps: number; // steps>0 = 단계 상승(뜨거워짐)
  crossings: number; // 창 내 밴드 경계 통과 횟수
};

function enrich(t: T): Row {
  const s = t.series && t.series.length ? t.series : [t.now];
  const from = bandOf(s[0]);
  const to = bandOf(t.now);
  const fromKey = from?.key ?? "neutral";
  const toKey = to?.key ?? "neutral";
  const steps = bandIdx(fromKey) - bandIdx(toKey); // 인덱스 감소 = 상승
  let crossings = 0;
  for (let i = 1; i < s.length; i++) {
    const a = bandOf(s[i - 1])?.key, b = bandOf(s[i])?.key;
    if (a && b && a !== b) crossings++;
  }
  return { ...t, fromKey, toKey, steps, crossings };
}

function BandChip({ k, dim }: { k: string; dim?: boolean }) {
  const b = TEMP_BANDS.find((x) => x.key === k);
  if (!b) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold"
      style={{ background: `${b.color}${dim ? "22" : "33"}`, color: "#fff", border: `1px solid ${b.color}${dim ? "44" : "88"}` }}
    >
      <span>{b.emoji}</span>{b.label}
    </span>
  );
}

// 밴드 색 구간(zone)을 배경에 깐 스파크라인 — 점수가 어느 온도대를 지나는지 한눈에.
function BandSpark({ series, up }: { series: number[]; up: boolean }) {
  const W = 148, H = 44, pad = 2;
  const s = series && series.length ? series : [500];
  const dmin = Math.min(...s), dmax = Math.max(...s);
  // 스파크 범위를 살짝 넓혀 밴드 경계가 보이게
  const min = dmin, max = Math.max(dmax, dmin + 1);
  const span = Math.max(1, max - min);
  const yOf = (v: number) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const pts = s.map((v, i) => `${(pad + (i / (s.length - 1 || 1)) * (W - 2 * pad)).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const zones = TEMP_BANDS.map((b, k) => {
    const hi = Math.min(bandUpperScore(k), max);
    const lo = Math.max(b.min, min);
    if (hi <= lo) return null;
    const y1 = yOf(hi), y2 = yOf(lo);
    return { y: y1, h: Math.max(0.5, y2 - y1), color: b.color };
  }).filter(Boolean) as { y: number; h: number; color: string }[];
  const line = up ? "#fb7185" : "#38bdf8";
  return (
    <svg width={W} height={H} className="shrink-0 rounded" style={{ background: "rgba(255,255,255,0.02)" }}>
      {zones.map((z, i) => <rect key={i} x={0} y={z.y} width={W} height={z.h} fill={z.color} fillOpacity={0.16} />)}
      {/* 밴드 경계선 */}
      {TEMP_BANDS.map((b, k) => (k === 0 ? null : b.min > min && b.min < max ? (
        <line key={b.key} x1={0} x2={W} y1={yOf(b.min)} y2={yOf(b.min)} stroke="rgba(255,255,255,0.14)" strokeWidth={0.6} />
      ) : null))}
      <polyline points={pts} fill="none" stroke={line} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      {/* 끝점 강조 */}
      {(() => { const lv = s[s.length - 1]; const x = W - pad; const y = yOf(lv); return <circle cx={x} cy={y} r={2.2} fill={line} />; })()}
    </svg>
  );
}

function Card({ t }: { t: Row }) {
  const up = t.steps > 0 || (t.steps === 0 && t.delta >= 0);
  const border = up ? "border-rose-400/20 hover:border-rose-300/60 hover:shadow-[0_0_0_1px_rgba(251,113,133,0.35)]" : "border-sky-400/20 hover:border-sky-300/60 hover:shadow-[0_0_0_1px_rgba(56,189,248,0.35)]";
  const bg = up ? "from-rose-500/[0.06]" : "from-sky-500/[0.06]";
  const nowCol = TEMP_BANDS.find((b) => b.key === t.toKey)?.color ?? "#fff";
  const stepLabel = t.steps !== 0
    ? `${t.steps > 0 ? "⬆" : "⬇"} ${Math.abs(t.steps)}단계`
    : (t.delta >= 0 ? "▲ 밴드유지" : "▼ 밴드유지");
  return (
    <a href={`/graph/${t.id}`} target="_blank" rel="noreferrer"
      className={`group block rounded-xl border ${border} bg-gradient-to-br ${bg} to-white/[0.02] p-3 transition-all`}>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="truncate text-[13px] font-bold text-white/90 group-hover:text-white">{t.name}</span>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-white"
          style={{ background: up ? "rgba(239,68,68,0.35)" : "rgba(59,130,246,0.35)" }}>
          {stepLabel}
        </span>
      </div>
      {/* 밴드 전환: from → to */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <BandChip k={t.fromKey} dim />
        <span className="text-white/35">→</span>
        <BandChip k={t.toKey} />
        {t.crossings > 1 && <span className="ml-auto text-[10px] text-white/35">경계 {t.crossings}회 교차</span>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[19px] font-bold tabular-nums leading-none" style={{ color: nowCol }}>{t.now}</div>
          <div className="mt-0.5 text-[10px] text-white/40 tabular-nums">
            {t.prevK} → {t.now} <span style={{ color: t.delta >= 0 ? "#f87171" : "#60a5fa" }}>({t.delta >= 0 ? "+" : ""}{t.delta})</span>
          </div>
        </div>
        <BandSpark series={t.series} up={up} />
      </div>
    </a>
  );
}

export default function BarometerTrendPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`${RAW}?_cb=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (!cancel) { setData(j); setState("ok"); }
      } catch { if (!cancel) setState("error"); }
    })();
    return () => { cancel = true; };
  }, []);

  const CAP = 36;
  const groups = useMemo(() => {
    const rows = (data?.themes ?? []).map(enrich);
    const up = rows.filter((r) => r.steps > 0).sort((a, b) => b.steps - a.steps || b.delta - a.delta);
    const down = rows.filter((r) => r.steps < 0).sort((a, b) => a.steps - b.steps || a.delta - b.delta);
    const risingHold = rows.filter((r) => r.steps === 0 && r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 9);
    const fallingHold = rows.filter((r) => r.steps === 0 && r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 9);
    return { up, down, risingHold, fallingHold };
  }, [data]);

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
          : <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{shown.map((t) => <Card key={t.id} t={t} />)}</div>}
      </section>
    );
  };

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        <div className="mb-3 flex items-center gap-3">
          <a href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">← 홈으로</a>
          <h1 className="text-lg font-semibold text-white/90">🌡️ 바로미터 국면전환</h1>
        </div>
        <p className="mb-3 text-[12.5px] leading-relaxed text-white/55">
          각 테마 바로미터가 <b className="text-white/80">온도 단계(Blazing → Hot → Warm → Neutral → Cool → Cold)</b>를 몇 칸 오르내렸는지로 국면 전환을 포착합니다.
          단계가 <b className="text-rose-300/90">올라가면 승격(가열)</b>, <b className="text-sky-300/90">내려가면 강등(냉각)</b>. 스파크라인 배경색이 지나온 온도대입니다.
        </p>

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
        {state === "error" && <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-[12.5px] text-white/55">국면전환 데이터 생성 중입니다. 잠시 후 새로고침해 주세요.</div>}

        {state === "ok" && data && (
          <>
            <Section title="🔥 밴드 승격 (온도 단계 ↑)" sub="구간 시작 대비 온도 단계가 오른 테마 — 큰 폭(여러 단계) 순. 국면이 뜨거워지는 신호." list={groups.up} accent="#fca5a5" cap={CAP} />
            <Section title="🧊 밴드 강등 (온도 단계 ↓)" sub="구간 시작 대비 온도 단계가 내린 테마 — 큰 폭 순. 국면이 식는 신호." list={groups.down} accent="#93c5fd" cap={CAP} />
            <Section title="📈 같은 밴드 내 가열중" sub="아직 단계 이동은 없지만 점수가 뚜렷이 오르는 테마(단계 전환 임박 후보)." list={groups.risingHold} accent="#fca5a5" />
            <Section title="📉 같은 밴드 내 냉각중" sub="단계는 유지하나 점수가 뚜렷이 식는 테마." list={groups.fallingHold} accent="#93c5fd" />
          </>
        )}

        {data?.meta && (
          <section className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/45">
            <b className="text-white/60">방법·한계</b><br />
            · 온도 단계 = 바로미터 점수를 6밴드(Blazing≥850 … Cold&lt;280)로 구분. 전환 = 구간 시작({data.meta.asofStart}) 밴드 대비 현재({data.meta.asofEnd}) 밴드 변화.<br />
            · {data.meta.method}<br />
            · 구간 {data.meta.asofStart} ~ {data.meta.asofEnd} ({data.meta.days}거래일) · 테마 {data.meta.themeCount}개 · 갱신 {data.meta.generated?.slice(0, 10)}.<br />
            · 점수는 현 바로미터 산식으로 <b className="text-white/55">과거 시점 데이터를 재계산</b>한 참고치입니다. 추세·전환은 탐지·경보이며 미래를 보장하지 않습니다(투자 자문 아님).
          </section>
        )}
      </div>
    </main>
  );
}
