"use client";

// src/components/ThemeBriefing.tsx
// 테마 그래프 하단에 붙는 markdown briefing 섹션.
// 데이터 소스: GitHub raw — kang0302/import_MT/main/data/briefing/{themeId}.md
// 없으면 조용히 숨김 (그래프만 표시).
// briefing 의 본문 표 각 행에서 첫 셀의 ticker 를 추출 → 9개 기간 수익률 컬럼(3년/2년/1년/YTD/1개월/15일/7일/3일/1일) 자동 부착.

import React, { Children, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type EventDbRow = {
  name: string;
  period: string;
  direction: "수혜" | "타격" | "진행중";
  rawDirection: string;
  mechanism: string;
  duration: string;
  recovery: string;
  intensity: 1 | 2 | 3; // 1=중, 2=강, 3=매우강
};

function classifyDirection(s: string): EventDbRow["direction"] {
  if (/⚠|진행중|양면|미정/.test(s)) return "진행중";
  if (/📉|타격|하락|폭락/.test(s)) return "타격";
  if (/📈|수혜|상승|급등/.test(s)) return "수혜";
  return "진행중";
}

function classifyIntensity(directionCell: string, mechanism: string): EventDbRow["intensity"] {
  const text = `${directionCell} ${mechanism}`;
  if (/매우 강|강력|메가|폭증|사상 최대|폭락|폭등/.test(text)) return 3;
  if (/단기|일부|부분|미미|중립/.test(text)) return 1;
  return 2;
}

function parseEventDb(md: string | null): { briefingMd: string; eventDbRows: EventDbRow[] } {
  if (!md) return { briefingMd: "", eventDbRows: [] };
  const headingRe = /^---\s*\n\s*##\s*이벤트\s*[×x]\s*테마\s*DB.*$/im;
  const m = md.match(headingRe);
  if (!m) return { briefingMd: md, eventDbRows: [] };
  const idx = md.indexOf(m[0]);
  const before = md.slice(0, idx).trimEnd();
  const after = md.slice(idx + m[0].length);

  // table 행 파싱 — 헤더 + separator + 7 데이터 행
  const lines = after.split("\n").map((l) => l.trim()).filter(Boolean);
  const dataLines = lines.filter(
    (l) => l.startsWith("|") && !/^\|[\s:|-]+\|$/.test(l) && !/이벤트명/.test(l),
  );
  const rows: EventDbRow[] = [];
  for (const line of dataLines) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 6) continue;
    const [name, period, dirRaw, mechanism, duration, recovery] = cells;
    rows.push({
      name,
      period,
      direction: classifyDirection(dirRaw),
      rawDirection: dirRaw,
      mechanism,
      duration,
      recovery,
      intensity: classifyIntensity(dirRaw, mechanism),
    });
  }
  return { briefingMd: before, eventDbRows: rows };
}

// 한국 시장 컨벤션 (BAROMETER 우측 패널과 동일): 수혜/상승=적색, 타격/하락=청색.
const DIR_COLORS = {
  수혜: { bar: "#E24B4A", badgeBg: "#FCEBEB", badgeFg: "#922A2A" },
  타격: { bar: "#2F80ED", badgeBg: "#E7F0FC", badgeFg: "#1B4F8A" },
  진행중: { bar: "#EF9F27", badgeBg: "#FAEEDA", badgeFg: "#8A5A0E" },
} as const;

// ---------- Briefing 표 카드형 파싱 ----------

type DriverTag = { text: string; kind: "수혜" | "리스크" | "중립" };
type BriefingRow = {
  name: string;
  ticker: string;
  exchange: string;
  country: string;
  externalUrl: string;
  position: string;
  drivers: DriverTag[];
  threeYear: number | null;
  metrics: Record<string, number | null | undefined> | undefined;
};

const RISK_KEYS = /리스크|규제|경쟁|위협|하락|감소|압박|우려|역풍|악화|부담|cash burn|적자|폭락|위기|취소|분쟁|소송|위협|침투|손실|쇼크/i;
const POS_KEYS = /수요|성장|확대|증가|상승|회복|반등|호황|이익|매출|시너지|launch|침투|capex|ramp|폭발|폭증|승인|FDA|개선|확보|진출|호재|반영|수혜|sales|투자/i;

