"use client";

// 바로미터 트랙레코드 — 바로미터 점수의 예측력(국면별 forward 성과·보정곡선·롱숏 스프레드) + 오늘의 리더보드.
// 데이터: import_MT/data/track_record/backtest.json (백테스트), import_MT/data/barometer/{latest}.json (스냅샷).

import React, { useEffect, useMemo, useState } from "react";

const RAW = "https://raw.githubusercontent.com/kang0302/import_MT/main/data";
const BACKTEST_URL = `${RAW}/track_record/backtest.json`;
const BARO_INDEX_URL = `${RAW}/barometer/index.json`;

type Agg = { n: number; avgFwd: number | null; winRate: number | null };
type Backtest = {
  generated: string;
  method: { horizon: string; fwdDays: number; weeksBack: number; note: string };
  totalPairs: number;
  buckets: Array<{ range: string } & Agg>;
  byTemp: Record<string, Agg>;
  spread: { high_ge800: Agg; low_lt300: Agg; spreadPct: number | null };
};
type SnapRow = { themeId: string; themeName: string; ok: boolean; headlinePeriod: string; headlineScore: number | null };
type Snap = { date: string; rows: SnapRow[] };

const TEMP_ORDER = ["BLAZING", "HOT", "WARM+", "WARM", "NEUTRAL+", "NEUTRAL", "COOL", "COOL-", "COLD", "FROZEN"];
const TEMP_COLOR: Record<string, string> = {
  BLAZING: "#7a0119", HOT: "#b11226", "WARM+": "#d72638", WARM: "#ef476f", "NEUTRAL+": "#ff9e5e",
  NEUTRAL: "#6b7280", COOL: "#4d96ff", "COOL-": "#3a68c9", COLD: "#1f3c88", FROZEN: "#0a1f5c",
};

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}
function retColor(v: number | null | undefined): string {
  if (v == null) return "#94a3b8";
  return v >= 0 ? "#f87171" : "#60a5fa";
}

