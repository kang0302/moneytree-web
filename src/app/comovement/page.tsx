"use client";

// 테마 코무브먼트 — 테마 일별수익률(시장요인 제거 잔차)의 롤링 상관으로 (1)클러스터 맵/히트맵,
// (2)함께 뜨고 지는 테마 탐색, (3)내 바스켓 숨은 중복(집중 리스크) 진단.
// 데이터: import_MT/data/comovement/{meta,graph,neighbors,clusters}.json (사전계산).

import React, { useEffect, useMemo, useState, useCallback } from "react";

const RAW = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/comovement";

type Node = { id: string; name: string; assetCount: number; cluster: number; deg: number };
type Graph = { nodes: Node[]; edges: { a: string; b: string; r: number }[] };
type Neighbors = Record<string, { pos: [string, number][]; neg: [string, number][] }>;
type Cluster = { id: number; label: string; centroidId: string; size: number; themeIds: string[] };
type Clusters = { clusters: Cluster[]; matrix: number[][] };
type Story =
  | { kind: "cluster"; title: string; size: number; avgR: number; themeIds: string[] }
  | { kind: "pair"; themeIds: string[]; r: number }
  | { kind: "hedge"; themeIds: string[]; r: number };
type Stories = { stories: Story[] };
type Meta = { generated: string; window: number; axisStart: string; axisEnd: string; themeCount: number; method: string };

const LS_KEY = "comovement_basket_v1";

function corrColor(r: number): string {
  const a = Math.min(1, Math.abs(r));
  if (r >= 0) return `rgba(239,68,68,${0.1 + 0.75 * a})`;
  return `rgba(59,130,246,${0.1 + 0.75 * a})`;
}

export default function ComovementPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [nbr, setNbr] = useState<Neighbors | null>(null);
  const [cl, setCl] = useState<Clusters | null>(null);
  const [stories, setStories] = useState<Stories | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [tab, setTab] = useState<"map" | "explore" | "basket">("map");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const cb = `?_cb=${Date.now()}`;
        const [m, g, n, c, s] = await Promise.all([
          fetch(`${RAW}/meta.json${cb}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`${RAW}/graph.json${cb}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`${RAW}/neighbors.json${cb}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`${RAW}/clusters.json${cb}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`${RAW}/stories.json${cb}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (cancel) return;
        setMeta(m); setGraph(g); setNbr(n); setCl(c); setStories(s);
        setState(g && n && c ? "ok" : "error");
      } catch { if (!cancel) setState("error"); }
    })();
    return () => { cancel = true; };
  }, []);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    graph?.nodes.forEach((x) => m.set(x.id, x.name));
    return m;
  }, [graph]);

  // 임의 테마쌍 상관 조회 (이웃 top-N 기반, 없으면 null=낮음)
  const posMap = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    if (nbr) for (const id in nbr) m.set(id, new Map(nbr[id].pos));
    return m;
  }, [nbr]);
  const corrOf = useCallback((a: string, b: string): number | null => {
    if (a === b) return 1;
    return posMap.get(a)?.get(b) ?? posMap.get(b)?.get(a) ?? null;
  }, [posMap]);

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <a href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">← 홈으로</a>
            <h1 className="text-lg font-semibold text-white/90">🔗 테마 코무브먼트</h1>
          </div>
        </div>

        <p className="mb-3 text-[12.5px] leading-relaxed text-white/55">
          테마별 <b className="text-white/80">일별 수익률</b>에서 <b className="text-white/80">시장 공통요인을 제거</b>한 잔차의 상관으로, 어떤 테마들이 <b className="text-white/80">실제로 함께 움직이는지</b>를 봅니다.
          시장 전체 등락이 아닌 <b className="text-white/80">테마 고유의 동조</b>만 포착합니다. <span className="text-white/40">(예측이 아닌 탐지·경보)</span>
        </p>

        {/* 탭 */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {([["map", "🗺️ 코무브먼트 맵"], ["explore", "🔎 함께 뜨고 지는 테마"], ["basket", "🧺 내 바스켓 · 숨은 중복"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${tab === k ? "border-white/30 bg-white/[0.1] text-white" : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]"}`}>
              {label}
            </button>
          ))}
        </div>

        {state === "loading" && <div className="text-white/50">불러오는 중…</div>}
        {state === "error" && <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-[12.5px] text-white/55">코무브먼트 데이터 생성 중입니다. 잠시 후 새로고침해 주세요.</div>}

        {state === "ok" && graph && nbr && cl && (
          <>
            {tab === "map" && <MapTab cl={cl} graph={graph} stories={stories} />}
            {tab === "explore" && <ExploreTab graph={graph} nbr={nbr} nameOf={nameOf} clusters={cl.clusters} />}
            {tab === "basket" && <BasketTab graph={graph} nameOf={nameOf} corrOf={corrOf} />}
          </>
        )}

        {meta && (
          <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/45">
            <b className="text-white/60">방법·한계</b><br />
            · {meta.method}<br />
            · 산출 구간: {meta.axisStart} ~ {meta.axisEnd} · 테마 {meta.themeCount}개 · 갱신 {meta.generated?.slice(0, 10)}.<br />
            · <b className="text-white/55">시장요인 제거</b>: 각 날짜 전 테마 평균수익(시장요인)을 빼 <b>고유 동조</b>만 측정. 원(총)상관보다 낮게 나오는 게 정상.<br />
            · 상관은 <b className="text-white/55">과거 동조</b>이며 미래·인과를 보장하지 않습니다. 투자 자문이 아닌 정보 제공입니다.
          </section>
        )}
      </div>
    </main>
  );
}

