"use client";

// 관심종목 이동평균선 데일리 브리핑 — 인터랙티브 뷰어.
// 데이터: kang0302/import_MT/main/data/ma_brief/latest.json (매일 GitHub Actions 로 갱신)
// 기능: 이평선 격차/52주高 정렬, 버킷·섹터·배열 필터, 날짜 아카이브.

import React, { useEffect, useMemo, useState } from "react";

const BASE_DIR =
  "https://raw.githubusercontent.com/kang0302/import_MT/main/data/ma_brief";
const INDEX_URL = `${BASE_DIR}/index.json`;

type Row = {
  sector: string; name: string; ticker: string; country: string; link: string;
  close: number | null; g5: number | null; g20: number | null; g60: number | null;
  g120: number | null; hg: number | null; align: string; above: number;
  bucket: string; bucketLabel: string; seq7: string; signal: string; interp: string;
};
type Payload = {
  asof: string; generated: string; count: number;
  summary: { bull: number; flat: number; bear: number; up: number; dn: number; break: number; lose: number };
  buckets: Record<string, string>; items: Row[];
};
type ArchiveEntry = { date: string };

const BUCKET_ORDER = ["b1", "b2", "b3", "b4", "b5", "b6", "na"];
const ALIGN_LABEL: Record<string, string> = { bull: "🟢 정배열", flat: "⚪ 혼조", bear: "🔴 역배열", na: "—" };

// 저스틴 프레임 6버킷: 배열(정배열/혼조/역배열) × 종가의 이평선(5·20·60·120) 상회 개수
const BUCKET_DEF: { key: string; logic: string; note: string; color: string }[] = [
  { key: "b1", logic: "정배열 + 종가가 5·20·60·120 전부 상회", note: "추세·가격 모두 최강 — 실질 주도주", color: "#22c55e" },
  { key: "b2", logic: "정배열 + 단기 이평선 일부 이탈(1~3개 상회)", note: "상승추세 유지 중 조정 구간", color: "#84cc16" },
  { key: "b3", logic: "정배열 + 종가가 전 이평선 하회", note: "추세는 정배열이나 가격 붕괴 신호", color: "#f59e0b" },
  { key: "b4", logic: "혼조 + 종가가 이평선 과반(2개↑) 상회", note: "정배열 전환 후보 — 반등 초입", color: "#38bdf8" },
  { key: "b5", logic: "혼조·역배열 + 종가가 전 이평선 하회(혼조는 1개 이하)", note: "실질 하락추세 — 가장 약함", color: "#60a5fa" },
  { key: "b6", logic: "역배열 + 종가가 이평선 위(1개↑ 상회)", note: "바닥 반전 초기 — 저점 매수 관찰", color: "#a78bfa" },
];

function gapColor(v: number | null): string {
  if (v == null) return "#94a3b8";
  return v >= 0 ? "#f87171" : "#60a5fa"; // 상승/상회=적, 하락/하회=청
}
function fmtGap(v: number | null): string {
  if (v == null) return "—";
  const arrow = v >= 0 ? "▲" : "▼";
  const sign = v >= 0 ? "+" : "";
  return `${arrow} ${sign}${v.toFixed(1)}%`;
}
function highColor(v: number | null): string {
  if (v == null) return "#94a3b8";
  if (v >= -3) return "#f87171";
  if (v <= -20) return "#60a5fa";
  return "#cbd5e1";
}
function Seq7({ s }: { s: string }) {
  return (
    <span>
      {s.split("").map((c, i) =>
        c === "▲" ? <span key={i} style={{ color: "#f87171" }}>▲</span> :
        c === "▼" ? <span key={i} style={{ color: "#60a5fa" }}>▼</span> :
        <span key={i} style={{ color: "#64748b" }}>{c}</span>
      )}
    </span>
  );
}

type SortKey = "bucket" | "close" | "g5" | "g20" | "g60" | "g120" | "hg" | "name" | "sector";

