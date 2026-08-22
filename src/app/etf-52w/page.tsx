"use client";

// ETF-only 52주 이평선 트래킹 — 상장 ETF만 대상으로 52주 고점比·이동평균선(5/20/60/120)·국면(버킷)·신호를 브리핑.
// 데이터: kang0302/import_MT/main/data/ma_brief/assets.json (전체 자산 MA, 매일 GitHub Actions 갱신)
//         + etf_tickers.json (asset_type=ETF 티커 목록, 같은 폴더)

import React, { useEffect, useMemo, useState } from "react";

const BASE_DIR = "/api/raw/data/ma_brief";
const ASSETS_URL = `${BASE_DIR}/assets.json`;
const ETF_URL = `${BASE_DIR}/etf_tickers.json`;
const ETF_DESC_URL = `${BASE_DIR}/etf_desc.json`;

type Row = {
  sector: string; name: string; ticker: string; country: string; link: string;
  close: number | null; g5: number | null; g20: number | null; g60: number | null;
  g120: number | null; hg: number | null; align: string; above: number;
  bucket: string; bucketLabel: string; seq7: string; signal: string; interp: string;
  themes?: string[];
};
type Payload = {
  asof: string; generated: string; count: number;
  buckets: Record<string, string>; items: Record<string, Row>;
};

const BUCKET_ORDER = ["b1", "b2", "b3", "b4", "b5", "b6", "na"];
const ALIGN_LABEL: Record<string, string> = { bull: "🟢 정배열", flat: "⚪ 혼조", bear: "🔴 역배열", na: "—" };

const BUCKET_DEF: { key: string; logic: string; note: string; color: string }[] = [
  { key: "b1", logic: "정배열 + 종가가 5·20·60·120 전부 상회", note: "추세·가격 모두 최강 — 실질 주도 ETF", color: "#22c55e" },
  { key: "b2", logic: "정배열 + 단기 이평선 일부 이탈(1~3개 상회)", note: "상승추세 유지 중 조정 구간", color: "#84cc16" },
  { key: "b3", logic: "정배열 + 종가가 전 이평선 하회", note: "추세는 정배열이나 가격 붕괴 신호", color: "#f59e0b" },
  { key: "b4", logic: "혼조 + 종가가 이평선 과반(2개↑) 상회", note: "정배열 전환 후보 — 반등 초입", color: "#38bdf8" },
  { key: "b5", logic: "혼조·역배열 + 종가가 전 이평선 하회(혼조는 1개 이하)", note: "실질 하락추세 — 가장 약함", color: "#60a5fa" },
  { key: "b6", logic: "역배열 + 종가가 이평선 위(1개↑ 상회)", note: "바닥 반전 초기 — 저점 매수 관찰", color: "#a78bfa" },
];

function gapColor(v: number | null): string {
  if (v == null) return "#94a3b8";
  return v >= 0 ? "#f87171" : "#60a5fa";
}
function fmtGap(v: number | null): string {
  if (v == null) return "—";
  const arrow = v >= 0 ? "▲" : "▼";
  const sign = v >= 0 ? "+" : "";
  return `${arrow} ${sign}${v.toFixed(1)}%`;
}
// 외부 시세 링크 — 구글파이낸스는 거래소코드 불일치 시 빈 페이지가 잦아,
// US는 거래소 불필요·커버리지 넓은 Yahoo Finance, KR은 네이버(기존 link) 사용.
function linkFor(r: Row): string {
  const co = (r.country || "").toUpperCase();
  const tk = (r.ticker || "").trim();
  if (co === "KR") return r.link || `https://finance.naver.com/item/main.naver?code=${tk}`;
  if (!tk) return r.link || "#";
  return `https://finance.yahoo.com/quote/${encodeURIComponent(tk)}`;
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
      {(s || "").split("").map((c, i) =>
        c === "▲" ? <span key={i} style={{ color: "#f87171" }}>▲</span> :
        c === "▼" ? <span key={i} style={{ color: "#60a5fa" }}>▼</span> :
        <span key={i} style={{ color: "#64748b" }}>{c}</span>
      )}
    </span>
  );
}

