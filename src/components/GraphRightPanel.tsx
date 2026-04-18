"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PeriodKey, ThemeReturnSummary } from "@/lib/themeReturn";
import { tempByScore as tempByScoreFn } from "@/lib/themeReturn";

/* ─────────────────────────────────────────
   테마 인사이트 노트 (로컬 전용)
───────────────────────────────────────── */
type NoteItem = { id: string; date: string; content: string; themeId: string };

function noteLsKey(themeId: string) {
  return `mt_notes_${themeId}`;
}
function noteLoad(themeId: string): NoteItem[] {
  try {
    const raw = localStorage.getItem(noteLsKey(themeId));
    const parsed = JSON.parse(raw ?? "");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function noteSave(themeId: string, notes: NoteItem[]) {
  try {
    localStorage.setItem(noteLsKey(themeId), JSON.stringify(notes));
  } catch {}
}
function noteFmtDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ThemeNotes({ themeId }: { themeId: string }) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNotes(noteLoad(themeId));
  }, [themeId]);

  function handleSave() {
    const content = draft.trim();
    if (!content) return;
    const note: NoteItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString(),
      content,
      themeId,
    };
    const next = [note, ...notes];
    setNotes(next);
    noteSave(themeId, next);
    setDraft("");
    textareaRef.current?.focus();
  }

  function handleDelete(id: string) {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    noteSave(themeId, next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <div className="mt-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2">
        <div className="text-base font-extrabold text-white">인사이트 노트</div>
        {notes.length > 0 && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/50">
            {notes.length}
          </span>
        )}
      </div>

      {/* 입력 영역 */}
      <div className="mt-2 flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="이 테마에 대한 인사이트를 기록하세요... (Ctrl+Enter로 저장)"
          rows={3}
          className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[13px] leading-relaxed text-white/90 placeholder:text-white/30 outline-none focus:border-white/20"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={!draft.trim()}
            className="rounded-lg border border-white/10 bg-black/20 px-4 py-1.5 text-[12px] font-bold text-white/80 transition hover:bg-black/30 disabled:cursor-not-allowed disabled:text-white/25"
          >
            저장
          </button>
        </div>
      </div>

      {/* 노트 리스트 */}
      {notes.length === 0 ? (
        <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/40 text-center">
          저장된 노트가 없습니다.
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-xl border border-white/10 bg-black/20 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/35">{noteFmtDate(note.date)}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(note.id)}
                  className="rounded px-1.5 py-0.5 text-[11px] text-white/25 transition hover:text-[#ef476f]"
                  title="노트 삭제"
                >
                  ✕
                </button>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/80">
                {note.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type NodeT = {
  id: string;
  name?: string;
  type?: string;
  metrics?: {
    per?: number;
    pe?: number;
    pe_ttm?: number;
    valuationAsOf?: string;
    [k: string]: any;
  };
  exposure?: {
    ticker?: string;
    exchange?: string;
    country?: string;
    [k: string]: any;
  };
  [k: string]: any;
};

// ✅ GraphClient.tsx에서 import 하고 있으므로 반드시 export
export type CompareThemeOptionT = { themeId: string; themeName: string };

type Props = {
  // ✅ GraphClient가 넘기는 스펙(현재 실제 사용)
  currentThemeId: string;
  themeName: string;

  selectedNode?: NodeT | null;
  period?: PeriodKey;
  onChangePeriod?: (p: PeriodKey) => void;

  nodes?: NodeT[]; // 필요 시 확장용
  compareNodes?: NodeT[] | undefined;

  themeReturn?: ThemeReturnSummary | null; // ✅ GraphClient에서 계산된 값
  compareThemeReturn?: ThemeReturnSummary | undefined;

  // compare UI는 지금 화면에서 필수는 아니지만, GraphClient props와 타입 일치 위해 수용
  compareOptions?: CompareThemeOptionT[];
  compareThemeId?: string;
  onChangeCompareThemeId?: (v: string) => void;
  compareThemeName?: string;
};

function pickNum(v: any): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString();
}

function fmtMarketCapKRW(mcap: number | null | undefined): string {
  if (mcap === null || mcap === undefined) return "—";
  if (!Number.isFinite(mcap)) return "—";
  const n = mcap;
  const trillion = 1_000_000_000_000;
  const hundredMillion = 100_000_000;

  if (n >= trillion) return `${(n / trillion).toFixed(2)}조`;
  if (n >= hundredMillion) return `${(n / hundredMillion).toFixed(0)}억`;
  return n.toLocaleString();
}

function getTrailingPER(metrics?: Record<string, any>): number | null {
  if (!metrics) return null;
  const m = metrics as Record<string, any>;
  return pickNum(m.per) ?? pickNum(m.pe) ?? pickNum(m.pe_ttm) ?? null;
}

// PER 표시: trailing 우선, 없으면 forward(perFwd12m). 종류도 함께 반환.
function getDisplayPER(metrics?: Record<string, any>): { value: number | null; kind: "Trailing" | "Fwd" | null } {
  if (!metrics) return { value: null, kind: null };
  const m = metrics as Record<string, any>;
  const t = pickNum(m.per) ?? pickNum(m.pe) ?? pickNum(m.pe_ttm);
  if (t !== null) return { value: t, kind: "Trailing" };
  const f = pickNum(m.perFwd12m) ?? pickNum(m.per_fwd12m) ?? pickNum(m.forwardPE);
  if (f !== null) return { value: f, kind: "Fwd" };
  return { value: null, kind: null };
}

function getOptionalNum(metrics: Record<string, any> | undefined, ...keys: string[]): number | null {
  if (!metrics) return null;
  for (const k of keys) {
    const v = pickNum((metrics as any)[k]);
    if (v !== null) return v;
  }
  return null;
}

function getOptionalStr(metrics: Record<string, any> | undefined, ...keys: string[]): string | null {
  if (!metrics) return null;
  for (const k of keys) {
    const v = (metrics as any)[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function getClose(metrics?: Record<string, any>): number | null {
  if (!metrics) return null;
  const m = metrics as Record<string, any>;
  return pickNum(m.close) ?? pickNum(m.last_price) ?? pickNum(m.lastPrice) ?? null;
}

function getMarketCap(metrics?: Record<string, any>): number | null {
  if (!metrics) return null;
  const m = metrics as Record<string, any>;
  return pickNum(m.marketCap) ?? pickNum(m.market_cap) ?? pickNum(m.mktCap) ?? null;
}

// ✅ 수익률 키 후보를 "모든 컴포넌트에서 동일하게" (대문자 return_7D도 포함)
function getReturnByPeriodFromMetrics(metrics?: Record<string, any>, period?: PeriodKey): number | null {
  if (!metrics || !period) return null;

  // ✅ Live-fetched return (Yahoo Finance) takes absolute priority.
  const live = (metrics as any)._liveReturn;
  if (typeof live === "number" && Number.isFinite(live)) return live;

  const P = String(period).toUpperCase() as PeriodKey;
  const pLower = P.toLowerCase();

  // ✅ Priority: return_* (new pipeline) BEFORE ret* (stale old pipeline).
  const candidates: string[] = (() => {
    switch (P) {
      case "3D":
        return ["return_3d", "return_3D", "return3d", "ret_3d", "ret3d", "r3d", "3d", "3D"];
      case "7D":
        return ["return_7d", "return_7D", "return7d", "ret_7d", "ret7d", "r7d", "7d", "7D"];
      case "1M":
        return ["return_1m", "return_1M", "return1m", "return_30d", "ret_1m", "ret1m", "r1m", "1m", "1M", "ret30d"];
      case "YTD":
        return ["return_ytd", "return_YTD", "returnYtd", "ret_ytd", "retYtd", "ytd", "YTD"];
      case "1Y":
        return ["return_1y", "return_1Y", "return1y", "ret_1y", "ret1y", "1y", "1Y"];
      case "3Y":
        return ["return_3y", "return_3Y", "return3y", "ret_3y", "ret3y", "3y", "3Y"];
      default:
        return [pLower, P];
    }
  })();

  const tryPick = (obj: any): number | null => {
    if (!obj || typeof obj !== "object") return null;
    for (const k of candidates) {
      const vv = obj[k];
      if (typeof vv === "number" && Number.isFinite(vv)) return vv;
      if (typeof vv === "string") {
        const n = Number(vv);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };

  // 1) direct
  let v = tryPick(metrics);

  // 2) nested
  if (v == null) v = tryPick((metrics as any).returns);
  if (v == null) v = tryPick((metrics as any).return);
  if (v == null) v = tryPick((metrics as any).performance);
  if (v == null) v = tryPick((metrics as any).performance?.returns);
  if (v == null) v = tryPick((metrics as any).performance?.return);

  // 3) metrics.returns[pLower]
  if (v == null && (metrics as any)?.returns && typeof (metrics as any).returns === "object") {
    const vv =
      (metrics as any).returns[pLower] ??
      (metrics as any).returns[P] ??
      (metrics as any).returns[pLower.toUpperCase()];
    if (typeof vv === "number" && Number.isFinite(vv)) v = vv;
    if (v == null && typeof vv === "string") {
      const n = Number(vv);
      if (Number.isFinite(n)) v = n;
    }
  }

  if (v == null) return null;

  // heuristic: decimal -> percent
  const abs = Math.abs(v);
  if (abs > 0 && abs < 1 && abs * 100 >= 1) return v * 100;

  return v;
}

function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  return Math.round(v).toString();
}

/** Google Finance URL */
function googleFinanceSymbol(ticker?: string, exchange?: string): string | null {
  const t = (ticker ?? "").trim();
  if (!t) return null;
  if (t.includes(":")) return t;

  const ex = (exchange ?? "").trim().toUpperCase();
  if (!ex) return null;

  if (ex === "KOSDAQ") return `${t}:KOSDAQ`;
  if (ex === "KOSPI") return `${t}:KRX`;
  if (ex === "KRX") return `${t}:KRX`;

  if (ex === "NASDAQ") return `${t}:NASDAQ`;
  if (ex === "NYSE") return `${t}:NYSE`;
  if (ex === "AMEX") return `${t}:AMEX`;

  return null;
}

function googleFinanceUrl(ticker?: string, exchange?: string): string | null {
  const sym = googleFinanceSymbol(ticker, exchange);
  if (sym) return `https://www.google.com/finance/quote/${encodeURIComponent(sym)}`;

  const t = (ticker ?? "").trim();
  if (!t) return null;
  return `https://www.google.com/finance/search?q=${encodeURIComponent(t)}`;
}

function TempBadge({ score }: { score: number }) {
  const t = tempByScoreFn(score);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-9 w-9 rounded-md flex items-center justify-center text-[11px] font-extrabold text-white"
        style={{ backgroundColor: t.color }}
        title={t.name}
      >
        {t.name}
      </div>
      <div className="text-white font-extrabold text-2xl leading-none">{Math.round(score)}</div>
    </div>
  );
}

export default function GraphRightPanel({
  currentThemeId,
  themeName,
  selectedNode,
  period = "7D",
  themeReturn,
  nodes = [],
}: Props) {
  const nodeType = (selectedNode?.type ?? "").toUpperCase();

  const perDisp = getDisplayPER(selectedNode?.metrics);
  const perTtm = perDisp.value;
  const perKind = perDisp.kind;
  const close = getClose(selectedNode?.metrics);
  const mcap = getMarketCap(selectedNode?.metrics);

  // 옵셔널 필드 (데이터 있을 때만 표시)
  const fiftyTwoHigh = getOptionalNum(
    selectedNode?.metrics as any,
    "fiftyTwoWeekHigh",
    "fifty_two_week_high",
    "high52w",
    "week52High",
  );
  const fiftyTwoLow = getOptionalNum(
    selectedNode?.metrics as any,
    "fiftyTwoWeekLow",
    "fifty_two_week_low",
    "low52w",
    "week52Low",
  );
  const sector = getOptionalStr(selectedNode?.metrics as any, "sector", "sectorName");
  const industry = getOptionalStr(selectedNode?.metrics as any, "industry", "industryName");

  const ret = nodeType === "ASSET" ? getReturnByPeriodFromMetrics(selectedNode?.metrics, period) : null;

  const ticker = selectedNode?.exposure?.ticker;
  const exchange = selectedNode?.exposure?.exchange;
  const country = selectedNode?.exposure?.country;

  const gfUrl = googleFinanceUrl(ticker, exchange);

  const themeSummary = themeReturn;
  const ok = !!themeSummary && (themeSummary as any).ok === true;

  const healthScore = ok ? ((themeSummary as any).healthScore as number) : null;
  const momentumScore = ok ? ((themeSummary as any).momentumScore as number) : null;
  const divScore = ok ? ((themeSummary as any).divScore as number) : null;
  const tailPct = ok ? ((themeSummary as any).tailPct as number) : null;
  const gapPct = ok ? ((themeSummary as any).gapPct as number) : null;

  const avgReturn = ok ? ((themeSummary as any).avgReturn as number) : null;
  const breadthPct = ok ? ((themeSummary as any).breadthPct as number) : null;

  const overallScore = ok ? ((themeSummary as any).overallScore as number) : null;

  const assetCount = ok ? ((themeSummary as any).assetCount as number) : ((themeSummary as any)?.assetCount ?? 0);

  // ─── 수익률 데이터 출처 파악 ───
  const assetNodes = (nodes ?? []).filter((n) => (n.type ?? "").toUpperCase() === "ASSET");
  const sampleMetrics = assetNodes[0]?.metrics as any;
  const returnsSource: string | null = sampleMetrics?.returnsSource ?? null;
  const returnsAsOf: string | null = sampleMetrics?.returnsAsOf ?? null;

  // 수익률 없음 이유 설명 메시지
  const noReturnNote = useMemo(() => {
    if (ok) return null;
    const reason = (themeSummary as any)?.reason;
    if (reason === "MIN_ASSET_NOT_MET") return null; // note 필드에 이미 메시지 있음
    if (returnsSource === "FMP")
      return "FMP(글로벌/미국) 수익률 데이터 수집 중입니다. 한국 주식(PYKRX) 테마에서 수익률을 확인하세요.";
    if (returnsSource === "PYKRX")
      return `PYKRX 수익률 데이터가 없습니다. (기준일: ${returnsAsOf ?? "—"})`;
    return "수익률 데이터가 없습니다.";
  }, [ok, themeSummary, returnsSource, returnsAsOf]);

  // 선택 노드 반환일 표시
  const selectedReturnsAsOf: string | null =
    (selectedNode?.metrics as any)?.returnsAsOf ?? null;
  const selectedReturnsSource: string | null =
    (selectedNode?.metrics as any)?.returnsSource ?? null;

  return (
    <aside className="h-full w-full overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4">
      {/* Title + Overall Badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-white/55">THEME BAROMETER</div>
          <div className="mt-1 text-base font-extrabold text-white truncate">
            {themeName} <span className="text-white/50">({currentThemeId})</span>
          </div>
        </div>

        {typeof overallScore === "number" && Number.isFinite(overallScore) ? <TempBadge score={overallScore} /> : null}
      </div>

      {/* Summary */}
      <div className="mt-2 text-[12px] text-white/60">
        {(themeSummary as any)?.note ?? (ok ? "테마 상태 요약이 준비되어 있습니다." : "아직 테마 수익률/지표 데이터가 없습니다.")}
      </div>

      {/* 수익률 없음 안내 (FMP/PYKRX 구분) */}
      {noReturnNote && (
        <div className="mt-1.5 rounded-lg border border-white/8 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/50">
          ⚠ {noReturnNote}
          {returnsSource && (
            <span className="ml-1 text-white/35">
              [{returnsSource}{returnsAsOf ? ` · ${returnsAsOf}` : ""}]
            </span>
          )}
        </div>
      )}

      {/* KPI */}
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[11px] font-semibold tracking-wide text-white/55">HEALTH</div>
            <div className="text-[20px] font-black leading-none text-white">{fmtScore(healthScore)}</div>
          </div>
          <div className="mt-1 truncate text-[11px] text-white/60">
            Avg {fmtPct(avgReturn, 2)} · Breadth {fmtPct(breadthPct, 0)}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[11px] font-semibold tracking-wide text-white/55">MOMENTUM</div>
            <div className="text-[20px] font-black leading-none text-white">{fmtScore(momentumScore)}</div>
          </div>
          <div className="mt-1 truncate text-[11px] text-white/60">기본: 7D/1M/1Y 혼합</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[11px] font-semibold tracking-wide text-white/55">DIVERSIFICATION</div>
            <div className="text-[20px] font-black leading-none text-white">{fmtScore(divScore)}</div>
          </div>
          <div className="mt-1 truncate text-[11px] text-white/60">편중 경고는 45 미만</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[11px] font-semibold tracking-wide text-white/55">TAIL (±15%)</div>
            <div className="text-[20px] font-black leading-none text-white">{fmtPct(tailPct, 0)}</div>
          </div>
          <div className="mt-1 truncate text-[11px] text-white/60">Gap {fmtPct(gapPct, 1)}</div>
        </div>
      </div>

      {/* SELECTED */}
      <div className="mt-3 text-xs text-white/55">SELECTED</div>

      {!selectedNode ? (
        <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-lg font-extrabold text-white">노드를 클릭하세요</div>
          <div className="mt-1 text-sm text-white/55">type: -</div>
        </div>
      ) : (
        <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-extrabold text-white">{selectedNode.name ?? selectedNode.id}</div>
              <div className="mt-1 text-sm text-white/60">type: {nodeType || "-"}</div>

              {nodeType === "ASSET" ? (
                <div className="mt-3 space-y-1 text-sm text-white/80">
                  <div className="flex items-baseline gap-2">
                    <span className="text-white/55">{period} Return :</span>{" "}
                    <span className="font-bold" style={{ color: ret === null ? "rgba(255,255,255,0.4)" : ret > 0 ? "#FF4444" : ret < 0 ? "#4444FF" : "#ffffff" }}>
                      {fmtPct(ret, 2)}
                    </span>
                    {ret === null && selectedReturnsSource === "FMP" && (
                      <span className="text-[10px] text-white/35">FMP 수집중</span>
                    )}
                  </div>
                  {selectedReturnsAsOf && (
                    <div className="text-[11px] text-white/35">
                      기준일: {selectedReturnsAsOf}
                      {selectedReturnsSource ? ` (${selectedReturnsSource})` : ""}
                    </div>
                  )}
                  <div>
                    <span className="text-white/55">Ticker :</span>{" "}
                    <span className="font-semibold text-white">{ticker ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-white/55">Exchange :</span>{" "}
                    <span className="text-white/80">{exchange ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-white/55">Country :</span>{" "}
                    <span className="text-white/80">{country ?? "—"}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-white/70">선택된 노드는 ASSET이 아닙니다.</div>
              )}
            </div>

            <div className="w-[260px] shrink-0 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] leading-snug text-white/70 break-all">
                {gfUrl ? (
                  <a
                    href={gfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-white"
                    title="Google Finance"
                  >
                    {gfUrl}
                  </a>
                ) : (
                  <span className="text-white/40">Google Finance</span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[11px] text-white/45">MKT CAP</div>
                  <div className="text-sm font-bold text-white">{fmtMarketCapKRW(mcap)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-white/45">Close</div>
                  <div className="text-sm font-bold text-white">{fmtInt(close)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-white/45">VAL DATE</div>
                  <div className="text-sm font-bold text-white">{selectedNode?.metrics?.valuationAsOf ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-white/45">PER ({perKind ?? "Trailing"})</div>
                  <div className="text-sm font-bold text-white">{perTtm === null ? "—" : perTtm.toFixed(2)}</div>
                </div>
              </div>

              {/* ✅ Optional extras (데이터 있을 때만) */}
              {(fiftyTwoHigh !== null || fiftyTwoLow !== null || sector || industry) && (
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {fiftyTwoHigh !== null && (
                    <div>
                      <div className="text-[11px] text-white/45">52W HIGH</div>
                      <div className="text-sm font-bold text-white">{fmtInt(fiftyTwoHigh)}</div>
                    </div>
                  )}
                  {fiftyTwoLow !== null && (
                    <div>
                      <div className="text-[11px] text-white/45">52W LOW</div>
                      <div className="text-sm font-bold text-white">{fmtInt(fiftyTwoLow)}</div>
                    </div>
                  )}
                  {sector && (
                    <div className="col-span-2">
                      <div className="text-[11px] text-white/45">SECTOR</div>
                      <div className="text-sm font-bold text-white truncate" title={sector}>{sector}</div>
                    </div>
                  )}
                  {industry && (
                    <div className="col-span-2">
                      <div className="text-[11px] text-white/45">INDUSTRY</div>
                      <div className="text-sm font-bold text-white truncate" title={industry}>{industry}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOP MOVERS */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-white/55">TOP MOVERS</div>
        <div className="text-xs text-white/55">
          {period} · ASSET {assetCount ?? 0}
        </div>
      </div>

      <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/55">
        {(themeSummary as any)?.topMovers && (themeSummary as any).topMovers.length > 0 ? (
          (() => {
            const movers = (themeSummary as any).topMovers.slice(0, 8) as Array<{
              id: string;
              name?: string;
              ret: number;
            }>;
            // 바 길이 비율 기준: 현재 목록의 절대값 최대치 (0으로 나눔 방지)
            const maxAbs = Math.max(
              ...movers.map((m) => (Number.isFinite(m.ret) ? Math.abs(m.ret) : 0)),
              0.0001,
            );
            return (
              <div className="flex flex-col gap-2.5">
                {movers.map((m) => {
                  const ret = Number.isFinite(m.ret) ? m.ret : 0;
                  const pct = Math.max(0, Math.min(100, (Math.abs(ret) / maxAbs) * 100));
                  const up = ret >= 0;
                  return (
                    <div key={m.id} className="flex flex-col gap-1">
                      <div className="min-w-0 truncate text-[12px] text-white/80" title={m.name ?? m.id}>
                        {m.name ?? m.id}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full transition-[width]"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: up ? "#FF4444" : "#4444FF",
                            }}
                          />
                        </div>
                        <div
                          className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums"
                          style={{ color: up ? "#FF4444" : "#4444FF" }}
                        >
                          {fmtPct(ret, 2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        ) : (
          <div>아직 {period} 수익률이 없습니다.</div>
        )}
      </div>

      {/* 테마 인사이트 노트 */}
      <ThemeNotes themeId={currentThemeId} />

      <div className="mt-3 text-[11px] text-white/45">
        * PER 표시는 <b>Trailing PER</b>만 사용합니다.
      </div>
    </aside>
  );
}