export default function TrackRecordPage() {
  const [bt, setBt] = useState<Backtest | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancel = false;
    setState("loading");
    (async () => {
      try {
        const cb = `?_cb=${Date.now()}`;
        const [btRes, idxRes] = await Promise.all([
          fetch(BACKTEST_URL + cb, { cache: "no-store" }).catch(() => null),
          fetch(BARO_INDEX_URL + cb, { cache: "no-store" }).catch(() => null),
        ]);
        if (btRes && btRes.ok) {
          try { if (!cancel) setBt(await btRes.json()); } catch {}
        }
        if (idxRes && idxRes.ok) {
          const idx = (await idxRes.json()) as Array<{ date: string }>;
          const latest = Array.isArray(idx) && idx.length ? idx[0].date : null;
          if (latest) {
            const sRes = await fetch(`${RAW}/barometer/${latest}.json` + cb, { cache: "no-store" }).catch(() => null);
            if (sRes && sRes.ok) { try { if (!cancel) setSnap(await sRes.json()); } catch {} }
          }
        }
        if (!cancel) setState("ok");
      } catch {
        if (!cancel) setState("error");
      }
    })();
    return () => { cancel = true; };
  }, [nonce]);

  const leaders = useMemo(() => {
    if (!snap) return [];
    return snap.rows
      .filter((r) => r.ok && typeof r.headlineScore === "number")
      .sort((a, b) => (b.headlineScore as number) - (a.headlineScore as number))
      .slice(0, 20);
  }, [snap]);

  const maxAbsFwd = useMemo(() => {
    if (!bt) return 1;
    const vals = bt.buckets.map((b) => Math.abs(b.avgFwd ?? 0));
    return Math.max(1, ...vals);
  }, [bt]);

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <a href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">← 홈으로</a>
            <h1 className="text-lg font-semibold text-white/90">📈 바로미터 트랙레코드</h1>
          </div>
          <button onClick={() => setNonce((n) => n + 1)} className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">새로고침</button>
        </div>

        <p className="mb-4 text-[12.5px] leading-relaxed text-white/55">
          테마 <b className="text-white/80">바로미터 점수(0~1000)</b>가 실제로 이후 수익률을 예측하는지 검증합니다. 점수가 높을수록 이후 성과가 좋아야 "예측력 있음"입니다.
        </p>

        {state === "loading" && <div className="text-white/50">불러오는 중…</div>}

        {/* ── 백테스트 요약 ── */}
        {bt ? (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-white/85">① 점수 구간별 이후 {bt.method.fwdDays}일 성과 (보정곡선)</h2>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full border-collapse text-[12.5px] whitespace-nowrap">
                <thead>
                  <tr className="bg-white/[0.05] text-white/80">
                    <th className="px-3 py-1.5 text-left font-semibold">바로미터 점수</th>
                    <th className="px-3 py-1.5 text-right font-semibold">표본</th>
                    <th className="px-3 py-1.5 text-right font-semibold">이후 {bt.method.fwdDays}일 평균수익</th>
                    <th className="px-3 py-1.5 text-left font-semibold" style={{ width: 260 }}></th>
                    <th className="px-3 py-1.5 text-right font-semibold">승률</th>
                  </tr>
                </thead>
                <tbody>
                  {bt.buckets.filter((b) => b.n > 0).map((b) => (
                    <tr key={b.range} className="border-t border-white/5">
                      <td className="px-3 py-1 text-white/80">{b.range}</td>
                      <td className="px-3 py-1 text-right text-white/50">{b.n.toLocaleString()}</td>
                      <td className="px-3 py-1 text-right font-semibold" style={{ color: retColor(b.avgFwd) }}>{pct(b.avgFwd, 2)}</td>
                      <td className="px-3 py-1">
                        <div className="relative h-3 w-full rounded bg-white/[0.04]">
                          <div className="absolute top-0 h-3 rounded" style={{
                            left: (b.avgFwd ?? 0) >= 0 ? "50%" : `${50 - (Math.abs(b.avgFwd ?? 0) / maxAbsFwd) * 50}%`,
                            width: `${(Math.abs(b.avgFwd ?? 0) / maxAbsFwd) * 50}%`,
                            background: retColor(b.avgFwd),
                          }} />
                          <div className="absolute left-1/2 top-0 h-3 w-px bg-white/25" />
                        </div>
                      </td>
                      <td className="px-3 py-1 text-right text-white/70">{b.winRate != null ? `${b.winRate}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="mb-2 mt-5 text-sm font-semibold text-white/85">② 국면(온도)별 이후 {bt.method.fwdDays}일 성과</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {TEMP_ORDER.filter((t) => bt.byTemp[t]?.n).map((t) => {
                const a = bt.byTemp[t];
                return (
                  <div key={t} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TEMP_COLOR[t] }} />
                      <span className="text-[12px] font-semibold text-white/85">{t}</span>
                    </div>
                    <div className="mt-1 text-[15px] font-bold tabular-nums" style={{ color: retColor(a.avgFwd) }}>{pct(a.avgFwd, 2)}</div>
                    <div className="text-[10.5px] text-white/45">승률 {a.winRate}% · n {a.n}</div>
                  </div>
                );
              })}
            </div>

            <h2 className="mb-2 mt-5 text-sm font-semibold text-white/85">③ 상위(≥800) vs 하위(&lt;300) 스프레드</h2>
            <div className="flex flex-wrap items-stretch gap-3">
              <div className="flex-1 rounded-lg border border-rose-400/20 bg-rose-500/[0.06] p-3">
                <div className="text-[11px] text-rose-200/70">상위 바로미터 (≥800)</div>
                <div className="text-[18px] font-bold" style={{ color: retColor(bt.spread.high_ge800.avgFwd) }}>{pct(bt.spread.high_ge800.avgFwd, 2)}</div>
                <div className="text-[10.5px] text-white/45">승률 {bt.spread.high_ge800.winRate}% · n {bt.spread.high_ge800.n}</div>
              </div>
              <div className="flex-1 rounded-lg border border-sky-400/20 bg-sky-500/[0.06] p-3">
                <div className="text-[11px] text-sky-200/70">하위 바로미터 (&lt;300)</div>
                <div className="text-[18px] font-bold" style={{ color: retColor(bt.spread.low_lt300.avgFwd) }}>{pct(bt.spread.low_lt300.avgFwd, 2)}</div>
                <div className="text-[10.5px] text-white/45">승률 {bt.spread.low_lt300.winRate}% · n {bt.spread.low_lt300.n}</div>
              </div>
              <div className="flex-1 rounded-lg border border-amber-400/25 bg-amber-500/[0.08] p-3">
                <div className="text-[11px] text-amber-200/80">스프레드 (상위−하위)</div>
                <div className="text-[18px] font-bold text-amber-200">{pct(bt.spread.spreadPct, 2)}</div>
                <div className="text-[10.5px] text-white/45">클수록 예측력↑</div>
              </div>
            </div>
          </section>
        ) : state !== "loading" ? (
          <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-[12.5px] text-white/55">
            백테스트 결과 생성 중입니다(과거 가격 수집·재계산). 잠시 후 새로고침하면 표시됩니다.
          </div>
        ) : null}

        {/* ── 오늘의 리더보드 ── */}
        {snap && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-white/85">오늘의 바로미터 상위 테마 <span className="text-white/40">({snap.date})</span></h2>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full border-collapse text-[12.5px] whitespace-nowrap">
                <thead>
                  <tr className="bg-white/[0.05] text-white/80">
                    <th className="px-3 py-1.5 text-left font-semibold">#</th>
                    <th className="px-3 py-1.5 text-left font-semibold">테마</th>
                    <th className="px-3 py-1.5 text-right font-semibold">바로미터</th>
                    <th className="px-3 py-1.5 text-left font-semibold">기간</th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((r, i) => (
                    <tr key={r.themeId} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-3 py-1 text-white/40">{i + 1}</td>
                      <td className="px-3 py-1"><a href={`/graph/${r.themeId}`} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">{r.themeName}</a></td>
                      <td className="px-3 py-1 text-right font-bold text-white/90">{r.headlineScore}</td>
                      <td className="px-3 py-1 text-white/45">{r.headlinePeriod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── 방법·한계 고지 ── */}
        <section className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/45">
          <b className="text-white/60">방법·한계</b><br />
          {bt && <>· 백테스트: {bt.method.horizon} 바로미터 · 이후 {bt.method.fwdDays}거래일 forward · 최근 {bt.method.weeksBack}주 주간 리밸 · 표본 {bt.totalPairs.toLocaleString()}쌍.<br /></>}
          · <b className="text-white/55">구성종목/룩어헤드 편향</b>: 현재 테마 구성을 과거에 적용 → 그 시점에 없던 종목이 포함될 수 있음(참고치).<br />
          · <b className="text-white/55">생존편향</b>: 상장폐지·개명 종목 누락. 신규 자산은 이력 부족 시 제외.<br />
          · forward 수익률 = 구성종목 단순평균(EW 근사), 거래비용·리밸런싱 비용 미반영.<br />
          · 무편향 실적은 <b className="text-white/55">일별 포워드 스냅샷</b>이 누적되며 별도 검증됩니다. 본 화면은 투자 자문이 아니라 정보 제공이며, 투자 판단·책임은 이용자 본인에게 있습니다.
        </section>
      </div>
    </main>
  );
}
