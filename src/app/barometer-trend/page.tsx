"use client";

// 바로미터 국면전환 — 최근 거래일간 각 테마 바로미터(1M) 점수 추세로 상승/하락 전환·상승중/하락중 탐지.
// 데이터: import_MT/data/barometer_trend/trend.json (px_hist 기반 사전계산).

import React, { useEffect, useMemo, useState } from "react";

const RAW = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/barometer_trend/trend.json";

type T = { id: string; name: string; now: number; prevK: number; delta: number; slope: number; series: number[]; turnUp: boolean; turnDown: boolean };
type Meta = { generated: string; period: string; days: number; asofStart: string; asofEnd: string; deltaDays: number; themeCount: number; method: string };
type Payload = { meta: Meta; themes: T[] };

function Spark({ series, color }: { series: number[]; color: string }) {
  const W = 132, H = 34, pad = 2;
  const min = Math.min(...series), max = Math.max(...series);
  const span = Math.max(1, max - min);
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (W - 2 * pad);
    const y = pad + (1 - (v - min) / span) * (H - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  // 500 중립선 (범위 내일 때만)
  const y500 = 500 >= min && 500 <= max ? pad + (1 - (500 - min) / span) * (H - 2 * pad) : null;
  return (
    <svg width={W} height={H} className="shrink-0">
      {y500 != null && <line x1={pad} x2={W - pad} y1={y500} y2={y500} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 2" strokeWidth={1} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Card({ t }: { t: T }) {
  const up = t.delta >= 0;
  const col = up ? "#f87171" : "#60a5fa";
  const border = up ? "border-rose-400/20 hover:border-rose-300/60 hover:shadow-[0_0_0_1px_rgba(251,113,133,0.35)]" : "border-sky-400/20 hover:border-sky-300/60 hover:shadow-[0_0_0_1px_rgba(56,189,248,0.35)]";
  const bg = up ? "from-rose-500/[0.06]" : "from-sky-500/[0.06]";
  return (
    <a href={`/graph/${t.id}`} target="_blank" rel="noreferrer"
      className={`group block rounded-xl border ${border} bg-gradient-to-br ${bg} to-white/[0.02] p-3 transition-all`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="truncate text-[13px] font-bold text-white/90 group-hover:text-white">{t.name}</span>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums text-white" style={{ background: up ? "rgba(239,68,68,0.35)" : "rgba(59,130,246,0.35)" }}>{t.delta >= 0 ? "▲+" : "▼"}{t.delta}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[19px] font-bold tabular-nums leading-none" style={{ color: col }}>{t.now}</div>
          <div className="mt-0.5 text-[10px] text-white/40">{t.prevK} → {t.now}</div>
        </div>
        <Spark series={t.series} color={col} />
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

  const groups = useMemo(() => {
    const th = data?.themes ?? [];
    const turnUp = th.filter((t) => t.turnUp).sort((a, b) => b.delta - a.delta);
    const turnDown = th.filter((t) => t.turnDown).sort((a, b) => a.delta - b.delta);
    const rising = th.filter((t) => !t.turnUp && t.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 12);
    const falling = th.filter((t) => !t.turnDown && t.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 12);
    return { turnUp, turnDown, rising, falling };
  }, [data]);

  const Section = ({ title, sub, list, accent }: { title: string; sub: string; list: T[]; accent: string }) => (
    <section className="mb-6">
      <h2 className="mb-1 text-sm font-semibold" style={{ color: accent }}>{title} <span className="text-white/35">{list.length}</span></h2>
      <p className="mb-2 text-[11px] text-white/45">{sub}</p>
      {list.length === 0 ? <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[12px] text-white/40">해당 테마 없음.</div>
        : <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{list.map((t) => <Card key={t.id} t={t} />)}</div>}
    </section>
  );

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        <div className="mb-3 flex items-center gap-3">
          <a href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">← 홈으로</a>
          <h1 className="text-lg font-semibold text-white/90">🌡️ 바로미터 국면전환</h1>
        </div>
        <p className="mb-4 text-[12.5px] leading-relaxed text-white/55">
          최근 거래일간 각 테마의 <b className="text-white/80">바로미터 점수 추세</b>로 <b className="text-rose-300/90">상승 전환·상승중</b>인 테마와 <b className="text-sky-300/90">하락 전환·하락중</b>인 테마를 가려냅니다.
          <b className="text-white/80"> 500(중립선)</b>을 새로 넘거나 이탈한 테마가 <b className="text-white/80">국면 전환</b> 신호입니다.
        </p>

        {state === "loading" && <div className="text-white/50">불러오는 중…</div>}
        {state === "error" && <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-[12.5px] text-white/55">국면전환 데이터 생성 중입니다. 잠시 후 새로고침해 주세요.</div>}

        {state === "ok" && data && (
          <>
            <Section title="🚀 상승 전환 (중립선 상향 돌파)" sub="최근 바로미터가 500을 새로 넘어선 테마 — 국면이 상승으로 바뀌는 신호." list={groups.turnUp} accent="#fca5a5" />
            <Section title="🧊 하락 전환 (중립선 하향 이탈)" sub="최근 바로미터가 500 아래로 내려간 테마 — 국면이 하락으로 바뀌는 신호." list={groups.turnDown} accent="#93c5fd" />
            <Section title="📈 상승중 (점수 상승폭 큰 순)" sub="아직 전환은 아니지만 바로미터가 뚜렷이 오르는 테마." list={groups.rising} accent="#fca5a5" />
            <Section title="📉 하락중 (점수 하락폭 큰 순)" sub="바로미터가 뚜렷이 식고 있는 테마." list={groups.falling} accent="#93c5fd" />
          </>
        )}

        {data?.meta && (
          <section className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/45">
            <b className="text-white/60">방법·한계</b><br />
            · {data.meta.method}<br />
            · 구간 {data.meta.asofStart} ~ {data.meta.asofEnd} ({data.meta.days}거래일) · 테마 {data.meta.themeCount}개 · 갱신 {data.meta.generated?.slice(0, 10)}.<br />
            · 점수는 현 바로미터 산식(v2)으로 <b className="text-white/55">과거 시점 데이터를 재계산</b>한 것으로, 당시 실시간 값과 다를 수 있습니다(참고치).<br />
            · 추세·전환은 <b className="text-white/55">탐지·경보</b>이며 미래를 보장하지 않습니다. 투자 자문이 아닌 정보 제공입니다.
          </section>
        )}
      </div>
    </main>
  );
}