type SortKey = "bucket" | "close" | "g5" | "g20" | "g60" | "g120" | "hg" | "name" | "country";

import MaCrossSummary from "@/components/MaCrossSummary";
export default function Etf52wPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [etfSet, setEtfSet] = useState<Set<string> | null>(null);
  const [descMap, setDescMap] = useState<Record<string, string>>({});
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");
  const [nonce, setNonce] = useState(0);

  const [bucketF, setBucketF] = useState<string>("all");
  const [countryF, setCountryF] = useState<string>("all");
  const [alignF, setAlignF] = useState<string>("all");
  const [q, setQ] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("hg");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const [ra, re, rd] = await Promise.all([
          fetch(`${ASSETS_URL}?_cb=${Date.now()}`, { cache: "no-store" }),
          fetch(`${ETF_URL}?_cb=${Date.now()}`, { cache: "no-store" }),
          fetch(`${ETF_DESC_URL}?_cb=${Date.now()}`, { cache: "no-store" }),
        ]);
        if (!ra.ok) { if (!cancelled) setState(ra.status === 404 ? "empty" : "error"); return; }
        const j = (await ra.json()) as Payload;
        let etf: Set<string> | null = null;
        if (re.ok) {
          const ej = await re.json();
          etf = new Set<string>((ej?.tickers ?? []).map(String));
        }
        let desc: Record<string, string> = {};
        if (rd.ok) { try { desc = (await rd.json()) as Record<string, string>; } catch { desc = {}; } }
        if (!cancelled) {
          setData(j);
          setEtfSet(etf);
          setDescMap(desc);
          setState(j?.items && Object.keys(j.items).length ? "ok" : "empty");
        }
      } catch { if (!cancelled) setState("error"); }
    })();
    return () => { cancelled = true; };
  }, [nonce]);

  // 전체 자산 → ETF만 (etf_tickers.json 없으면 이름에 ETF 포함으로 폴백)
  const universe = useMemo(() => {
    const all = data ? Object.values(data.items) : [];
    if (etfSet && etfSet.size) return all.filter((r) => etfSet.has(String(r.ticker)));
    return all.filter((r) => /ETF|KODEX|TIGER|ACE |PLUS |RISE |SOL |KBSTAR|HANARO|KOSEF|ARIRANG|iShares|SPDR|Vanguard|Invesco|Global X|ARK/i.test(r.name || ""));
  }, [data, etfSet]);

  const summary = useMemo(() => {
    const s = { bull: 0, flat: 0, bear: 0, up: 0, dn: 0 };
    universe.forEach((r) => {
      if (r.align === "bull") s.bull++; else if (r.align === "bear") s.bear++; else s.flat++;
      if (r.g20 != null && r.g20 >= 0) s.up++; else if (r.g20 != null) s.dn++;
    });
    return s;
  }, [universe]);

  const countries = useMemo(() => {
    const s = new Set<string>();
    universe.forEach((r) => r.country && s.add(r.country));
    return Array.from(s).sort();
  }, [universe]);

  const rows = useMemo(() => {
    let rs = universe.slice();
    if (bucketF !== "all") rs = rs.filter((r) => r.bucket === bucketF);
    if (countryF !== "all") rs = rs.filter((r) => r.country === countryF);
    if (alignF !== "all") rs = rs.filter((r) => r.align === alignF);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      rs = rs.filter((r) => (r.name + " " + r.ticker + " " + r.country).toLowerCase().includes(t));
    }
    const num = (v: number | null) => (v == null ? Number.NEGATIVE_INFINITY : v);
    rs.sort((a, b) => {
      let c = 0;
      if (sortKey === "bucket") {
        c = BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket);
        if (c === 0) c = b.above - a.above;
        if (c === 0) c = num(b.hg) - num(a.hg);
      } else if (sortKey === "name" || sortKey === "country") {
        c = String(a[sortKey]).localeCompare(String(b[sortKey]));
      } else {
        c = num(a[sortKey as keyof Row] as number | null) - num(b[sortKey as keyof Row] as number | null);
      }
      return sortDir === "asc" ? c : -c;
    });
    return rs;
  }, [universe, bucketF, countryF, alignF, q, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "bucket" || k === "name" || k === "country" ? "asc" : "desc"); }
  };
  const Arrow = ({ k }: { k: SortKey }) => sortKey === k ? <span className="text-amber-300">{sortDir === "asc" ? " ▲" : " ▼"}</span> : null;

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <a href="/" className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">← 홈으로</a>
            <h1 className="text-lg font-semibold text-white/90">📊 ETF 52주 이평선 트래킹</h1>
          </div>
          <button onClick={() => setNonce((n) => n + 1)}
            className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10">새로고침</button>
        </div>

        <MaCrossSummary />

        {state === "loading" && <div className="text-white/50">불러오는 중…</div>}
        {state === "error" && <div className="text-rose-300/80">브리핑을 불러오지 못했습니다.</div>}
        {state === "empty" && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-white/60">아직 생성된 데이터가 없습니다.</div>}

        {state === "ok" && data && (
          <>
            <div className="mb-3 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.06] px-3 py-2 text-xs text-cyan-100/80">
              전체 자산 <b className="text-white/90">{data.count}</b>종 중 <b className="text-cyan-200">상장 ETF {universe.length}</b>종만 대상으로 <b className="text-white/90">52주 고점比·이동평균선(5/20/60/120)</b>을 트래킹합니다.
            </div>
            <div className="mb-3 text-xs text-white/60">
              기준일(전일 종가) <b className="text-white/80">{data.asof}</b> · 생성 {data.generated}
              {" · "}🟢 정배열 <b>{summary.bull}</b> · ⚪ 혼조 <b>{summary.flat}</b> · 🔴 역배열 <b>{summary.bear}</b> · 20일선 상회 <b>{summary.up}</b>/하회 <b>{summary.dn}</b>
            </div>

            <div className="mb-3">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40">🔍</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ETF명 · 티커 · 국가 검색…"
                  className="w-full rounded-xl border border-white/15 bg-black/40 py-2.5 pl-9 pr-24 text-sm text-white/90 outline-none focus:border-white/30 placeholder:text-white/30"
                />
                {q ? (
                  <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-0.5 text-xs text-white/50 hover:bg-white/10 hover:text-white/85">✕ 지우기</button>
                ) : null}
              </div>
              {q ? <div className="mt-1 text-[11px] text-white/45">“{q}” 검색 결과 <b className="text-white/70">{rows.length}</b>종목</div> : null}
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <select value={bucketF} onChange={(e) => setBucketF(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-white/80 outline-none">
                <option value="all">버킷 전체</option>
                {BUCKET_ORDER.filter((b) => universe.some((r) => r.bucket === b)).map((b) => (
                  <option key={b} value={b}>{data.buckets[b]} ({universe.filter((r) => r.bucket === b).length})</option>
                ))}
              </select>
              <select value={countryF} onChange={(e) => setCountryF(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-white/80 outline-none">
                <option value="all">국가 전체</option>
                {countries.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={alignF} onChange={(e) => setAlignF(e.target.value)} className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-white/80 outline-none">
                <option value="all">배열 전체</option>
                <option value="bull">🟢 정배열</option>
                <option value="flat">⚪ 혼조</option>
                <option value="bear">🔴 역배열</option>
              </select>
              <span className="text-white/40">{rows.length}종목</span>
              {(bucketF !== "all" || countryF !== "all" || alignF !== "all" || q) && (
                <button onClick={() => { setBucketF("all"); setCountryF("all"); setAlignF("all"); setQ(""); }} className="text-amber-300/80 underline">초기화</button>
              )}
            </div>

            <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {BUCKET_DEF.map((b) => {
                const cnt = universe.filter((r) => r.bucket === b.key).length;
                const active = bucketF === b.key;
                return (
                  <button key={b.key} onClick={() => setBucketF(active ? "all" : b.key)}
                    className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${active ? "border-white/40 bg-white/[0.08]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"}`}
                    title={active ? "필터 해제" : "이 버킷만 보기"}>
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
                    <Th onClick={() => onSort("country")}>국가<Arrow k="country" /></Th>
                    <Th onClick={() => onSort("name")}>ETF<Arrow k="name" /></Th>
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
                    <Th>테마</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.ticker + i} className="border-t border-white/5 hover:bg-white/[0.03]" title={r.interp}>
                      <td className="px-2 py-1 text-white/50">{r.country}</td>
                      <td className="px-2 py-1">
                        <a
                          href={linkFor(r)}
                          target="_blank"
                          rel="noreferrer"
                          title={descMap[r.ticker] || r.name}
                          className="text-sky-400 hover:underline"
                        >
                          {r.name} ({r.ticker})
                        </a>
                        {descMap[r.ticker] ? <span className="ml-1 cursor-help text-white/30" title={descMap[r.ticker]}>ⓘ</span> : null}
                      </td>
                      <td className="px-2 py-1 text-right text-white/80">{r.close != null ? r.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                      <td className="px-2 py-1 text-right" style={{ color: gapColor(r.g5) }}>{fmtGap(r.g5)}</td>
                      <td className="px-2 py-1 text-right" style={{ color: gapColor(r.g20) }}>{fmtGap(r.g20)}</td>
                      <td className="px-2 py-1 text-right" style={{ color: gapColor(r.g60) }}>{fmtGap(r.g60)}</td>
                      <td className="px-2 py-1 text-right" style={{ color: gapColor(r.g120) }}>{fmtGap(r.g120)}</td>
                      <td className="px-2 py-1 text-right font-semibold" style={{ color: highColor(r.hg) }}>{r.hg != null ? `${r.hg >= 0 ? "+" : ""}${r.hg.toFixed(1)}%` : "—"}</td>
                      <td className="px-2 py-1">{ALIGN_LABEL[r.align] || r.align}</td>
                      <td className="px-2 py-1 font-semibold text-white/90">{r.bucketLabel}</td>
                      <td className="px-2 py-1"><Seq7 s={r.seq7} /></td>
                      <td className="px-2 py-1 text-white/60">{r.signal}</td>
                      <td className="px-2 py-1 align-middle">
                        <span className="flex items-center gap-1">
                          {(r.themes || []).slice(0, 4).map((tid) => (
                            <a
                              key={tid}
                              href={`/graph/${tid}`}
                              target="_blank"
                              rel="noreferrer"
                              title={`${tid} 그래프 보기`}
                              className="shrink-0 rounded border border-indigo-400/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-indigo-200 hover:border-indigo-300/60 hover:bg-indigo-500/25"
                            >
                              {tid.replace(/^T_/, "")}
                            </a>
                          ))}
                          {(r.themes || []).length > 4 && (
                            <span
                              title={(r.themes || []).slice(4).map((t) => t.replace(/^T_/, "")).join(", ")}
                              className="shrink-0 px-1 py-0.5 text-[10.5px] text-white/40"
                            >
                              +{(r.themes || []).length - 4}
                            </span>
                          )}
                          {(!r.themes || r.themes.length === 0) && <span className="text-white/25">—</span>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/40">
              <b className="text-white/60">상장 ETF만</b> 대상(asset_type=ETF). ▲(적) 상회·상승 / ▼(청) 하회·하락. 52주高比=1년 최고종가 대비 격차(0%에 가까울수록 신고가). vs N일=N일 이동평균선 대비 이격. 버킷=이평선 배열·가격 위치 6국면. 헤더 클릭 시 정렬(재클릭=방향전환). 행에 마우스를 올리면 해석이 뜹니다.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Th({ children, onClick, right }: { children: React.ReactNode; onClick?: () => void; right?: boolean }) {
  return (
    <th onClick={onClick}
      className={`px-2 py-1.5 font-semibold ${right ? "text-right" : "text-left"} ${onClick ? "cursor-pointer select-none hover:text-white" : ""}`}>
      {children}
    </th>
  );
}
