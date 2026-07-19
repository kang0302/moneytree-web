"use client";

// 테마 비교 보드 (MVP): 최대 5개 테마 선택 → 바로미터 레이더 오버레이 +
//   기간별 EW 수익률 라인 + 지표 비교표(온도 뱃지) + 자산 중복도. URL(?ids=)로 공유.
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ReferenceLine, LabelList, Cell, ZAxis,
} from "recharts";
import { computeThemeReturnSummary, PeriodKey, tempByScore } from "@/lib/themeReturn";
import { fetchThemeIndex, ThemeIndexItem } from "@/lib/themeIndex";

const PERIODS: PeriodKey[] = ["1D", "3D", "7D", "15D", "1M", "YTD", "1Y", "2Y", "3Y"];
const MAX = 5;
const COLORS = ["#818cf8", "#38bdf8", "#f472b6", "#34d399", "#fbbf24"];

type Graph = { nodes: any[]; edges: any[] };
type Loaded = {
  id: string;
  name: string;
  graph: Graph | null;
  // 스냅샷 기간 바로미터
  overall: number | null;
  health: number | null;
  momentum: number | null;
  div: number | null;
  risk: number | null;
  assetCount: number;
  // 전 기간 EW 수익률(%)
  ewByPeriod: Record<string, number | null>;
  tickers: string[];
  note?: string | null;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
async function fetchGraph(id: string): Promise<Graph | null> {
  const local = `/data/theme/${id}.json`;
  const remote = `https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/${id}.json`;
  const tj: any = (await fetchJson(local)) ?? (await fetchJson(remote));
  if (!tj?.nodes) return null;
  return { nodes: tj.nodes, edges: tj.edges ?? tj.links ?? [] };
}

// 포지셔닝 산점도 배경용: 사전계산된 바로미터 일별 스냅샷(전 테마)
type SnapItem = { themeId: string; themeName: string; score: number; health: number; momentum: number; diversification: number; tail: number };
async function fetchLatestSnapshot(): Promise<{ date: string; items: SnapItem[] } | null> {
  const dates = await fetchJson<string[]>("/data/history/index.json");
  const latest = Array.isArray(dates) && dates.length ? dates[0] : null;
  if (!latest) return null;
  const stamp = latest.replace(/-/g, "");
  const snap: any = await fetchJson(`/data/history/barometer_${stamp}.json`);
  const items = (snap?.themes ?? []).filter((x: any) => typeof x?.health === "number" && typeof x?.momentum === "number");
  return { date: latest, items };
}

// 비교 저장/불러오기 (브라우저 localStorage)
const LS_KEY = "knowvest.compare.saved.v1";
type SavedCompare = { sid: string; title: string; ids: string[]; snap: PeriodKey; note: string; savedAt: string };
function loadSaved(): SavedCompare[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
function writeSaved(list: SavedCompare[]) {
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

function tickersOf(nodes: any[]): string[] {
  const out: string[] = [];
  for (const n of nodes || []) {
    if ((n?.type ?? "").toUpperCase() !== "ASSET") continue;
    const tk = String(n?.exposure?.ticker ?? n?.id ?? "").trim();
    if (tk) out.push(tk.toUpperCase());
  }
  return Array.from(new Set(out));
}

function compute(id: string, name: string, graph: Graph | null, snap: PeriodKey): Loaded {
  const base: Loaded = {
    id, name, graph, overall: null, health: null, momentum: null, div: null, risk: null,
    assetCount: 0, ewByPeriod: {}, tickers: [],
  };
  if (!graph?.nodes) return { ...base, note: "테마 JSON 로드 실패" };
  base.tickers = tickersOf(graph.nodes);
  base.assetCount = base.tickers.length;
  // 스냅샷 기간 바로미터(궤도 가중)
  const s: any = computeThemeReturnSummary({ nodes: graph.nodes, edges: graph.edges, period: snap, minAssets: 5, topMoversN: 1 });
  if (s?.ok) {
    base.overall = s.overallScore ?? null;
    base.health = s.healthScore ?? null;
    base.momentum = s.momentumScore ?? null;
    base.div = s.divScore ?? null;
    base.risk = s.riskScore ?? null;
  } else {
    base.note = s?.note ?? s?.sentence ?? "표본 부족/데이터 없음";
  }
  // 전 기간 EW 수익률(동일가중)
  for (const p of PERIODS) {
    const e: any = computeThemeReturnSummary({ nodes: graph.nodes, period: p, minAssets: 5, topMoversN: 1 });
    base.ewByPeriod[p] = e?.ok && Number.isFinite(e.avgReturn) ? e.avgReturn : null;
  }
  return base;
}

function fmtPct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";
}
function scoreColor(v: number | null): string {
  if (v == null) return "#6b7280";
  if (v >= 700) return "#f87171";
  if (v >= 500) return "#fbbf24";
  if (v >= 350) return "#a3e635";
  return "#60a5fa";
}

export default function ComparePage() {
  const [index, setIndex] = useState<ThemeIndexItem[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [snap, setSnap] = useState<PeriodKey>("7D");
  const [graphs, setGraphs] = useState<Record<string, Graph | null>>({});
  const [query, setQuery] = useState("");
  const [loadingIdx, setLoadingIdx] = useState(true);
  const didInitFromUrl = useRef(false);

  // index 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await fetchThemeIndex();
      if (!alive) return;
      setIndex(list);
      setLoadingIdx(false);
    })();
    return () => { alive = false; };
  }, []);

  // URL(?ids=) → 초기 선택
  useEffect(() => {
    if (didInitFromUrl.current) return;
    didInitFromUrl.current = true;
    const q = new URLSearchParams(window.location.search).get("ids");
    if (q) setIds(q.split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX));
  }, []);

  // 선택 → URL 동기화
  useEffect(() => {
    const u = new URL(window.location.href);
    if (ids.length) u.searchParams.set("ids", ids.join(","));
    else u.searchParams.delete("ids");
    window.history.replaceState(null, "", u.toString());
  }, [ids]);

  // 선택된 테마 그래프 로드(캐시)
  useEffect(() => {
    let alive = true;
    (async () => {
      const missing = ids.filter((id) => !(id in graphs));
      if (!missing.length) return;
      const loaded: Record<string, Graph | null> = {};
      await Promise.all(missing.map(async (id) => { loaded[id] = await fetchGraph(id); }));
      if (!alive) return;
      setGraphs((g) => ({ ...g, ...loaded }));
    })();
    return () => { alive = false; };
  }, [ids]); // eslint-disable-line

  // 산점도 배경 스냅샷 로드(1회)
  const [snapshot, setSnapshot] = useState<{ date: string; items: SnapItem[] } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await fetchLatestSnapshot();
      if (alive) setSnapshot(s);
    })();
    return () => { alive = false; };
  }, []);

  // 저장/불러오기 상태
  const [saved, setSaved] = useState<SavedCompare[]>([]);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveNote, setSaveNote] = useState("");
  useEffect(() => { setSaved(loadSaved()); }, []);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of index) m.set(it.themeId, it.themeName);
    return (id: string) => m.get(id) || id;
  }, [index]);

  function saveCurrent() {
    if (!ids.length) return;
    const rec: SavedCompare = {
      sid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title: saveTitle.trim() || ids.map((id) => nameOf(id)).join(" · ").slice(0, 48),
      ids: [...ids], snap, note: saveNote.trim(), savedAt: new Date().toISOString(),
    };
    const next = [rec, ...saved].slice(0, 50);
    setSaved(next); writeSaved(next); setSaveTitle(""); setSaveNote("");
  }
  function loadRec(rec: SavedCompare) {
    setIds(rec.ids.slice(0, MAX));
    if (rec.snap) setSnap(rec.snap);
  }
  function deleteRec(sid: string) {
    const next = saved.filter((s) => s.sid !== sid);
    setSaved(next); writeSaved(next);
  }

  const rows: Loaded[] = useMemo(
    () => ids.map((id, i) => compute(id, nameOf(id), graphs[id] ?? null, snap)),
    [ids, graphs, snap, nameOf]
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index
      .filter((it) => !ids.includes(it.themeId))
      .filter((it) => it.themeName.toLowerCase().includes(q) || it.themeId.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, index, ids]);

  function add(id: string) {
    if (ids.length >= MAX || ids.includes(id)) return;
    setIds((a) => [...a, id]);
    setQuery("");
  }
  function remove(id: string) {
    setIds((a) => a.filter((x) => x !== id));
  }

  // 레이더 데이터: 4지표 × 선택테마
  const radarData = useMemo(() => {
    const dims: Array<[string, keyof Loaded]> = [
      ["Health", "health"], ["Momentum", "momentum"], ["Diversification", "div"], ["Risk(안정)", "risk"],
    ];
    return dims.map(([label, key]) => {
      const o: any = { dim: label };
      for (const r of rows) o[r.id] = typeof r[key] === "number" ? Math.round((r[key] as number) / 10) : 0; // 0~100
      return o;
    });
  }, [rows]);

  // 라인 데이터: 기간 × EW수익률
  const lineData = useMemo(
    () => PERIODS.map((p) => {
      const o: any = { period: p };
      for (const r of rows) o[r.id] = r.ewByPeriod[p];
      return o;
    }),
    [rows]
  );

  // 자산 중복도(쌍별 Jaccard)
  const overlaps = useMemo(() => {
    const out: Array<{ a: string; b: string; inter: number; jac: number }> = [];
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const A = new Set(rows[i].tickers), B = new Set(rows[j].tickers);
        let inter = 0;
        A.forEach((t) => { if (B.has(t)) inter++; });
        const uni = A.size + B.size - inter;
        out.push({ a: rows[i].id, b: rows[j].id, inter, jac: uni ? inter / uni : 0 });
      }
    return out.sort((x, y) => y.jac - x.jac);
  }, [rows]);

  // 범프차트: 기간별 EW 수익률 순위(1=최고)
  const bumpData = useMemo(() => {
    return PERIODS.map((p) => {
      const vals = rows
        .map((r) => ({ id: r.id, v: r.ewByPeriod[p] }))
        .filter((x) => typeof x.v === "number" && Number.isFinite(x.v as number)) as Array<{ id: string; v: number }>;
      vals.sort((a, b) => b.v - a.v);
      const o: any = { period: p };
      vals.forEach((x, i) => { o[x.id] = i + 1; });
      return o;
    });
  }, [rows]);

  // 포지셔닝 산점도: 배경(스냅샷 전 테마) + 선택 테마 하이라이트 (X=Health, Y=Momentum)
  const selIdSet = useMemo(() => new Set(ids), [ids]);
  const bgPoints = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.items
      .filter((it) => !selIdSet.has(it.themeId))
      .map((it) => ({ x: it.health, y: it.momentum, name: it.themeName, score: it.score }));
  }, [snapshot, selIdSet]);
  const selPoints = useMemo(() => {
    const snapMap = new Map((snapshot?.items ?? []).map((it) => [it.themeId, it]));
    return rows.map((r, i) => {
      const s = snapMap.get(r.id);
      const x = typeof r.health === "number" ? r.health : s?.health;
      const y = typeof r.momentum === "number" ? r.momentum : s?.momentum;
      return { id: r.id, x, y, name: r.name, color: COLORS[i] };
    }).filter((p) => typeof p.x === "number" && typeof p.y === "number");
  }, [rows, snapshot]);

  // A vs B 승부표(정확히 2개 선택 시)
  const h2h = useMemo(() => {
    if (rows.length !== 2) return null;
    const [A, B] = rows;
    const base: Array<{ label: string; a: number | null; b: number | null; pct: boolean }> = [
      { label: "Overall", a: A.overall, b: B.overall, pct: false },
      { label: "Health", a: A.health, b: B.health, pct: false },
      { label: "Momentum", a: A.momentum, b: B.momentum, pct: false },
      { label: "Diversification", a: A.div, b: B.div, pct: false },
      { label: "Risk(안정)", a: A.risk, b: B.risk, pct: false },
      ...PERIODS.map((p) => ({ label: p, a: A.ewByPeriod[p] ?? null, b: B.ewByPeriod[p] ?? null, pct: true })),
    ];
    let aw = 0, bw = 0;
    const list = base.map((m) => {
      const an = typeof m.a === "number", bn = typeof m.b === "number";
      let w: "A" | "B" | "T" = "T";
      if (an && bn) w = (m.a as number) > (m.b as number) ? "A" : (m.b as number) > (m.a as number) ? "B" : "T";
      else if (an) w = "A";
      else if (bn) w = "B";
      if (w === "A") aw++; else if (w === "B") bw++;
      return { ...m, w };
    });
    return { A, B, list, aw, bw };
  }, [rows]);

  return (
    <div className="min-h-screen bg-[#08080a] text-white/90">
      <div className="mx-auto max-w-[1400px] px-5 py-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-gray-200 via-indigo-300 to-sky-400 bg-clip-text text-transparent">
              🆚 테마 비교
            </h1>
            <p className="text-white/50 text-sm mt-1">바로미터·기간별 수익률·자산 구성으로 테마를 나란히 비교 (최대 {MAX}개)</p>
          </div>
          <Link href="/" className="text-xs px-3 py-1.5 rounded-lg border border-indigo-400/40 bg-indigo-400/10 text-indigo-200 hover:bg-indigo-400/20">
            ← KNOW_VEST 홈
          </Link>
        </div>

        {/* 선택 영역 */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 mb-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {ids.map((id, i) => (
              <span key={id} className="inline-flex items-center gap-2 pl-3 pr-2 py-1 rounded-full text-sm"
                style={{ background: `${COLORS[i]}22`, border: `1px solid ${COLORS[i]}66`, color: "#e5e7eb" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i] }} />
                {nameOf(id)}
                <button onClick={() => remove(id)} className="ml-1 text-white/50 hover:text-white/90">✕</button>
              </span>
            ))}
            {!ids.length && <span className="text-white/40 text-sm">아래에서 비교할 테마를 검색해 추가하세요.</span>}
          </div>
          {ids.length < MAX && (
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={loadingIdx ? "테마 목록 로딩 중…" : "테마명·ID 검색 (예: 골드만, 리튬, T_103)"}
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400/60"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-white/10 bg-[#111116] shadow-xl">
                  {searchResults.map((it) => (
                    <button key={it.themeId} onClick={() => add(it.themeId)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-400/10 flex justify-between gap-3">
                      <span className="truncate">{it.themeName}</span>
                      <span className="text-white/35 shrink-0">{it.themeId}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* 스냅샷 기간 */}
          <div className="flex items-center gap-1 mt-3 flex-wrap">
            <span className="text-white/40 text-xs mr-1">레이더·표 기준 기간</span>
            {PERIODS.map((p) => (
              <button key={p} onClick={() => setSnap(p)}
                className={`text-xs px-2.5 py-1 rounded-md border ${snap === p ? "border-indigo-400/70 bg-indigo-400/20 text-indigo-100" : "border-white/10 text-white/50 hover:text-white/80"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 저장 / 불러오기 */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 mb-5">
          <div className="text-sm font-semibold text-white/80 mb-2">
            📚 비교 저장 / 불러오기 <span className="text-white/40 font-normal">(이 브라우저에 저장)</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="제목(비우면 테마명 자동)"
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400/60" />
            <input value={saveNote} onChange={(e) => setSaveNote(e.target.value)}
              placeholder="📝 메모(선택)"
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400/60" />
            <button onClick={saveCurrent} disabled={!ids.length}
              className="text-sm px-4 py-2 rounded-lg border border-emerald-400/40 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
              💾 현재 비교 저장
            </button>
          </div>
          {saved.length > 0 && (
            <div className="mt-3 flex flex-col divide-y divide-white/5">
              {saved.map((s) => (
                <div key={s.sid} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-white/85 text-sm">
                      {s.title}
                      <span className="text-white/35 text-xs"> · {s.ids.length}개 · {s.snap} · {s.savedAt.slice(0, 10)}</span>
                    </div>
                    {s.note && <div className="text-[11px] text-white/40 truncate">📝 {s.note}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => loadRec(s)}
                      className="text-xs px-2.5 py-1 rounded-md border border-indigo-400/40 bg-indigo-400/10 text-indigo-200 hover:bg-indigo-400/20">불러오기</button>
                    <button onClick={() => deleteRec(s.sid)}
                      className="text-xs px-2.5 py-1 rounded-md border border-white/10 text-white/50 hover:text-red-300 hover:border-red-400/40">삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {ids.length === 0 ? (
          <div className="text-white/40 text-sm py-16 text-center">비교할 테마를 2개 이상 추가하면 차트가 표시됩니다.</div>
        ) : (
          <>
            {/* 차트: 레이더 + 라인 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <div className="text-sm font-semibold text-white/80 mb-1">바로미터 레이더 <span className="text-white/40 font-normal">({snap} · 0~100)</span></div>
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke="rgba(255,255,255,0.12)" />
                    <PolarAngleAxis dataKey="dim" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                    {rows.map((r, i) => (
                      <Radar key={r.id} name={r.name} dataKey={r.id} stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.12} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#111116", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <div className="text-sm font-semibold text-white/80 mb-1">기간별 EW 수익률 <span className="text-white/40 font-normal">(동일가중, %)</span></div>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={lineData} margin={{ top: 10, right: 16, bottom: 4, left: -8 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="period" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip contentStyle={{ background: "#111116", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => (typeof v === "number" ? `${v.toFixed(1)}%` : "—")} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {rows.map((r, i) => (
                      <Line key={r.id} type="monotone" dataKey={r.id} name={r.name} stroke={COLORS[i]} strokeWidth={2} dot={false} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 차트: 범프(순위) + (2개일 때) A vs B 승부표 */}
            <div className={`grid grid-cols-1 ${h2h ? "lg:grid-cols-2" : ""} gap-5 mb-5`}>
              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <div className="text-sm font-semibold text-white/80 mb-1">기간 랭킹 범프차트 <span className="text-white/40 font-normal">(선택 테마 · EW 수익률 순위, 1=최고)</span></div>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={bumpData} margin={{ top: 10, right: 16, bottom: 4, left: -18 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="period" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                    <YAxis reversed allowDecimals={false} domain={[1, Math.max(2, rows.length)]}
                      ticks={Array.from({ length: rows.length }, (_, i) => i + 1)}
                      tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} width={28} />
                    <Tooltip contentStyle={{ background: "#111116", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => (typeof v === "number" ? `${v}위` : "—")} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {rows.map((r, i) => (
                      <Line key={r.id} type="monotone" dataKey={r.id} name={r.name} stroke={COLORS[i]}
                        strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[11px] text-white/35 mt-1">위로 갈수록(1위) 해당 기간 상대 수익 우위. 선이 요동치면 기간별 부침이 큰 테마.</p>
              </div>

              {h2h && (
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 overflow-x-auto">
                  <div className="text-sm font-semibold text-white/80 mb-1">⚔️ A vs B 승부표 <span className="text-white/40 font-normal">({snap} 기준 · 지표별 우세)</span></div>
                  <div className="text-xs mb-2">
                    <span style={{ color: COLORS[0] }}>{h2h.A.name}</span>
                    <b className="text-white/80"> {h2h.aw}</b>
                    <span className="text-white/40"> : </span>
                    <b className="text-white/80">{h2h.bw} </b>
                    <span style={{ color: COLORS[1] }}>{h2h.B.name}</span>
                    <span className="text-white/50">
                      {"  →  "}
                      {h2h.aw > h2h.bw ? `${h2h.A.name} 우세` : h2h.bw > h2h.aw ? `${h2h.B.name} 우세` : "백중"}
                    </span>
                  </div>
                  <table className="w-full text-sm border-collapse min-w-[360px]">
                    <thead>
                      <tr className="text-white/45 text-xs border-b border-white/10">
                        <th className="text-left py-1.5 pr-2">지표</th>
                        <th className="px-2 text-right" style={{ color: COLORS[0] }}>{h2h.A.name}</th>
                        <th className="px-1"></th>
                        <th className="px-2 text-left" style={{ color: COLORS[1] }}>{h2h.B.name}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h2h.list.map((m) => {
                        const fa = m.a == null ? "—" : m.pct ? fmtPct(m.a) : Math.round(m.a as number).toString();
                        const fb = m.b == null ? "—" : m.pct ? fmtPct(m.b) : Math.round(m.b as number).toString();
                        return (
                          <tr key={m.label} className="border-b border-white/5">
                            <td className="py-1.5 pr-2 text-white/60">{m.label}</td>
                            <td className="px-2 text-right tabular-nums font-semibold"
                              style={{ background: m.w === "A" ? `${COLORS[0]}22` : "", color: m.w === "A" ? COLORS[0] : "rgba(255,255,255,0.75)" }}>{fa}</td>
                            <td className="px-1 text-center text-white/40">{m.w === "A" ? "◀" : m.w === "B" ? "▶" : "·"}</td>
                            <td className="px-2 text-left tabular-nums font-semibold"
                              style={{ background: m.w === "B" ? `${COLORS[1]}22` : "", color: m.w === "B" ? COLORS[1] : "rgba(255,255,255,0.75)" }}>{fb}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-white/35 mt-1">점수·수익률 모두 높을수록 우세(Risk는 높을수록 안정). ◀/▶ 는 우세 쪽.</p>
                </div>
              )}
            </div>

            {/* 포지셔닝 산점도 — 전체 폭 단독 섹션 */}
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 mb-5">
              <div className="text-sm font-semibold text-white/80 mb-1">포지셔닝 산점도 <span className="text-white/40 font-normal">(Health × Momentum · 배경=전 테마{snapshot?.date ? ` ${snapshot.date}` : ""})</span></div>
              <ResponsiveContainer width="100%" height={480}>
                <ScatterChart margin={{ top: 10, right: 24, bottom: 12, left: -6 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" dataKey="x" domain={[0, 1000]} name="Health"
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} label={{ value: "Health →", position: "insideBottomRight", fill: "rgba(255,255,255,0.45)", fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" domain={[0, 1000]} name="Momentum" width={40}
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} label={{ value: "Momentum →", angle: -90, position: "insideTopLeft", fill: "rgba(255,255,255,0.45)", fontSize: 11 }} />
                  <ZAxis range={[36, 36]} />
                  <ReferenceLine x={500} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                  <ReferenceLine y={500} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                  <Tooltip cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.2)" }}
                    content={({ payload }: any) => {
                      const p = payload?.[0]?.payload;
                      if (!p) return null;
                      return (
                        <div style={{ background: "#111116", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "6px 9px", fontSize: 12 }}>
                          <div style={{ color: "#e5e7eb", fontWeight: 600 }}>{p.name}</div>
                          <div style={{ color: "rgba(255,255,255,0.6)" }}>Health {p.x} · Momentum {p.y}</div>
                        </div>
                      );
                    }} />
                  <Scatter data={bgPoints} fill="rgba(255,255,255,0.18)" />
                  <Scatter data={selPoints}>
                    {selPoints.map((p) => <Cell key={p.id} fill={p.color} />)}
                    <LabelList dataKey="name" position="top" style={{ fill: "#e5e7eb", fontSize: 11 }} />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-white/35 mt-1">우상단=펀더멘털·모멘텀 동반 강세, 좌상단=모멘텀만, 우하단=펀더멘털만, 좌하단=약세. 색점=선택 테마.</p>
            </div>

            {/* 지표 비교표 */}
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 mb-5 overflow-x-auto">
              <div className="text-sm font-semibold text-white/80 mb-2">지표 비교표 <span className="text-white/40 font-normal">({snap} 기준 바로미터 + 기간별 EW)</span></div>
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr className="text-white/45 text-xs border-b border-white/10">
                    <th className="text-left py-2 pr-2">테마</th>
                    <th className="px-2">온도</th>
                    <th className="px-2">Overall</th>
                    <th className="px-2">Health</th>
                    <th className="px-2">Mom</th>
                    <th className="px-2">Div</th>
                    <th className="px-2">Risk</th>
                    <th className="px-2">자산</th>
                    {PERIODS.map((p) => <th key={p} className="px-2 text-right">{p}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const t = typeof r.overall === "number" ? tempByScore(r.overall) : null;
                    return (
                      <tr key={r.id} className="border-b border-white/5">
                        <td className="py-2 pr-2">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i] }} />
                            <Link href={`/graph/${r.id}`} className="hover:underline">{r.name}</Link>
                          </span>
                          {r.note && <div className="text-[11px] text-amber-400/70 mt-0.5">{r.note}</div>}
                        </td>
                        <td className="px-2 text-center">
                          {t ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
                              style={{ background: `${t.color}33`, color: t.color, border: `1px solid ${t.color}66` }}>
                              {t.name}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-2 text-center font-semibold" style={{ color: scoreColor(r.overall) }}>{r.overall ?? "—"}</td>
                        <td className="px-2 text-center text-white/70">{r.health ?? "—"}</td>
                        <td className="px-2 text-center text-white/70">{r.momentum ?? "—"}</td>
                        <td className="px-2 text-center text-white/70">{r.div ?? "—"}</td>
                        <td className="px-2 text-center text-white/70">{r.risk ?? "—"}</td>
                        <td className="px-2 text-center text-white/50">{r.assetCount || "—"}</td>
                        {PERIODS.map((p) => {
                          const v = r.ewByPeriod[p];
                          return (
                            <td key={p} className="px-2 text-right tabular-nums"
                              style={{ color: v == null ? "#6b7280" : v >= 0 ? "#4ade80" : "#f87171" }}>
                              {fmtPct(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 자산 중복도 */}
            {rows.length >= 2 && (
              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <div className="text-sm font-semibold text-white/80 mb-2">자산 중복도 <span className="text-white/40 font-normal">(겹치는 종목 · Jaccard)</span></div>
                <div className="flex flex-wrap gap-2">
                  {overlaps.map((o) => (
                    <span key={`${o.a}-${o.b}`} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02]"
                      style={{ color: o.inter > 0 ? "#fca5a5" : "rgba(255,255,255,0.45)" }}>
                      {nameOf(o.a)} ∩ {nameOf(o.b)}: <b>{o.inter}종</b> ({(o.jac * 100).toFixed(0)}%)
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-white/35 mt-2">겹치는 종목이 많을수록 두 테마를 함께 담아도 분산 효과가 작습니다.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
