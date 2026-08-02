"use client";

// 글로벌 크로스마켓 교차투자 — (1)시장을 가로지르는 테마의 시장별 구성·수익률,
// (2)US→KR 오버나잇 리드(어젯밤 미국 → 오늘 한국) 방향 적중률.
// 데이터: import_MT/data/cross_market/cm.json (px_hist 기반 사전계산).

import React, { useEffect, useMemo, useState } from "react";

const RAW = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/cross_market/cm.json";

type Market = { co: string; label: string; n: number; r7: number | null; r30: number | null };
type Lead = { horizon?: number; hitRate: number; corr: number; n: number; lastUsRet: number | null; lastUsDate: string };
type Theme = { id: string; name: string; markets: Market[]; marketCount: number; lead: Lead | null };
type Meta = { generated: string; window: number; themeCount: number; method: string };
type Payload = { meta: Meta; themes: Theme[] };

function retColor(v: number | null | undefined): string { if (v == null) return "#94a3b8"; return v >= 0 ? "#f87171" : "#60a5fa"; }
function pct(v: number | null | undefined, d = 1): string { if (v == null) return "—"; return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`; }

export default function CrossMarketPage() {
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

  const crossThemes = useMemo(() =>
    [...(data?.themes ?? [])].sort((a, b) => b.marketCount - a.marketCount || (b.markets[0]?.n ?? 0) - (a.markets[0]?.n ?? 0)).slice(0, 18),
    [data]);
  const leads = useMemo(() =>
    (data?.themes ?? []).filter((t) => t.lead && t.lead.n >= 60).sort((a, b) => (b.lead!.hitRate - a.lead!.hitRate)).slice(0, 18),
    [data]);

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        <div className="mb-3 flex items-center gap-3">
          <a href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">← 홈으로</a>
          <h1 className="text-lg font-semibold text-white/90">🌐 글로벌 크로스마켓 교차투자</h1>
        </div>
        <p className="mb-5 text-[12.5px] leading-relaxed text-white/55">
          하나의 테마가 <b className="text-white/80">여러 나라 증시에 걸쳐</b> 있을 때, 어느 시장이 이 테마를 끌고 있는지,
          그리고 <b className="text-white/80">최근 3일 미국 흐름이 이후 3일 한국</b>으로 이어지는지를 봅니다. <span className="text-white/40">(예측이 아닌 탐지·경보)</span>
        </p>

        {state === "loading" && <div className="text-white/50">불러오는 중…</div>}
        {state === "error" && <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-[12.5px] text-white/55">크로스마켓 데이터 생성 중입니다. 잠시 후 새로고침해 주세요.</div>}

        {state === "ok" && data && (
          <>
            {/* US→KR 오버나잇 리드 */}
            <section className="mb-7">
              <h2 className="mb-1 text-sm font-semibold text-amber-200/85">📅 US→KR 3일 리드 <span className="text-white/35">{leads.length}</span></h2>
              <p className="mb-2.5 text-[11px] text-white/45">최근 <b className="text-white/60">3거래일 미국</b> 흐름이 이후 <b className="text-white/60">3거래일 한국</b>으로 이어진 <b className="text-white/60">방향 적중률</b>이 높은 테마. 오버나잇 노이즈 대신 3일 스윙으로 봅니다.</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {leads.map((t) => {
                  const L = t.lead!;
                  const up = (L.lastUsRet ?? 0) >= 0;
                  return (
                    <a key={t.id} href={`/graph/${t.id}`} target="_blank" rel="noreferrer"
                      className="group block rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-500/[0.07] to-white/[0.02] p-3 transition-all hover:border-amber-300/60 hover:shadow-[0_0_0_1px_rgba(251,191,36,0.35)]">
                      <div className="mb-1.5 flex items-start justify-between gap-2">
                        <span className="truncate text-[13px] font-bold text-white/90 group-hover:text-white">{t.name}</span>
                        <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-100" title="어젯밤 미국 방향이 다음 한국 세션 방향과 일치한 비율">적중 {L.hitRate}%</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-white/50">최근 3일 미국<br /><span className="text-[16px] font-bold tabular-nums" style={{ color: retColor(L.lastUsRet) }}>{pct(L.lastUsRet, 2)}</span></div>
                        <div className="text-center text-[11px] text-white/40">→</div>
                        <div className="text-right text-[11px] text-white/50">향후 3일 한국 예상<br /><span className="text-[16px] font-bold" style={{ color: up ? "#f87171" : "#60a5fa" }}>{up ? "▲ 상승" : "▼ 하락"}</span></div>
                      </div>
                      <div className="mt-1.5 text-[10px] text-white/35">상관 {L.corr?.toFixed(2)} · 표본 {L.n} · 시장 {t.markets.map((m) => `${m.label}${m.n}`).join("·")}</div>
                    </a>
                  );
                })}
              </div>
            </section>

            {/* 크로스마켓 테마 브리핑 */}
            <section className="mb-6">
              <h2 className="mb-1 text-sm font-semibold text-white/85">🌐 시장을 가로지르는 테마 <span className="text-white/35">{crossThemes.length}</span></h2>
              <p className="mb-2.5 text-[11px] text-white/45">여러 나라에 걸친 테마의 <b className="text-white/60">시장별 구성 종목 수</b>와 <b className="text-white/60">최근 1개월 수익률</b>. 어느 시장이 이 테마를 끌고 있는지 비교하세요.</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {crossThemes.map((t) => (
                  <a key={t.id} href={`/graph/${t.id}`} target="_blank" rel="noreferrer"
                    className="group block rounded-xl border border-white/12 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-3 transition-all hover:border-white/35 hover:bg-white/[0.06]">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-bold text-white/90 group-hover:text-white">{t.name}</span>
                      <span className="shrink-0 rounded border border-white/15 bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/50">{t.marketCount}개 시장</span>
                    </div>
                    <div className="space-y-1">
                      {t.markets.slice(0, 5).map((m) => (
                        <div key={m.co} className="flex items-center gap-2 text-[11.5px]">
                          <span className="w-12 shrink-0 text-white/60">{m.label}</span>
                          <span className="w-8 shrink-0 text-white/35">{m.n}종</span>
                          <span className="relative h-2 flex-1 rounded bg-white/[0.05]">
                            <span className="absolute top-0 h-2 rounded" style={{ left: (m.r30 ?? 0) >= 0 ? "50%" : `${50 - Math.min(50, Math.abs(m.r30 ?? 0))}%`, width: `${Math.min(50, Math.abs(m.r30 ?? 0))}%`, background: retColor(m.r30) }} />
                            <span className="absolute left-1/2 top-0 h-2 w-px bg-white/20" />
                          </span>
                          <span className="w-14 shrink-0 text-right font-semibold tabular-nums" style={{ color: retColor(m.r30) }}>{pct(m.r30, 1)}</span>
                        </div>
                      ))}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          </>
        )}

        {data?.meta && (
          <section className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/45">
            <b className="text-white/60">방법·한계</b><br />
            · {data.meta.method}<br />
            · 다국가 테마 {data.meta.themeCount}개 · 갱신 {data.meta.generated?.slice(0, 10)}.<br />
            · 오버나잇 리드는 <b className="text-white/55">시차·거래시간 구조</b>에서 나오는 통계적 경향으로, 개별일 적중을 보장하지 않습니다(참고치).<br />
            · 서브바스켓은 <b className="text-white/55">국가별 등가중</b> 근사이며 환율 미조정. 투자 자문이 아닌 정보 제공입니다.
          </section>
        )}
      </div>
    </main>
  );
}
