"use client";

// 충격 전파 what-if — 매크로/테마/종목에 충격을 주면 온톨로지 엣지를 따라 어디까지 번지는지 시뮬레이션.
// 전역 그래프(import_MT/data/shock/graph.json)를 받아 클라이언트에서 Dijkstra(최대곱 경로)로 전파 계산.

import React, { useEffect, useMemo, useState } from "react";

const RAW = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/shock/graph.json";
const DECAY = 0.8;   // 홉당 감쇠
const MIN = 0.05;    // 최소 전파 강도

type GNode = { id: string; type: "macro" | "theme" | "asset"; name: string; country?: string };
type GEdge = { from: string; to: string; type: string; w: number };
type Graph = { meta: { generated: string; nodeCount: number; edgeCount: number; note: string }; nodes: GNode[]; edges: GEdge[] };

const CO_LABEL: Record<string, string> = { US: "미국", KR: "한국", CN: "중국", HK: "홍콩", JP: "일본", TW: "대만", GB: "영국", DE: "독일", FR: "프랑스", CA: "캐나다", AU: "호주", IN: "인도", NL: "네덜란드", CH: "스위스", SG: "싱가포르" };
const TYPE_LABEL: Record<string, string> = { macro: "매크로", theme: "테마", asset: "종목" };

// 간이 이진 최대힙
class MaxHeap<T> { a: [number, T][] = [];
  push(k: number, v: T) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] >= a[i][0]) break;[a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop(): [number, T] | undefined { const a = this.a; if (!a.length) return undefined; const top = a[0], last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] > a[m][0]) m = l; if (r < a.length && a[r][0] > a[m][0]) m = r; if (m === i) break;[a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; } }

