"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PeriodKey, ThemeReturnSummary } from "@/lib/themeReturn";
import { tempByScore as tempByScoreFn, computeThemeReturnSummary } from "@/lib/themeReturn";

/* ─────────────────────────────────────────
   데이터 신선도 판정 (valuationAsOf/returnsAsOf 공용)
   0=fresh (≤7d), 1=warn (≤30d), 2=critical (>30d)
───────────────────────────────────────── */
export function staleLevel(asOf?: string | null, now: Date = new Date()): 0 | 1 | 2 {
  if (!asOf || typeof asOf !== "string") return 0;
  const t = Date.parse(asOf.length === 10 ? asOf + "T00:00:00Z" : asOf);
  if (!Number.isFinite(t)) return 0;
  const days = Math.floor((now.getTime() - t) / 86_400_000);
  if (days <= 7) return 0;
  if (days <= 30) return 1;
  return 2;
}

export function staleLabel(asOf?: string | null, now: Date = new Date()): string | null {
  if (!asOf || typeof asOf !== "string") return null;
  const t = Date.parse(asOf.length === 10 ? asOf + "T00:00:00Z" : asOf);
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((now.getTime() - t) / 86_400_000);
  if (days <= 7) return null;
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  return `${months}개월 이상`;
}

/* ─────────────────────────────────────────
   BAROMETER 추세 차트 — 기간별(3Y/1Y/YTD/1M/7D/3D/1D) overall score 시계열
───────────────────────────────────────── */
const TREND_PERIODS: PeriodKey[] = ["3Y", "1Y", "YTD", "1M", "7D", "3D", "1D"];
const TREND_LABELS: Record<PeriodKey, string> = {
  "3Y": "3년", "1Y": "1년", "YTD": "YTD", "1M": "1개월", "7D": "7일", "3D": "3일", "1D": "1일",
};