/* ── Tab 1: 코무브먼트 맵 — 스토리 카드(앞) + 상세 히트맵/전체군집(뒤·펼치기) ── */
function MapTab({ cl, graph, stories }: { cl: Clusters; graph: Graph; stories: Stories | null }) {
  const [sel, setSel] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const clusters = cl.clusters;
  const nameOf = useMemo(() => { const m = new Map<string, string>(); graph.nodes.forEach((x) => m.set(x.id, x.name)); return m; }, [graph]);
  const short = (s: string) => (s.length > 10 ? s.slice(0, 9) + "…" : s);

  return (
    <section>
      {/* 스토리 카드 */}
      <h2 className="mb-1 text-sm font-semibold text-white/85">오늘의 코무브먼트 스토리</h2>
      <p className="mb-3 text-[11px] text-white/45">시장요인을 뺀 뒤에도 특히 뚜렷하게 함께(또는 반대로) 움직이는 관계만 추려낸 하이라이트입니다.</p>
      <div className="mb-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {(stories?.stories ?? []).map((st, i) => <StoryCard key={i} st={st} nameOf={nameOf} />)}
        {!stories && <div className="text-[12px] text-white/40">스토리 생성 중…</div>}
      </div>

      {/* 상세: 히트맵 + 전체 클러스터 (뒤로 배치, 펼치기) */}
      <button onClick={() => setShowDetail((v) => !v)}
        className="mb-3 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">
        {showDetail ? "▲ 상세 맵 접기" : `▼ 전체 클러스터 맵·상관 히트맵 보기 (${clusters.length}개 커뮤니티)`}
      </button>

      {showDetail && (<div>
      <h2 className="mb-1 text-sm font-semibold text-white/85">클러스터 상관 히트맵 <span className="text-white/40">— 같이 움직이는 테마군 {clusters.length}개</span></h2>
      <p className="mb-2 text-[11px] text-white/45">칸 색이 진할수록(빨강=동조, 파랑=역동조) 두 커뮤니티가 함께 움직입니다. 커뮤니티를 클릭하면 소속 테마가 보입니다.</p>
      <div className="overflow-x-auto rounded-lg border border-white/10 p-1">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-black p-1"></th>
              {clusters.map((c) => (
                <th key={c.id} className="p-0.5 align-bottom">
                  <div className="mx-auto h-16 w-4 origin-bottom -rotate-90 whitespace-nowrap text-left text-white/45" style={{ transformOrigin: "center" }}>{short(c.label)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clusters.map((c, i) => (
              <tr key={c.id}>
                <td className="sticky left-0 z-10 max-w-[140px] cursor-pointer truncate bg-black p-1 text-right text-white/60 hover:text-white" title={c.label} onClick={() => setSel(sel === c.id ? null : c.id)}>
                  {short(c.label)} <span className="text-white/30">{c.size}</span>
                </td>
                {clusters.map((_, j) => {
                  const r = cl.matrix[i]?.[j] ?? 0;
                  return <td key={j} title={`${c.label} ↔ ${clusters[j].label}: ${r.toFixed(2)}`} className="h-5 w-5 text-center" style={{ background: i === j ? "rgba(255,255,255,0.12)" : corrColor(r) }}>{i === j ? "" : ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 mt-5 text-sm font-semibold text-white/85">커뮤니티 {sel !== null ? "· 선택됨" : "목록"}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {clusters.filter((c) => sel === null || c.id === sel).map((c) => (
          <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-white/85">{c.label}</span>
              <span className="text-[10.5px] text-white/40">{c.size}개 테마</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {c.themeIds.slice(0, sel === c.id ? 999 : 10).map((tid) => (
                <a key={tid} href={`/graph/${tid}`} target="_blank" rel="noreferrer"
                  className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10.5px] text-sky-300/80 hover:bg-white/10">{nameOf.get(tid) || tid}</a>
              ))}
              {sel !== c.id && c.size > 10 && <span className="px-1 py-0.5 text-[10.5px] text-white/35">+{c.size - 10}</span>}
            </div>
          </div>
        ))}
      </div>
      </div>)}
    </section>
  );
}

/* ── 스토리 카드 ── */
function StoryCard({ st, nameOf }: { st: Story; nameOf: Map<string, string> }) {
  const chip = (tid: string, key?: React.Key) => (
    <a key={key ?? tid} href={`/graph/${tid}`} target="_blank" rel="noreferrer"
      className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-sky-300/85 hover:bg-white/10">{nameOf.get(tid) || tid}</a>
  );
  if (st.kind === "cluster") {
    return (
      <div className="rounded-xl border border-rose-400/20 bg-gradient-to-br from-rose-500/[0.08] to-white/[0.02] p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-rose-200/80">🧲 함께 움직이는 {st.size}개 테마</span>
          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-200/80" title="커뮤니티 내부 평균 동조도">동조 {st.avgR.toFixed(2)}</span>
        </div>
        <div className="mb-1.5 text-[13.5px] font-bold text-white/90">{st.title}</div>
        <div className="flex flex-wrap gap-1">{st.themeIds.map((t) => chip(t))}</div>
      </div>
    );
  }
  if (st.kind === "pair") {
    return (
      <div className="rounded-xl border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.09] to-white/[0.02] p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-amber-200/85">🔗 사실상 한 몸 (숨은 중복)</span>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200/90">동조 {st.r.toFixed(2)}</span>
        </div>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-white/90">
          {chip(st.themeIds[0])} <span className="text-white/40">↔</span> {chip(st.themeIds[1])}
        </div>
        <div className="text-[10.5px] text-white/45">달라 보여도 거의 같이 움직임 — 분산 착시·집중 리스크 주의.</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-sky-400/25 bg-gradient-to-br from-sky-500/[0.09] to-white/[0.02] p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-sky-200/85">⚖️ 정반대로 움직임 (헤지)</span>
        <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-200/90">동조 {st.r.toFixed(2)}</span>
      </div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-white/90">
        {chip(st.themeIds[0])} <span className="text-white/40">↔</span> {chip(st.themeIds[1])}
      </div>
      <div className="text-[10.5px] text-white/45">한쪽이 오르면 다른 쪽은 내리는 경향 — 헤지·분산에 활용.</div>
    </div>
  );
}

/* ── Tab 2: 함께 뜨고 지는 테마 (테마별 이웃) ── */
function ExploreTab({ graph, nbr, nameOf, clusters }: { graph: Graph; nbr: Neighbors; nameOf: Map<string, string>; clusters: Cluster[] }) {
  const sorted = useMemo(() => [...graph.nodes].sort((a, b) => a.name.localeCompare(b.name, "ko")), [graph]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const clusterName = useMemo(() => { const m = new Map<number, string>(); clusters.forEach((c) => m.set(c.id, c.label)); return m; }, [clusters]);

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const s = q.trim().toLowerCase();
    return sorted.filter((n) => n.name.toLowerCase().includes(s) || n.id.toLowerCase().includes(s)).slice(0, 12);
  }, [q, sorted]);

  const cur = sel ? graph.nodes.find((n) => n.id === sel) : null;
  const data = sel ? nbr[sel] : null;
  const Bar = ({ id, r }: { id: string; r: number }) => (
    <button onClick={() => { setSel(id); setQ(""); }} className="group flex w-full items-center gap-2 py-0.5 text-left">
      <span className="w-[44%] truncate text-[12px] text-sky-300/80 group-hover:text-sky-200">{nameOf.get(id) || id}</span>
      <span className="relative h-3 flex-1 rounded bg-white/[0.04]">
        <span className="absolute top-0 h-3 rounded" style={{ left: r >= 0 ? "0" : `${(1 + r) * 100}%`, width: `${Math.abs(r) * 100}%`, background: corrColor(r) }} />
      </span>
      <span className="w-10 text-right text-[11px] tabular-nums" style={{ color: r >= 0 ? "#fca5a5" : "#93c5fd" }}>{r.toFixed(2)}</span>
    </button>
  );

  return (
    <section>
      <div className="relative mb-3 max-w-md">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="테마 검색 (예: 중국인터넷, HBM, 로봇…)"
          className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none" />
        {matches.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/15 bg-neutral-900 shadow-xl">
            {matches.map((n) => (
              <button key={n.id} onClick={() => { setSel(n.id); setQ(""); }} className="block w-full truncate px-3 py-1.5 text-left text-[12.5px] text-white/80 hover:bg-white/10">{n.name}</button>
            ))}
          </div>
        )}
      </div>

      {!cur && <div className="text-[12.5px] text-white/45">테마를 검색해 선택하면, 시장요인을 뺀 뒤에도 <b className="text-white/70">함께 뜨는 테마</b>와 <b className="text-white/70">반대로 가는(헤지) 테마</b>를 보여줍니다.</div>}

      {cur && data && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold text-white/90">{cur.name}</span>
            {cur.cluster >= 0 && <span className="rounded border border-white/15 bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] text-white/50">커뮤니티: {clusterName.get(cur.cluster) || "-"}</span>}
            <a href={`/graph/${cur.id}`} target="_blank" rel="noreferrer" className="rounded border border-white/15 bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] text-sky-300 hover:bg-white/10">그래프 열기 ↗</a>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-rose-400/15 bg-rose-500/[0.04] p-3">
              <div className="mb-1.5 text-[12px] font-semibold text-rose-200/80">🔺 함께 뜨고 지는 테마 (동조)</div>
              {data.pos.slice(0, 12).map(([id, r]) => <Bar key={id} id={id} r={r} />)}
            </div>
            <div className="rounded-lg border border-sky-400/15 bg-sky-500/[0.04] p-3">
              <div className="mb-1.5 text-[12px] font-semibold text-sky-200/80">🔻 반대로 가는 테마 (헤지 후보)</div>
              {data.neg.filter(([, r]) => r < 0).length === 0 && <div className="py-2 text-[11.5px] text-white/40">뚜렷한 역동조 테마 없음(시장요인 제거 후).</div>}
              {data.neg.filter(([, r]) => r < 0).slice(0, 12).map(([id, r]) => <Bar key={id} id={id} r={r} />)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Tab 3: 내 바스켓 · 숨은 중복 진단 ── */
function BasketTab({ graph, nameOf, corrOf }: { graph: Graph; nameOf: Map<string, string>; corrOf: (a: string, b: string) => number | null }) {
  const sorted = useMemo(() => [...graph.nodes].sort((a, b) => a.name.localeCompare(b.name, "ko")), [graph]);
  const [q, setQ] = useState("");
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => { try { const s = localStorage.getItem(LS_KEY); if (s) setIds(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(ids)); } catch {} }, [ids]);

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const s = q.trim().toLowerCase();
    return sorted.filter((n) => (n.name.toLowerCase().includes(s) || n.id.toLowerCase().includes(s)) && !ids.includes(n.id)).slice(0, 10);
  }, [q, sorted, ids]);

  const pairs = useMemo(() => {
    const out: { a: string; b: string; r: number }[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const r = corrOf(ids[i], ids[j]);
      if (r != null) out.push({ a: ids[i], b: ids[j], r });
    }
    return out.sort((x, y) => y.r - x.r);
  }, [ids, corrOf]);

  const avg = pairs.length ? pairs.reduce((a, p) => a + p.r, 0) / pairs.length : null;
  const hidden = pairs.filter((p) => p.r >= 0.7);

  return (
    <section>
      <p className="mb-2 text-[12.5px] text-white/55">관심 테마를 담으면, <b className="text-white/80">서로 다른 테마처럼 보여도 실제로는 함께 움직이는(숨은 중복)</b> 쌍을 찾아 <b className="text-white/80">분산 착시·집중 리스크</b>를 경고합니다.</p>
      <div className="relative mb-3 max-w-md">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="테마를 검색해 바스켓에 추가"
          className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none" />
        {matches.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/15 bg-neutral-900 shadow-xl">
            {matches.map((n) => (
              <button key={n.id} onClick={() => { setIds((p) => [...p, n.id]); setQ(""); }} className="block w-full truncate px-3 py-1.5 text-left text-[12.5px] text-white/80 hover:bg-white/10">＋ {n.name}</button>
            ))}
          </div>
        )}
      </div>

      {ids.length === 0 && <div className="text-[12.5px] text-white/40">아직 담긴 테마가 없습니다. 위에서 검색해 2개 이상 추가하세요.</div>}

      {ids.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ids.map((id) => (
              <span key={id} className="flex items-center gap-1 rounded border border-white/15 bg-white/[0.05] px-2 py-1 text-[11.5px] text-white/80">
                {nameOf.get(id) || id}
                <button onClick={() => setIds((p) => p.filter((x) => x !== id))} className="text-white/40 hover:text-rose-300">✕</button>
              </span>
            ))}
            <button onClick={() => setIds([])} className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/40 hover:text-white/70">전체 비우기</button>
          </div>

          {ids.length >= 2 && (
            <>
              <div className="mb-3 flex flex-wrap gap-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-[11px] text-white/50">바스켓 평균 동조도</div>
                  <div className="text-[18px] font-bold" style={{ color: avg == null ? "#94a3b8" : avg >= 0.5 ? "#f87171" : avg >= 0.3 ? "#fbbf24" : "#4ade80" }}>{avg == null ? "—" : avg.toFixed(2)}</div>
                  <div className="text-[10.5px] text-white/40">{avg == null ? "" : avg >= 0.5 ? "집중 위험 (분산 착시 가능)" : avg >= 0.3 ? "보통" : "잘 분산됨"}</div>
                </div>
                <div className="rounded-lg border border-amber-400/25 bg-amber-500/[0.06] p-3">
                  <div className="text-[11px] text-amber-200/80">숨은 중복 쌍 (동조 ≥ 0.70)</div>
                  <div className="text-[18px] font-bold text-amber-200">{hidden.length}</div>
                  <div className="text-[10.5px] text-white/40">달라 보여도 같이 움직이는 쌍</div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full border-collapse text-[12px] whitespace-nowrap">
                  <thead><tr className="bg-white/[0.05] text-white/80">
                    <th className="px-3 py-1.5 text-left font-semibold">테마 A</th>
                    <th className="px-3 py-1.5 text-left font-semibold">테마 B</th>
                    <th className="px-3 py-1.5 text-right font-semibold">동조도</th>
                    <th className="px-3 py-1.5 text-left font-semibold" style={{ width: 160 }}></th>
                  </tr></thead>
                  <tbody>
                    {pairs.map((p) => (
                      <tr key={p.a + p.b} className={`border-t border-white/5 ${p.r >= 0.7 ? "bg-amber-500/[0.05]" : ""}`}>
                        <td className="px-3 py-1 text-white/80">{nameOf.get(p.a) || p.a}</td>
                        <td className="px-3 py-1 text-white/80">{nameOf.get(p.b) || p.b}</td>
                        <td className="px-3 py-1 text-right font-semibold tabular-nums" style={{ color: p.r >= 0 ? "#fca5a5" : "#93c5fd" }}>{p.r.toFixed(2)}{p.r >= 0.7 && " ⚠"}</td>
                        <td className="px-3 py-1"><span className="relative block h-3 w-full rounded bg-white/[0.04]"><span className="absolute top-0 h-3 rounded" style={{ left: p.r >= 0 ? "0" : `${(1 + p.r) * 100}%`, width: `${Math.abs(p.r) * 100}%`, background: corrColor(p.r) }} /></span></td>
                      </tr>
                    ))}
                    {pairs.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-center text-white/40">담긴 테마 간 뚜렷한 동조가 없습니다(잘 분산됨).</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10.5px] text-white/35">※ 상관은 각 테마 상위 이웃 기준으로 조회합니다. 목록에 없으면 동조가 낮은 것으로 간주합니다.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