export default function ShockPage() {
  const [g, setG] = useState<Graph | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try { const r = await fetch(`${RAW}?_cb=${Date.now()}`, { cache: "no-store" }); if (!r.ok) throw new Error(); const j = await r.json(); if (!cancel) { setG(j); setState("ok"); } }
      catch { if (!cancel) setState("error"); }
    })();
    return () => { cancel = true; };
  }, []);

  const { nodeById, adj } = useMemo(() => {
    const nodeById = new Map<string, GNode>();
    const adj = new Map<string, { to: string; w: number }[]>();
    if (g) {
      for (const n of g.nodes) { nodeById.set(n.id, n); adj.set(n.id, []); }
      for (const e of g.edges) { adj.get(e.from)?.push({ to: e.to, w: e.w }); adj.get(e.to)?.push({ to: e.from, w: e.w }); }
    }
    return { nodeById, adj };
  }, [g]);

  const quickMacros = useMemo(() => {
    if (!g) return [];
    return [...adj.entries()].filter(([id]) => nodeById.get(id)?.type === "macro").sort((a, b) => b[1].length - a[1].length).slice(0, 10).map(([id]) => id);
  }, [g, adj, nodeById]);

  const matches = useMemo(() => {
    if (!g || !q.trim()) return [];
    const s = q.trim().toLowerCase();
    return g.nodes.filter((n) => n.name.toLowerCase().includes(s)).sort((a, b) => (adj.get(b.id)?.length ?? 0) - (adj.get(a.id)?.length ?? 0)).slice(0, 12);
  }, [g, q, adj]);

  // 전파 계산 (Dijkstra 최대곱)
  const result = useMemo(() => {
    if (!origin || !adj.size) return null;
    const inten = new Map<string, number>(); const pred = new Map<string, string>(); const hop = new Map<string, number>();
    inten.set(origin, 1); hop.set(origin, 0);
    const h = new MaxHeap<string>(); h.push(1, origin);
    while (h.size) {
      const [ci, cur] = h.pop()!;
      if (ci < (inten.get(cur) ?? 0)) continue;
      for (const { to, w } of adj.get(cur) ?? []) {
        const cand = ci * w * DECAY;
        if (cand >= MIN && cand > (inten.get(to) ?? 0)) { inten.set(to, cand); pred.set(to, cur); hop.set(to, (hop.get(cur) ?? 0) + 1); h.push(cand, to); }
      }
    }
    const rows = [...inten.entries()].filter(([id]) => id !== origin).map(([id, v]) => ({ id, v, hop: hop.get(id) ?? 0, node: nodeById.get(id)! })).filter((r) => r.node);
    const themes = rows.filter((r) => r.node.type === "theme").sort((a, b) => b.v - a.v);
    const assets = rows.filter((r) => r.node.type === "asset").sort((a, b) => b.v - a.v);
    const macros = rows.filter((r) => r.node.type === "macro").sort((a, b) => b.v - a.v);
    // 시장(국가) 임팩트: 자산 강도 합
    const mkt = new Map<string, number>();
    for (const r of assets) { const c = r.node.country; if (c) mkt.set(c, (mkt.get(c) ?? 0) + r.v); }
    const maxMkt = Math.max(1e-9, ...mkt.values());
    const markets = [...mkt.entries()].map(([co, v]) => ({ co, label: CO_LABEL[co] || co, v, pct: v / maxMkt })).sort((a, b) => b.v - a.v);
    const pathOf = (id: string) => { const p: string[] = []; let c: string | undefined = id; let guard = 0; while (c && guard++ < 12) { p.unshift(nodeById.get(c)?.name || c); c = pred.get(c); } return p; };
    return { themes, assets, macros, markets, reached: rows.length, pathOf };
  }, [origin, adj, nodeById]);

  const originNode = origin ? nodeById.get(origin) : null;
  const Bar = ({ v, color }: { v: number; color: string }) => (
    <span className="relative block h-2 w-full rounded bg-white/[0.05]"><span className="absolute top-0 h-2 rounded" style={{ width: `${Math.round(v * 100)}%`, background: color }} /></span>
  );

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        <div className="mb-3 flex items-center gap-3">
          <a href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">← 홈으로</a>
          <h1 className="text-lg font-semibold text-white/90">💥 충격 전파 what-if</h1>
        </div>
        <p className="mb-4 text-[12.5px] leading-relaxed text-white/55">
          매크로·테마·종목에 <b className="text-white/80">충격</b>을 주면, 온톨로지 관계(엣지)를 따라 <b className="text-white/80">어느 테마·종목·시장까지 번지는지</b> 전파 경로와 강도를 시뮬레이션합니다. <span className="text-white/40">(구조 기반 추정·탐지)</span>
        </p>

        {state === "loading" && <div className="text-white/50">불러오는 중…</div>}
        {state === "error" && <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-[12.5px] text-white/55">그래프 데이터 생성 중입니다. 잠시 후 새로고침해 주세요.</div>}

        {state === "ok" && g && (
          <>
            <div className="relative mb-2 max-w-lg">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="충격 진원 검색 (매크로·테마·종목… 예: 금리, 전쟁, 엔비디아)"
                className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none" />
              {matches.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-white/15 bg-neutral-900 shadow-xl">
                  {matches.map((n) => (
                    <button key={n.id} onClick={() => { setOrigin(n.id); setQ(""); }} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-white/10">
                      <span className="truncate text-[12.5px] text-white/85">{n.name}</span>
                      <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">{TYPE_LABEL[n.type]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!origin && (
              <div className="mb-4">
                <div className="mb-1.5 text-[11px] font-semibold text-white/55">⚡ 대표 매크로 충격으로 바로 보기</div>
                <div className="flex flex-wrap gap-1.5">
                  {quickMacros.map((id) => (
                    <button key={id} onClick={() => setOrigin(id)} className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11.5px] text-white/75 transition-all hover:border-white/40 hover:bg-white/[0.08]">{nodeById.get(id)?.name}</button>
                  ))}
                </div>
              </div>
            )}

            {origin && originNode && result && (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/[0.08] p-3">
                  <span className="text-[11px] text-fuchsia-200/70">충격 진원</span>
                  <span className="text-[15px] font-bold text-white/90">{originNode.name}</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">{TYPE_LABEL[originNode.type]}</span>
                  <span className="text-[11px] text-white/45">→ 전파 도달 {result.reached}개 노드 (테마 {result.themes.length} · 종목 {result.assets.length} · 매크로 {result.macros.length})</span>
                  <button onClick={() => setOrigin(null)} className="ml-auto rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/50 hover:text-white/80">진원 변경</button>
                </div>

                {result.markets.length > 0 && (
                  <section className="mb-5">
                    <h2 className="mb-2 text-sm font-semibold text-white/85">🌍 시장(국가)별 전파 강도</h2>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {result.markets.slice(0, 8).map((m) => (
                        <div key={m.co} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 transition-all hover:border-white/35">
                          <div className="mb-1 flex items-center justify-between text-[12px]"><span className="font-semibold text-white/80">{m.label}</span><span className="tabular-nums text-white/45">{Math.round(m.pct * 100)}</span></div>
                          <Bar v={m.pct} color="#e879f9" />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="mb-5">
                  <h2 className="mb-2 text-sm font-semibold text-rose-200/85">🎯 영향받는 테마 <span className="text-white/35">{result.themes.length}</span></h2>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {result.themes.slice(0, 18).map((r) => (
                      <a key={r.id} href={`/graph/${r.id}`} target="_blank" rel="noreferrer" className="group block rounded-xl border border-rose-400/20 bg-gradient-to-br from-rose-500/[0.06] to-white/[0.02] p-3 transition-all hover:border-rose-300/60 hover:shadow-[0_0_0_1px_rgba(251,113,133,0.35)]">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-bold text-white/90 group-hover:text-white">{r.node.name}</span>
                          <span className="shrink-0 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-100">{Math.round(r.v * 100)}</span>
                        </div>
                        <Bar v={r.v} color="#f87171" />
                        <div className="mt-1.5 truncate text-[10px] text-white/40" title={result.pathOf(r.id).join(" › ")}>{r.hop}홉 · {result.pathOf(r.id).join(" › ")}</div>
                      </a>
                    ))}
                  </div>
                </section>

                <section className="mb-5">
                  <h2 className="mb-2 text-sm font-semibold text-white/85">📌 영향받는 종목 <span className="text-white/35">{result.assets.length}</span></h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {result.assets.slice(0, 24).map((r) => (
                      <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 transition-all hover:border-white/35 hover:bg-white/[0.05]">
                        <div className="mb-1 flex items-center justify-between gap-1">
                          <span className="truncate text-[12px] font-semibold text-white/85">{r.node.name}</span>
                          <span className="shrink-0 text-[10px] tabular-nums text-white/45">{Math.round(r.v * 100)}</span>
                        </div>
                        <Bar v={r.v} color="#fbbf24" />
                        <div className="mt-1 text-[9.5px] text-white/35">{CO_LABEL[r.node.country || ""] || r.node.country || "-"} · {r.hop}홉</div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {g?.meta && (
          <section className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/45">
            <b className="text-white/60">방법·한계</b><br />
            · 전역 온톨로지 그래프({g.meta.nodeCount}노드·{g.meta.edgeCount}엣지)에서 진원부터 <b className="text-white/55">엣지 가중치×홉 감쇠</b>의 최대곱 경로로 전파 강도를 계산(0~100).<br />
            · 엣지 타입별 가중치(IMPACTS 0.9·THEMED_AS 0.8·2궤도 0.4~0.6)와 홉 감쇠 {DECAY}, 최소 강도 {MIN} 컷.<br />
            · <b className="text-white/55">구조 기반 추정</b>이며 실제 가격 전파·인과·부호(상승/하락)를 보장하지 않습니다. 향후 코무브먼트 실측으로 강도 보정 예정. 정보 제공용입니다.
          </section>
        )}
      </div>
    </main>
  );
}