function classifyDriver(text: string): DriverTag["kind"] {
  if (RISK_KEYS.test(text)) return "리스크";
  if (POS_KEYS.test(text)) return "수혜";
  return "중립";
}

function shortenDriver(text: string): string {
  // 1) prefix 제거 + 30자 컷
  let s = text.replace(/^\d+\)\s*/, "").replace(/\*\*/g, "").trim();
  if (s.length > 28) s = s.slice(0, 27) + "…";
  return s;
}

function extractAssetUrl(ticker: string, exchange: string, country: string): string {
  const ko = /KOSPI|KOSDAQ|KRX/i.test(exchange) || country === "KR";
  if (ko && /^\d{6}$/.test(ticker)) {
    return `https://finance.naver.com/item/main.nhn?code=${ticker}`;
  }
  // 해외 — yahoo 형식 (간단)
  return `https://finance.yahoo.com/quote/${ticker}`;
}

function parseBriefingTable(
  briefingMd: string,
  tickerToNode: Map<string, AssetNode>,
): BriefingRow[] {
  if (!briefingMd) return [];
  const lines = briefingMd.split("\n");
  const rows: BriefingRow[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;
    if (/종목.*핵심 사업/.test(trimmed)) continue;
    const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;

    const firstCell = cells[0];
    // [Name (TICKER)](URL) 형식
    const nameMatch = firstCell.match(/\[([^\]]+)\]/);
    if (!nameMatch) continue;
    const nameWithTicker = nameMatch[1];
    const ticker = extractTickerFromCell(nameWithTicker);
    if (!ticker) continue;

    const assetNode = tickerToNode.get(ticker);
    const m = assetNode?.metrics;

    // 핵심 사업 셀의 첫 줄 = 포지션
    const bizCell = cells[1] || "";
    const positionMatch = bizCell.match(/-\s*([^<]+)/);
    const position = (positionMatch ? positionMatch[1] : bizCell.replace(/<br\s*\/?>/gi, " "))
      .trim()
      .slice(0, 80);

    // 동인 셀 (마지막) — "1) ...<br>2) ..." 형식
    const driverCell = cells[cells.length - 1] || "";
    const driverParts = driverCell.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean);
    const drivers: DriverTag[] = driverParts.slice(0, 4).map((p) => ({
      text: shortenDriver(p),
      kind: classifyDriver(p),
    }));

    const exposure = assetNode?.exposure;
    const exchange = exposure?.exchange ?? "";
    const country = exposure?.country ?? "";
    const externalUrl = extractAssetUrl(ticker, exchange, country);

    const threeYear =
      typeof m?.return_3y === "number" && Number.isFinite(m.return_3y) ? m.return_3y : null;

    rows.push({
      name: nameWithTicker.replace(/\s*\([^)]+\)\s*$/, "").trim(),
      ticker,
      exchange,
      country,
      externalUrl,
      position,
      drivers,
      threeYear,
      metrics: m,
    });
  }
  return rows;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function colorForPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "#9CA3AF";
  // 한국 시장 컨벤션: 양수(상승)=적색, 음수(하락)=청색.
  return v >= 0 ? "#E24B4A" : "#2F80ED";
}

// 한국 시장 컨벤션: 수혜(긍정 동인)=적색, 리스크(부정 동인)=청색.
const DRIVER_COLORS = {
  수혜: { bg: "#FCEBEB", fg: "#A32D2D" },
  리스크: { bg: "#E7F0FC", fg: "#1B4F8A" },
  중립: { bg: "rgba(255,255,255,0.06)", fg: "rgba(255,255,255,0.7)" },
} as const;

function BriefingCards({ rows }: { rows: BriefingRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r, i) => (
        <BriefingCard key={i} row={r} />
      ))}
    </div>
  );
}