export default function MaBriefPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");
  const [dates, setDates] = useState<ArchiveEntry[]>([]);
  const [sel, setSel] = useState<string>("latest");
  const [nonce, setNonce] = useState(0);

  const [bucketF, setBucketF] = useState<string>("all");
  const [sectorF, setSectorF] = useState<string>("all");
  const [alignF, setAlignF] = useState<string>("all");
  const [q, setQ] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("bucket");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${INDEX_URL}?_cb=${Date.now()}`, { cache: "no-store" });
        if (r.ok) { const j = await r.json(); if (Array.isArray(j)) setDates(j); }
      } catch { /* index 없으면 최신만 */ }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    const url = sel === "latest" ? `${BASE_DIR}/latest.json` : `${BASE_DIR}/${sel}.json`;
    (async () => {
      try {
        const r = await fetch(`${url}?_cb=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) { if (!cancelled) setState(r.status === 404 ? "empty" : "error"); return; }
        const j = (await r.json()) as Payload;
        if (!cancelled) { setData(j); setState(j?.items?.length ? "ok" : "empty"); }
      } catch { if (!cancelled) setState("error"); }
    })();
    return () => { cancelled = true; };
  }, [sel, nonce]);

  const sectors = useMemo(() => {
    const s = new Set<string>();
    (data?.items || []).forEach((r) => r.sector && s.add(r.sector));
    return Array.from(s).sort();
  }, [data]);

  const rows = useMemo(() => {
    let rs = (data?.items || []).slice();
    if (bucketF !== "all") rs = rs.filter((r) => r.bucket === bucketF);
    if (sectorF !== "all") rs = rs.filter((r) => r.sector === sectorF);
    if (alignF !== "all") rs = rs.filter((r) => r.align === alignF);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      rs = rs.filter((r) => (r.name + " " + r.ticker + " " + r.sector).toLowerCase().includes(t));
    }
    const num = (v: number | null) => (v == null ? Number.NEGATIVE_INFINITY : v);
    rs.sort((a, b) => {
      let c = 0;
      if (sortKey === "bucket") {
        c = BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket);
        if (c === 0) c = b.above - a.above;
        if (c === 0) c = num(b.hg) - num(a.hg);
      } else if (sortKey === "name" || sortKey === "sector") {
        c = String(a[sortKey]).localeCompare(String(b[sortKey]));
      } else {
        c = num(a[sortKey as keyof Row] as number | null) - num(b[sortKey as keyof Row] as number | null);
      }
      return sortDir === "asc" ? c : -c;
    });
    return rs;
  }, [data, bucketF, sectorF, alignF, q, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "bucket" || k === "name" || k === "sector" ? "asc" : "desc"); }
  };
  const Arrow = ({ k }: { k: SortKey }) => sortKey === k ? <span className="text-amber-300">{sortDir === "asc" ? " ▲" : " ▼"}</span> : null;

  const sum = data?.summary;

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <a href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">← 홈으로</a>
            <h1 className="text-lg font-semibold text-white/90">📈 이동평균선 브리핑</h1>
          </div>
          <div className="flex items-center gap-2">
            <select value={sel} onChange={(e) => setSel(e.target.value)}
              className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-xs text-white/80 outline-none" title="날짜 선택">
              <option value="latest">최신</option>
              {dates.map((d) => <option key={d.date} value={d.date}>{d.date}</option>)}
            </select>
            <button onClick={() => setNonce((n) => n + 1)}
              className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">새로고침</button>
          </div>
        </div>

        {state === "loading" && <div className="text-white/50">불러오는 중…</div>}
        {state === "error" && <div className="text-rose-300/80">브리핑을 불러오지 못했습니다.</div>}
        {state === "empty" && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-white/60">아직 생성된 브리핑이 없습니다.</div>}

        {state === "ok" && data && (
          <>
            <div className="mb-3 text-xs text-white/60">
              기준일(전일 종가) <b className="text-white/80">{data.asof}</b> · 종목 {data.count}개 · 생성 {data.generated}
              {sum && <> · 🟢 정배열 <b>{sum.bull}</b> · ⚪ 혼조 <b>{sum.flat}</b> · 🔴 역배열 <b>{sum.bear}</b> · 20일선 상회 <b>{sum.up}</b>/하회 <b>{sum.dn}</b></>}
              {sel !== "latest" && <span className="ml-2 text-amber-300/80">📅 {sel} 지난 브리핑</span>}
            </div>

            {/* 종목 검색창 */}
            <div className="mb-3">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40">🔍</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="종목명 · 티커 · 섹터 검색…"
                  className="w-full rounded-xl border border-white/15 bg-black/40 py-2.5 pl-9 pr-24 text-sm text-white/90 outline-none focus:border-white/30 placeholder:text-white/30"
                />
                {q ? (
                  <button
                    onClick={() => setQ("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-0.5 text-xs text-white/50 hover:bg-white/10 hover:text-white/85"
                  >
                    ✕ 지우기
                  </button>
                ) : null}
              </div>
              {q ? (
                <div className="mt-1 text-[11px] text-white/45">
                  “{q}” 검색 결과 <b className="text-white/70">{rows.length}</b>종목
                </div>
              ) : null}
            </div>

            {/* 필터 바 */}
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <select value={bucketF} onChange={(e) => setBucketF(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-white/80 outline-none">
                <option value="all">버킷 전체</option>
                {BUCKET_ORDER.filter((b) => b !== "na" || (data.items.some((r) => r.bucket === "na"))).map((b) => (
                  <option key={b} value={b}>{data.buckets[b]} ({data.items.filter((r) => r.bucket === b).length})</option>
                ))}
              </select>
              <select value={sectorF} onChange={(e) => setSectorF(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-white/80 outline-none">
                <option value="all">섹터 전체</option>
                {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={alignF} onChange={(e) => setAlignF(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-white/80 outline-none">
                <option value="all">배열 전체</option>
                <option value="bull">🟢 정배열</option>
                <option value="flat">⚪ 혼조</option>
                <option value="bear">🔴 역배열</option>
              </select>
              <span className="text-white/40">{rows.length}종목</span>
              {(bucketF !== "all" || sectorF !== "all" || alignF !== "all" || q) && (
                <button onClick={() => { setBucketF("all"); setSectorF("all"); setAlignF("all"); setQ(""); }} className="text-amber-300/80 underline">초기화</button>
              )}
            </div>

            {/* 버킷 정의 논리 — 클릭 시 해당 버킷 필터 */}
            <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {BUCKET_DEF.map((b) => {
                const cnt = data.items.filter((r) => r.bucket === b.key).length;
                const active = bucketF === b.key;
                return (
                  <button
                    key={b.key}
                    onClick={() => setBucketF(active ? "all" : b.key)}
                    className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${active ? "border-white/40 bg-white/[0.08]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"}`}
                    title={active ? "필터 해제" : "이 버킷만 보기"}
                  >
                    <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <b className="text-[12.5px] text-white/90">{data.buckets[b.key]}</b>
                        <span className="text-[11px] text-white/40">{cnt}종목</span>
                      </span>
                      <span className="block text-[11px] leading-snug text-white/55">{b.logic}</span>
                      <span className="block text-[10.5px] leading-snug text-white/35">→ {b.note}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full border-collapse text-[12.5px] whitespace-nowrap">
                <thead>
                  <tr className="bg-white/[0.05] text-white/80">
                    <Th onClick={() => onSort("sector")}>섹터<Arrow k="sector" /></Th>
                    <Th onClick={() => onSort("name")}>종목<Arrow k="name" /></Th>
                    <Th onClick={() => onSort("close")} right>종가<Arrow k="close" /></Th>
                    <Th onClick={() => onSort("g5")} right>vs 5일<Arrow k="g5" /></Th>
                    <Th onClick={() => onSort("g20")} right>vs 20일<Arrow k="g20" /></Th>
                    <Th onClick={() => onSort("g60")} right>vs 60일<Arrow k="g60" /></Th>
                    <Th onClick={() => onSort("g120")} right>vs 120일<Arrow k="g120" /></Th>
                    <Th onClick={() => onSort("hg")} right>52주高比<Arrow k="hg" /></Th>
                    <Th>배열</Th>
                    <Th onClick={() => onSort("bucket")}>버킷<Arrow k="bucket" /></Th>
                    <Th>최근7일</Th>
                    <Th>오늘 신호</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.ticker + i} className="border-t border-white/5 hover:bg-white/[0.03]" title={r.interp}>
                      <td className="px-2 py-1 text-indigo-300/90">{r.sector}</td>
                      <td className="px-2 py-1">
                        <a href={r.link} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">{r.name} ({r.ticker})</a>
                      </td>
                      <td className="px-2 py-1 text-right text-white/80">{r.close != null ? r.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                      <td className="px-2 py-1 text-right" style={{ color: gapColor(r.g5) }}>{fmtGap(r.g5)}</td>
                      <td className="px-2 py-1 text-right" style={{ color: gapColor(r.g20) }}>{fmtGap(r.g20)}</td>
                      <td className="px-2 py-1 text-right" style={{ color: gapColor(r.g60) }}>{fmtGap(r.g60)}</td>
                      <td className="px-2 py-1 text-right" style={{ color: gapColor(r.g120) }}>{fmtGap(r.g120)}</td>
                      <td className="px-2 py-1 text-right" style={{ color: highColor(r.hg) }}>{r.hg != null ? `${r.hg >= 0 ? "+" : ""}${r.hg.toFixed(1)}%` : "—"}</td>
                      <td className="px-2 py-1">{ALIGN_LABEL[r.align] || r.align}</td>
                      <td className="px-2 py-1 font-semibold text-white/90">{r.bucketLabel}</td>
                      <td className="px-2 py-1"><Seq7 s={r.seq7} /></td>
                      <td className="px-2 py-1 text-white/60">{r.signal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/40">
              ▲(적) 상회·상승 / ▼(청) 하회·하락. 52주高比=1년 최고종가 대비 격차. 헤더 클릭 시 해당 컬럼 정렬(재클릭=방향전환). 행에 마우스를 올리면 해석이 뜹니다. 버킷 정의는 상단 범례 참고(카드 클릭 시 필터).
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Th({ children, onClick, right }: { children: React.ReactNode; onClick?: () => void; right?: boolean }) {
  return (
    <th
      onClick={onClick}
      className={`px-2 py-1.5 font-semibold ${right ? "text-right" : "text-left"} ${onClick ? "cursor-pointer select-none hover:text-white" : ""}`}
    >
      {children}
    </th>
  );
}