/** Catmull-Rom 기반 cubic-bezier smooth path. tension 0.2 ~ 0.3이 자연스러움. */
function smoothPath(points: Array<{ x: number; y: number }>, tension = 0.22): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function BarometerTrendChart({
  nodes,
  period,
  onChangePeriod,
}: {
  nodes: NodeT[] | undefined;
  period: PeriodKey;
  onChangePeriod?: (p: PeriodKey) => void;
}) {
  // 6개 기간에 대한 overall score + EW(동일가중) 수익률 동시 계산
  const data = useMemo(() => {
    const safe = Array.isArray(nodes) ? nodes : [];
    return TREND_PERIODS.map((p) => {
      const s = computeThemeReturnSummary({ nodes: safe as any, period: p, minAssets: 5 });
      const score = s.ok ? Math.round(s.overallScore) : null;
      const ewReturn = s.ok && Number.isFinite((s as any).avgReturn) ? ((s as any).avgReturn as number) : null;
      return { period: p, label: TREND_LABELS[p], score, ewReturn, ok: s.ok };
    });
  }, [nodes]);

  const W = 520;
  const H = 220;
  // 우측에 EW 수익률 축 라벨 공간 확보 (18 → 42)
  const pad = { top: 36, right: 42, bottom: 38, left: 30 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const xAt = (i: number) => pad.left + (i / (TREND_PERIODS.length - 1)) * innerW;
  const yAt = (s: number) => pad.top + (1 - s / 1000) * innerH;

  // 유효 포인트만 path로 잇기 (null인 기간은 스킵하고 양 옆 점을 직접 연결)
  const validPoints = data
    .map((d, i) => ({ ...d, x: xAt(i), y: d.score === null ? null : yAt(d.score), idx: i }))
    .filter((p) => p.y !== null) as Array<{ period: PeriodKey; label: string; score: number; ewReturn: number | null; ok: boolean; x: number; y: number; idx: number }>;

  const pathD = smoothPath(validPoints.map(({ x, y }) => ({ x, y })));

  // ─── EW 수익률 Y-스케일 (우측 축, 0% 항상 포함하여 동적 스케일) ───
  const ewValid = data
    .map((d, i) => ({ ...d, x: xAt(i), idx: i }))
    .filter((p) => p.ewReturn != null) as Array<{ period: PeriodKey; label: string; ewReturn: number; x: number; idx: number }>;
  const ewVals = ewValid.map((p) => p.ewReturn);
  const ewRaw = ewVals.length ? { min: Math.min(...ewVals), max: Math.max(...ewVals) } : null;
  // 0% 항상 시야 + 10% padding (최소 ±5% 보장)
  const retMin = ewRaw ? Math.min(0, ewRaw.min) : -5;
  const retMax = ewRaw ? Math.max(0, ewRaw.max) : 5;
  const retRange = Math.max(retMax - retMin, 10);
  const retPad = retRange * 0.1;
  const retLo = retMin - retPad;
  const retHi = retMax + retPad;
  const yAtRet = (v: number) => pad.top + (1 - (v - retLo) / (retHi - retLo)) * innerH;
  const ewPathD = smoothPath(ewValid.map((p) => ({ x: p.x, y: yAtRet(p.ewReturn) })));

  // 우측 Y축 tick — 4개 균등 분할 + 0% 강조
  const retTicks = [retLo, retLo + (retHi - retLo) * 0.25, (retLo + retHi) / 2, retLo + (retHi - retLo) * 0.75, retHi];

  // gradient stop도 score → temperature color로
  const yGrid = [0, 200, 400, 500, 600, 800, 1000];

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const allNull = validPoints.length === 0;

  return (
    <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="text-sm font-semibold text-white/85">기간별 BAROMETER 추세</div>
        <div className="flex items-center gap-3 text-[10px] text-white/40">
          <span className="flex items-center gap-1">
            <span className="inline-block h-[2px] w-3 bg-white/55" /> 점수
          </span>
          <span className="flex items-center gap-1">
            <svg width="14" height="2" className="inline-block">
              <line x1="0" y1="1" x2="14" y2="1" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
            EW 수익률
          </span>
          <span>기간 라벨 클릭으로 전환</span>
        </div>
      </div>

      {allNull ? (
        <div className="py-8 text-center text-sm text-white/40">표본 부족 — 데이터 없음</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          {/* y-axis grid + ticks */}
          {yGrid.map((s) => (
            <g key={`grid-${s}`}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={yAt(s)}
                y2={yAt(s)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
                strokeDasharray={s === 500 ? "2 3" : undefined}
              />
              <text x={pad.left - 6} y={yAt(s) + 3} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)">
                {s}
              </text>
            </g>
          ))}

          {/* area fill under line (subtle) */}
          {pathD && (
            <path
              d={`${pathD} L ${validPoints[validPoints.length - 1].x} ${pad.top + innerH} L ${validPoints[0].x} ${pad.top + innerH} Z`}
              fill="url(#barometerArea)"
              opacity={0.15}
            />
          )}
          <defs>
            <linearGradient id="barometerArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef476f" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#ef476f" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* main line (BAROMETER 점수) */}
          <path d={pathD} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={2} />

          {/* ─── 우측 Y축: EW 수익률 (점선 라인용 동적 스케일) ─── */}
          {ewValid.length > 0 && (
            <g>
              {/* 0% 기준선 (회색 점선, 좌→우 가로) */}
              {retLo <= 0 && retHi >= 0 && (
                <>
                  <line
                    x1={pad.left}
                    x2={W - pad.right}
                    y1={yAtRet(0)}
                    y2={yAtRet(0)}
                    stroke="rgba(34,211,238,0.18)"
                    strokeWidth={1}
                    strokeDasharray="1 3"
                  />
                  <text
                    x={W - pad.right + 3}
                    y={yAtRet(0) + 3}
                    fontSize={9}
                    fill="rgba(34,211,238,0.5)"
                  >
                    0%
                  </text>
                </>
              )}
              {/* 우측 축 tick 라벨 (0% 외) */}
              {retTicks.map((v, i) => {
                if (Math.abs(v) < 0.05) return null; // 0% 은 위에서 별도 처리
                return (
                  <text
                    key={`rtick-${i}`}
                    x={W - pad.right + 3}
                    y={yAtRet(v) + 3}
                    fontSize={9}
                    fill="rgba(34,211,238,0.35)"
                  >
                    {v >= 0 ? "+" : ""}{v.toFixed(0)}%
                  </text>
                );
              })}
              {/* EW 점선 라인 */}
              <path
                d={ewPathD}
                fill="none"
                stroke="#22d3ee"
                strokeWidth={1.6}
                strokeDasharray="4 3"
                strokeLinecap="round"
              />
              {/* EW 포인트 (작은 원) */}
              {ewValid.map((p) => (
                <circle
                  key={`ew-${p.period}`}
                  cx={p.x}
                  cy={yAtRet(p.ewReturn)}
                  r={3}
                  fill="#0f172a"
                  stroke="#22d3ee"
                  strokeWidth={1.4}
                />
              ))}
            </g>
          )}

          {/* current period vertical guide */}
          {(() => {
            const i = TREND_PERIODS.indexOf(period);
            if (i < 0) return null;
            return (
              <line
                x1={xAt(i)}
                x2={xAt(i)}
                y1={pad.top}
                y2={pad.top + innerH}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
              />
            );
          })()}

          {/* points + badges */}
          {data.map((d, i) => {
            const x = xAt(i);
            const isCurrent = d.period === period;
            const isHover = hoverIdx === i;
            if (d.score === null) {
              return (
                <text key={`np-${d.period}`} x={x} y={pad.top + innerH / 2} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.3)">
                  N/A
                </text>
              );
            }
            const y = yAt(d.score);
            const meta = tempByScoreFn(d.score);
            const r = isCurrent || isHover ? 7 : 5;
            return (
              <g key={`pt-${d.period}`}>
                <circle cx={x} cy={y} r={r + 3} fill={meta.color} opacity={isCurrent ? 0.25 : 0} />
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={meta.color}
                  stroke={isCurrent ? "#fff" : "rgba(255,255,255,0.35)"}
                  strokeWidth={isCurrent ? 2 : 1}
                />
                {/* score above point */}
                <text x={x} y={y - r - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="white">
                  {d.score}
                </text>
                {/* badge name (only current or hover, to avoid clutter) */}
                {(isCurrent || isHover) && (
                  <text x={x} y={y - r - 18} textAnchor="middle" fontSize={9} fontWeight={700} fill={meta.color}>
                    {meta.name}
                  </text>
                )}
                {/* hit area */}
                <rect
                  x={x - innerW / TREND_PERIODS.length / 2}
                  y={pad.top}
                  width={innerW / TREND_PERIODS.length}
                  height={innerH}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx((h) => (h === i ? null : h))}
                  onClick={() => onChangePeriod?.(d.period)}
                />
              </g>
            );
          })}

          {/* x-axis labels */}
          {data.map((d, i) => {
            const isCurrent = d.period === period;
            return (
              <text
                key={`lbl-${d.period}`}
                x={xAt(i)}
                y={H - 14}
                textAnchor="middle"
                fontSize={11}
                fontWeight={isCurrent ? 700 : 500}
                fill={isCurrent ? "white" : "rgba(255,255,255,0.55)"}
                style={{ cursor: "pointer" }}
                onClick={() => onChangePeriod?.(d.period)}
              >
                {d.label}
              </text>
            );
          })}
        </svg>
      )}

      {/* current period summary line */}
      {(() => {
        const cur = data.find((d) => d.period === period);
        if (!cur || cur.score === null) return null;
        const meta = tempByScoreFn(cur.score);
        const ew = cur.ewReturn;
        return (
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="text-white/55">현재 ({cur.label})</span>
            <span className="flex items-center gap-2">
              {typeof ew === "number" && Number.isFinite(ew) && (
                <span className="flex items-center gap-1 font-semibold" style={{ color: "#22d3ee" }}>
                  EW {ew >= 0 ? "+" : ""}{ew.toFixed(2)}%
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-extrabold text-black"
                  style={{ background: meta.color }}
                >
                  {meta.name}
                </span>
                <span className="font-bold text-white">{cur.score}</span>
              </span>
            </span>
          </div>
        );
      })()}
    </div>
  );
}

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

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  return Math.round(v).toString();
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
  period = "7D",
  onChangePeriod,
  themeReturn,
  nodes = [],
}: Props) {
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

      {/* EW (Equal-Weighted Virtual ETF) — period 수익률 prominent pill */}
      {typeof avgReturn === "number" && Number.isFinite(avgReturn) ? (
        <div className="mt-2 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
            style={{
              borderColor:
                avgReturn > 0
                  ? "rgba(248,113,113,0.4)"
                  : avgReturn < 0
                    ? "rgba(96,165,250,0.4)"
                    : "rgba(255,255,255,0.18)",
              backgroundColor:
                avgReturn > 0
                  ? "rgba(248,113,113,0.08)"
                  : avgReturn < 0
                    ? "rgba(96,165,250,0.08)"
                    : "rgba(255,255,255,0.04)",
              color:
                avgReturn > 0
                  ? "#fca5a5"
                  : avgReturn < 0
                    ? "#93c5fd"
                    : "rgba(255,255,255,0.7)",
            }}
            title={`Equal-Weighted 가상 포트폴리오 — 모든 자산 동일가중 단순평균 (n=${assetCount})`}
          >
            <span className="text-white/55">EW {period ?? "7D"}</span>
            <span className="font-extrabold">
              {avgReturn >= 0 ? "+" : ""}
              {avgReturn.toFixed(2)}%
            </span>
            <span className="text-white/40">· n={assetCount}</span>
          </span>
        </div>
      ) : null}

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
            <div className="text-[11px] font-semibold tracking-wide text-white/55">TAIL (≤-15%)</div>
            <div className="text-[20px] font-black leading-none text-white">{fmtPct(tailPct, 0)}</div>
          </div>
          <div className="mt-1 truncate text-[11px] text-white/60">Gap {fmtPct(gapPct, 1)}</div>
        </div>
      </div>

      {/* BAROMETER 추세 — 6개 기간 시계열 (항상 표시, selection과 무관) */}
      <div className="mt-3 text-xs text-white/55">BAROMETER 추세</div>
      <BarometerTrendChart
        nodes={nodes}
        period={(period ?? "7D") as PeriodKey}
        onChangePeriod={onChangePeriod}
      />

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