function BriefingCard({ row }: { row: BriefingRow }) {
  const { metrics: m } = row;
  return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-3 backdrop-blur">
      {/* 상단: 종목명·티커 + YTD 수익률 (디폴트) */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <a
            href={row.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[14px] font-bold text-white hover:text-cyan-300 hover:underline"
          >
            {row.name}
          </a>
          <div className="mt-0.5 text-[10px] text-white/55">
            {row.ticker} {row.exchange}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="text-[14px] font-bold tabular-nums"
            style={{ color: colorForPct(m?.return_ytd) }}
          >
            {fmtPct(m?.return_ytd)}
          </div>
          <div className="text-[10px] text-white/50">YTD</div>
        </div>
      </div>

      {/* 포지션 박스 */}
      <div className="mt-2 rounded-md bg-white/4 px-2.5 py-1.5 text-[11.5px] leading-snug text-white/80">
        {row.position}
      </div>

      {/* 주요 동인 태그 */}
      {row.drivers.length > 0 && (
        <div className="mt-2">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
            주요 동인
          </div>
          <div className="flex flex-wrap gap-1.5">
            {row.drivers.map((d, idx) => {
              const c = DRIVER_COLORS[d.kind];
              return (
                <span
                  key={idx}
                  className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: c.bg, color: c.fg }}
                >
                  {d.text}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 수익률 5개: 7일 / 1개월 / YTD / 1년 / 3년 */}
      <div className="mt-2.5 grid grid-cols-5 gap-1.5 border-t border-white/8 pt-2.5">
        {[
          { label: "7일", key: "return_7d" },
          { label: "1개월", key: "return_1m" },
          { label: "YTD", key: "return_ytd" },
          { label: "1년", key: "return_1y" },
          { label: "3년", key: "return_3y" },
        ].map((p) => {
          const v = m?.[p.key];
          return (
            <div key={p.key} className="text-center">
              <div className="text-[10px] text-white/50">{p.label}</div>
              <div
                className="mt-0.5 text-[13px] font-semibold tabular-nums"
                style={{ color: colorForPct(v as number | null | undefined) }}
              >
                {fmtPct(v as number | null | undefined)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventDbCards({ rows }: { rows: EventDbRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {rows.map((r, i) => (
        <EventCard key={i} row={r} />
      ))}
    </div>
  );
}

function EventCard({ row }: { row: EventDbRow }) {
  const c = DIR_COLORS[row.direction];
  const barPct = row.intensity === 3 ? 95 : row.intensity === 2 ? 65 : 35;
  const intensityLabel = row.intensity === 3 ? "매우 강" : row.intensity === 2 ? "강" : "중";
  const dirIcon = row.direction === "수혜" ? "📈" : row.direction === "타격" ? "📉" : "⚠️";
  const recoveryClean = row.recovery.replace(/[✅⚠️]/g, "").trim();
  const isRecovered = /완전|✅/.test(row.recovery);
  const isOngoing = /진행/.test(row.recovery);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/3 p-4 backdrop-blur">
      {/* 상단: 시기 + 이벤트명 + 방향 뱃지 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-white/55">{row.period}</div>
          <div className="mt-0.5 text-[14px] font-bold leading-snug text-white">
            {row.name}
          </div>
        </div>
        <span
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold"
          style={{ backgroundColor: c.badgeBg, color: c.badgeFg }}
        >
          {dirIcon} {row.direction}
        </span>
      </div>

      {/* 중단: 충격 세기 바 */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-white/55">
          <span>충격 세기</span>
          <span className="text-white/75">{intensityLabel}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${barPct}%`, backgroundColor: c.bar }}
          />
        </div>
      </div>

      {/* 하단: 메커니즘 + 태그 */}
      <div className="flex flex-col gap-2">
        <div className="text-[12px] leading-relaxed text-white/80">
          {row.mechanism.replace(/<br\s*\/?>/gi, " · ")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md bg-white/6 px-2 py-0.5 text-[10px] text-white/70">
            {row.duration}
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-medium"
            style={
              isRecovered
                ? { backgroundColor: "#E1F5EE", color: "#0F5A41" }
                : isOngoing
                  ? { backgroundColor: "#FAEEDA", color: "#8A5A0E" }
                  : { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }
            }
          >
            {recoveryClean || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- 이벤트 DB: 시계열 타임라인(축 + 카드 리본, 왼쪽=최신) ----------

/** "2024.06~진행중" / "2025.01" / "2022.02~2023.06" → 시작 시점 파싱 */
function parseEventStart(period: string): { year: number; ym: number; ongoing: boolean } {
  const ongoing = /진행|~\s*$|현재/.test(period);
  const m = period.match(/(\d{4})[.\-/]?\s*(\d{1,2})?/);
  if (!m) return { year: 0, ym: 0, ongoing };
  const year = parseInt(m[1], 10);
  const month = m[2] ? Math.min(12, Math.max(1, parseInt(m[2], 10))) : 1;
  return { year, ym: year * 100 + month, ongoing };
}

function EventDbView({ rows }: { rows: EventDbRow[] }) {
  const [view, setView] = useState<"timeline" | "grid">("timeline");
  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-1">
        {(["timeline", "grid"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              view === v
                ? "bg-white/15 text-white"
                : "bg-white/5 text-white/55 hover:bg-white/10"
            }`}
          >
            {v === "timeline" ? "⟵ 타임라인" : "▦ 그리드"}
          </button>
        ))}
      </div>
      {view === "timeline" ? <EventDbTimeline rows={rows} /> : <EventDbCards rows={rows} />}
    </div>
  );
}

function EventDbTimeline({ rows }: { rows: EventDbRow[] }) {
  // 시작 시점 내림차순(최신 먼저 = 왼쪽) 정렬 후 연도별 그룹
  const groups = useMemo(() => {
    const enriched = rows.map((r) => ({ row: r, ...parseEventStart(r.period) }));
    enriched.sort((a, b) => (b.ongoing === a.ongoing ? b.ym - a.ym : b.ongoing ? 1 : -1));
    const byYear = new Map<number, typeof enriched>();
    for (const e of enriched) {
      const y = e.year || 0;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(e);
    }
    return Array.from(byYear.entries()).sort((a, b) => b[0] - a[0]); // 연도 내림차순
  }, [rows]);

  return (
    <div>
      {/* 방향 안내 */}
      <div className="mb-1 flex items-center justify-between text-[10px] text-white/40">
        <span>◀ 최근</span>
        <span>과거 ▶</span>
      </div>
      {/* 가로 스크롤: 연도 컬럼(왼=최신) */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {groups.map(([year, items]) => (
          <div key={year} className="flex min-w-[248px] shrink-0 flex-col">
            {/* 연도 축 눈금 */}
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-[12px] font-bold tabular-nums text-white/85">
                {year || "—"}
              </span>
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] text-white/40">{items.length}건</span>
            </div>
            {/* 해당 연도 이벤트 카드들 (세로 스택) */}
            <div className="flex flex-col gap-2.5">
              {items.map(({ row, ongoing }, i) => (
                <div key={i} className="relative">
                  {ongoing && (
                    <span
                      className="absolute -left-1 top-3 z-10 h-2 w-2 rounded-full ring-2 ring-black/40"
                      style={{ backgroundColor: DIR_COLORS[row.direction].bar }}
                      title="진행중 (현재까지)"
                    />
                  )}
                  <EventCard row={row} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBriefingUrl, getBriefingFallbackUrl } from "@/lib/getBriefingUrl";
import { extractReturnByPeriod, type PeriodKey } from "@/lib/themeReturn";

// rehype-raw 가 remark-gfm 테이블과 호환성 이슈 → cell 내부 literal "<br>" 를 React node 단에서 직접 <br/> 로 치환.
function renderWithBrs(children: ReactNode): ReactNode {
  return Children.map(children, (child, idx) => {
    if (typeof child !== "string") return child;
    const parts = child.split(/<br\s*\/?>/i);
    if (parts.length === 1) return child;
    return (
      <Fragment key={idx}>
        {parts.map((part, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {part}
          </Fragment>
        ))}
      </Fragment>
    );
  });
}

type State = "loading" | "ok" | "missing" | "error";

async function tryFetchMd(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/** ReactMarkdown td children 에서 텍스트만 재귀 추출 — link 등 중첩 노드 평탄화. */
function extractText(node: any): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && node?.props?.children) {
    return extractText(node.props.children);
  }
  return "";
}

/** "[Name (TICKER)](url)" / "(062040)" / "(0027)" / "(RR.)" / "(008370 KOSPI)" / "(NVDA US)" / "(ADDYY OTC US)" 등에서 티커 추출.
 *  비상장 "(비)"는 한글이라 매칭 안 됨 → null 반환 → 수익률 dash.
 *  ticker 뒤 공백+대문자 단어(거래소·국가 표기)는 옵셔널 — 표준 형식 + 레거시 형식 모두 수용. */
function extractTickerFromCell(text: string): string | null {
  const m = text.match(/\(([A-Za-z][A-Za-z0-9.]*|\d{3,7})(?:\s+[A-Z]+)*\)/);
  return m ? m[1] : null;
}

type AssetNode = {
  id: string;
  name: string;
  type?: string;
  exposure?: { ticker?: string; exchange?: string; country?: string };
  metrics?: Record<string, number | null | undefined>;
};

type Props = {
  themeId: string;
  /** ASSET 노드 배열 — 행별 수익률 9개 컬럼(3Y/2Y/1Y/YTD/1M/15D/7D/3D/1D) 자동 append 용. 미제공 시 수익률 컬럼 숨김. */
  nodes?: AssetNode[];
  /** 24h 이내 갱신된 인사이트의 자산 ID set — 해당 행의 종목 셀에 NEW 배지 표시. */
  freshInsightIds?: Set<string>;
};

// 왼쪽=가장 긴 기간, 오른쪽=가장 짧은 기간 (BAROMETER 추세 차트와 동일).
const RETURN_COLUMNS: Array<{ periodKey: PeriodKey; label: string }> = [
  { periodKey: "3Y", label: "3년" },
  { periodKey: "2Y", label: "2년" },
  { periodKey: "1Y", label: "1년" },
  { periodKey: "YTD", label: "YTD" },
  { periodKey: "1M", label: "1개월" },
  { periodKey: "15D", label: "15일" },
  { periodKey: "7D", label: "7일" },
  { periodKey: "3D", label: "3일" },
  { periodKey: "1D", label: "1일" },
];

/** 수익률 셀 렌더 — 한국 시장 컨벤션: 양수=빨강, 음수=파랑, null=회색 dash. */
function ReturnCell({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <td className="border border-white/30 px-2 py-2 text-right align-middle text-[22px] text-white/35">
        —
      </td>
    );
  }
  const isUp = value >= 0;
  const color = isUp ? "text-red-400" : "text-sky-400";
  const sign = isUp ? "+" : "";
  return (
    <td
      className={`border border-white/30 px-2 py-2 text-right align-middle text-[22px] tabular-nums font-semibold ${color}`}
    >
      {`${sign}${value.toFixed(2)}%`}
    </td>
  );
}

export default function ThemeBriefing({ themeId, nodes, freshInsightIds }: Props) {
  const [md, setMd] = useState<string | null>(null);
  const [state, setState] = useState<State>("loading");
  // 플로팅 단서: briefing 이 viewport 밖에 있을 때만 표시 — 그래프 영역 하단 정중앙
  const [showCue, setShowCue] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [cuePos, setCuePos] = useState<{ left: number; top: number } | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  const showReturnColumns = !!nodes;

  // ticker → ASSET node lookup. ticker 는 origin 그대로 사용.
  const tickerToNode = useMemo(() => {
    const m = new Map<string, AssetNode>();
    if (!nodes) return m;
    for (const n of nodes) {
      if (n.type !== "ASSET") continue;
      const t = (n.exposure?.ticker ?? "").trim();
      if (!t) continue;
      m.set(t, n);
    }
    return m;
  }, [nodes]);

  // Markdown fetch
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setMd(null);

    (async () => {
      const primary = await tryFetchMd(getBriefingUrl(themeId));
      if (cancelled) return;
      if (primary) {
        setMd(primary);
        setState("ok");
        return;
      }
      const fbUrl = getBriefingFallbackUrl(themeId);
      if (fbUrl) {
        const fb = await tryFetchMd(fbUrl);
        if (cancelled) return;
        if (fb) {
          setMd(fb);
          setState("ok");
          return;
        }
      }
      if (!cancelled) setState("missing");
    })();

    return () => {
      cancelled = true;
    };
  }, [themeId]);

  // SSR-safe portal mount
  useEffect(() => {
    setPortalTarget(typeof document !== "undefined" ? document.body : null);
  }, []);

  // Briefing 이 viewport 안에 들어왔는지 관찰 — 표가 보이면 cue 숨김
  useEffect(() => {
    if (state !== "ok") {
      setShowCue(false);
      return;
    }
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => setShowCue(!entries[0]?.isIntersecting),
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [state]);

  // Cue 위치 = 그래프 영역(data-graph-area) 의 bottom-center. 리사이즈·스크롤 시 추적.
  useEffect(() => {
    if (!showCue || typeof document === "undefined") return;
    const update = () => {
      const el = document.querySelector<HTMLElement>("[data-graph-area]");
      if (!el) {
        setCuePos(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // 그래프 영역의 bottom 안쪽 16px, center-x. viewport 밖이면 viewport 안쪽 16px 로 클램프.
      const left = r.left + r.width / 2;
      const top = Math.min(window.innerHeight - 60, Math.max(60, r.bottom - 50));
      setCuePos({ left, top });
    };
    update();
    const ro = new ResizeObserver(update);
    const el = document.querySelector<HTMLElement>("[data-graph-area]");
    if (el) ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [showCue]);

  const scrollToBriefing = () => {
    const el = sectionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = window.scrollY + rect.top - 24;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  const scrollToEventDb = () => {
    const el = typeof document !== "undefined" ? document.getElementById("event-db-section") : null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = window.scrollY + rect.top - 24;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  // 이벤트 DB 섹션 존재 여부 + md 본문/이벤트 DB 분리
  const { briefingMd, eventDbRows } = useMemo(() => parseEventDb(md), [md]);
  const hasEventDb = eventDbRows.length > 0;

  // 브리핑 표 카드형 파싱 (수익률 데이터 부착)
  const briefingRows = useMemo(
    () => (briefingMd ? parseBriefingTable(briefingMd, tickerToNode) : []),
    [briefingMd, tickerToNode],
  );
  const [showFullTable, setShowFullTable] = useState(false);

  // 파일 없으면 섹션 자체를 숨김
  if (state === "missing" || state === "error" || !md) return null;

  return (
    <>
    <section ref={sectionRef} data-briefing-section className="mt-3 rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[14px] font-semibold text-white/90">
            브리핑 카드 <span className="text-white/55">(Briefing Cards)</span>
          </h3>
          <span className="text-[10px] text-white/40">data/briefing/{themeId}.md</span>
        </div>
        {briefingRows.length > 0 && (
          <button
            type="button"
            onClick={() => setShowFullTable((v) => !v)}
            className="rounded-md border border-white/15 bg-white/3 px-3 py-1 text-[11px] text-white/75 transition hover:bg-white/8 hover:text-white"
          >
            {showFullTable ? "전체 테이블 접기 ↑" : "Full Table 보기 →"}
          </button>
        )}
      </div>

      {/* 카드 그리드 */}
      {briefingRows.length > 0 && <BriefingCards rows={briefingRows} />}

      <article className={`mt-4 text-[14px] leading-relaxed text-white/85 ${showFullTable || briefingRows.length === 0 ? "" : "hidden"}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto">
                <table className="w-full table-fixed border-collapse border border-white/40 text-[16px] [&_tbody_tr:nth-child(even)]:bg-white/4 [&_tbody_tr:hover]:bg-white/7">
                  {showReturnColumns ? (
                    <colgroup>
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "4.444%" }} />
                      <col style={{ width: "4.444%" }} />
                      <col style={{ width: "4.444%" }} />
                      <col style={{ width: "4.444%" }} />
                      <col style={{ width: "4.444%" }} />
                      <col style={{ width: "4.444%" }} />
                      <col style={{ width: "4.444%" }} />
                      <col style={{ width: "4.444%" }} />
                      <col style={{ width: "4.448%" }} />
                    </colgroup>
                  ) : null}
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-white/10">{children}</thead>,
            tr: ({ children, node, ...rest }: any) => {
              if (!showReturnColumns) {
                return <tr {...(rest as any)}>{children}</tr>;
              }
              const isHeader =
                Array.isArray(node?.children) &&
                node.children.some((c: any) => c?.tagName === "th");
              const arr = Children.toArray(children);
              if (isHeader) {
                return (
                  <tr {...(rest as any)}>
                    {arr}
                    {RETURN_COLUMNS.map((c) => (
                      <th
                        key={c.label}
                        className="w-16 border border-white/40 px-2 py-2 text-right align-middle text-[22px] font-semibold text-white"
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                );
              }
              const first = arr[0] as any;
              const ticker = extractTickerFromCell(extractText(first));
              const assetNode = ticker ? tickerToNode.get(ticker) : null;
              const isFreshInsight = !!(assetNode?.id && freshInsightIds?.has(assetNode.id));
              const firstCell = isFreshInsight && React.isValidElement(first)
                ? React.cloneElement(
                    first as React.ReactElement<any>,
                    undefined,
                    <>
                      <span
                        className="mr-1.5 inline-block rounded bg-red-600 px-1.5 py-0.5 align-middle text-[10px] font-bold text-white"
                        title="24시간 이내 인사이트 갱신"
                      >
                        NEW
                      </span>
                      {(first as React.ReactElement<any>).props.children}
                    </>,
                  )
                : first;
              return (
                <tr {...(rest as any)}>
                  {firstCell}
                  {arr.slice(1)}
                  {RETURN_COLUMNS.map((c) => (
                    <ReturnCell
                      key={c.label}
                      value={extractReturnByPeriod(assetNode?.metrics, c.periodKey)}
                    />
                  ))}
                </tr>
              );
            },
            th: ({ children }) => (
              <th className="border border-white/40 px-3 py-2 text-left align-top text-[16px] font-semibold text-white">
                {renderWithBrs(children)}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-white/30 px-3 py-2 align-top text-[16px] text-white/85">
                {renderWithBrs(children)}
              </td>
            ),
            h1: ({ children }) => <h1 className="mt-3 mb-2 text-[16px] font-semibold text-white/95">{children}</h1>,
            h2: ({ children }) => {
              const txt = Children.toArray(children).map((c) => (typeof c === "string" ? c : "")).join("");
              const isEventDb = /이벤트\s*[×x]\s*테마\s*DB/i.test(txt);
              return (
                <h2
                  id={isEventDb ? "event-db-section" : undefined}
                  className="mt-3 mb-2 text-[14px] font-semibold text-white/90"
                >
                  {children}
                </h2>
              );
            },
            h3: ({ children }) => <h3 className="mt-2 mb-1 text-[13px] font-semibold text-white/85">{children}</h3>,
            p: ({ children }) => <p className="my-1.5">{children}</p>,
            ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
            ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
            li: ({ children }) => <li className="my-0.5">{children}</li>,
            hr: () => <hr className="my-3 border-white/10" />,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:underline">
                {children}
              </a>
            ),
            code: ({ children }) => (
              <code className="rounded bg-white/10 px-1 py-px text-[11px] text-white/90">{children}</code>
            ),
          }}
        >
          {briefingMd}
        </ReactMarkdown>
      </article>

      {hasEventDb && (
        <div id="event-db-section" className="mt-6 border-t border-white/10 pt-5">
          <h2 className="mb-4 text-[16px] font-semibold text-white/90">
            이벤트 × 테마 DB
            <span className="ml-2 text-[12px] font-normal text-white/55">
              (지난 5년 핵심 변동요인)
            </span>
          </h2>
          <EventDbView rows={eventDbRows} />
        </div>
      )}
    </section>

    {/* 플로팅 단서: briefing 존재 + viewport 밖일 때만 표시. 그래프 영역 bottom-center 에 고정. */}
    {showCue && portalTarget && cuePos &&
      createPortal(
        <div
          style={{ left: `${cuePos.left}px`, top: `${cuePos.top}px` }}
          className="fixed z-100 flex -translate-x-1/2 items-center gap-2"
        >
          <button
            type="button"
            onClick={scrollToBriefing}
            title="아래 브리핑 테이블로 이동"
            className="flex min-w-50 items-center justify-center gap-3 rounded-full border border-white/20 bg-black/80 px-8 py-3 text-[13px] font-medium text-white/90 shadow-xl backdrop-blur transition hover:scale-105 hover:bg-black/90 hover:text-white"
          >
            <span className="inline-block animate-bounce text-[14px] leading-none">↓</span>
            <span>브리핑 테이블</span>
          </button>
          {hasEventDb && (
            <button
              type="button"
              onClick={scrollToEventDb}
              title="아래 이벤트 × 테마 DB 로 이동"
              className="flex min-w-50 items-center justify-center gap-3 rounded-full border border-amber-400/40 bg-black/80 px-8 py-3 text-[13px] font-medium text-amber-200 shadow-xl backdrop-blur transition hover:scale-105 hover:bg-black/90 hover:text-amber-100"
            >
              <span className="inline-block animate-bounce text-[14px] leading-none">↓</span>
              <span>이벤트 × 테마 DB</span>
            </button>
          )}
        </div>,
        portalTarget,
      )}
    </>
  );
}
