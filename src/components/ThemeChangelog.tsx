// src/components/ThemeChangelog.tsx
// 테마 큐레이션 로그 — 각 테마가 어떤 아이디어·근거로 신규 생성/보강/변경/분할/수정되었는지
// 정제된 기록을 시간순으로 보여준다. 7일 이내 변경 엔트리는 HIGHLIGHT.
//
// 데이터 소스: 테마 JSON meta.changelog[] (page.tsx → GraphClient → 이 컴포넌트로 전달)
//   entry: { date: "YYYY-MM-DD", kind?: "신규|보강|변경|분할|수정", title?: string, detail?: string }

"use client";

import React, { useMemo } from "react";

export type ChangelogEntry = {
  date?: string; // "2026-07-10"
  kind?: string; // 신규 / 보강 / 변경 / 분할 / 수정
  title?: string;
  detail?: string;
};

const RECENT_DAYS = 7;

const KIND_STYLE: Record<string, string> = {
  신규: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  보강: "border-sky-400/40 bg-sky-500/15 text-sky-200",
  변경: "border-amber-400/40 bg-amber-500/15 text-amber-200",
  분할: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200",
  수정: "border-slate-400/40 bg-slate-500/15 text-slate-200",
};

function parseDay(dateStr?: string): number | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  return Number.isNaN(t) ? null : t;
}

/** 오늘로부터 며칠 전인지 (0 = 오늘). 파싱 불가 시 null */
export function daysSince(dateStr?: string): number | null {
  const t = parseDay(dateStr);
  if (t === null) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** changelog 배열에서 가장 최근 변경이 며칠 전인지 (없으면 null) */
export function latestChangeDays(changelog?: ChangelogEntry[]): number | null {
  if (!Array.isArray(changelog) || !changelog.length) return null;
  let best: number | null = null;
  for (const e of changelog) {
    const d = daysSince(e?.date);
    if (d === null) continue;
    if (best === null || d < best) best = d;
  }
  return best;
}

function fmtDate(dateStr?: string): string {
  const t = parseDay(dateStr);
  if (t === null) return dateStr ?? "";
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function relLabel(days: number | null): string {
  if (days === null) return "";
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export default function ThemeChangelog({ changelog }: { changelog?: ChangelogEntry[] }) {
  const entries = useMemo(() => {
    const arr = Array.isArray(changelog) ? changelog.filter((e) => e && (e.title || e.detail)) : [];
    // 최신순 정렬 (date 없는 건 뒤로)
    return [...arr].sort((a, b) => {
      const ta = parseDay(a?.date);
      const tb = parseDay(b?.date);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta;
    });
  }, [changelog]);

  if (!entries.length) return null;

  const latest = latestChangeDays(entries);
  const isRecent = latest !== null && latest <= RECENT_DAYS;

  return (
    <section
      id="theme-changelog"
      className={[
        "mt-3 rounded-xl border p-3.5 transition",
        isRecent
          ? "border-emerald-400/40 bg-emerald-500/[0.06] shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
          : "border-white/10 bg-white/[0.03]",
      ].join(" ")}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-white/90">🗒 테마 큐레이션 로그</span>
        {isRecent && (
          <span className="animate-pulse rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
            최근 {relLabel(latest)} 업데이트
          </span>
        )}
        <span className="ml-auto text-[10px] text-white/40">이 테마가 만들어지고 다듬어진 과정</span>
      </div>

      <ol className="relative ml-1 border-l border-white/10">
        {entries.map((e, i) => {
          const d = daysSince(e?.date);
          const recent = d !== null && d <= RECENT_DAYS;
          const kindCls = (e.kind && KIND_STYLE[e.kind]) || "border-white/20 bg-white/10 text-white/70";
          return (
            <li key={i} className="relative mb-3 pl-4 last:mb-0">
              {/* 타임라인 점 */}
              <span
                className={[
                  "absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border",
                  recent ? "border-emerald-300 bg-emerald-400" : "border-white/30 bg-white/20",
                ].join(" ")}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {e.kind && (
                  <span className={["rounded border px-1.5 py-0.5 text-[10px] font-semibold", kindCls].join(" ")}>
                    {e.kind}
                  </span>
                )}
                {e.title && <span className="text-[12.5px] font-semibold text-white/90">{e.title}</span>}
                <span className="text-[10.5px] text-white/45">{fmtDate(e.date)}</span>
                {d !== null && (
                  <span
                    className={[
                      "rounded-full px-1.5 py-0.5 text-[9.5px]",
                      recent ? "bg-emerald-500/20 text-emerald-200" : "text-white/35",
                    ].join(" ")}
                  >
                    {relLabel(d)}
                  </span>
                )}
              </div>
              {e.detail && <p className="mt-1 text-[12px] leading-snug text-white/65">{e.detail}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
