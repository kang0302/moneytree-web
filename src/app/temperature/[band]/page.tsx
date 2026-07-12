"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { bandByKey, bandOf, scoreBadgeColor, scoreLabel, TEMP_BANDS } from "@/lib/marketTemp";
import { loadScoredThemes, ScoredTheme } from "@/lib/loadThemes";
import MiniThemeGraph from "@/components/MiniThemeGraph";

export default function TemperatureBandPage({
  params,
}: {
  params: Promise<{ band: string }> | { band: string };
}) {
  const p = (params as any)?.then ? use(params as Promise<{ band: string }>) : (params as { band: string });
  const bandKey = (p?.band ?? "").trim();
  const band = bandByKey(bandKey);

  const [rows, setRows] = useState<ScoredTheme[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const all = await loadScoredThemes("7D");
      if (!alive) return;
      setRows(all);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const inBand = useMemo(() => {
    if (!band) return [];
    return rows
      .filter((t) => typeof t.score === "number" && bandOf(t.score)?.key === band.key)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [rows, band]);

  if (!band) {
    return (
      <main className="min-h-screen w-full bg-black px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="text-[18px] font-bold">알 수 없는 온도 구간: {bandKey}</div>
          <Link href="/" className="mt-4 inline-block text-[13px] text-white/60 hover:text-white">
            ← 홈으로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${band.color}22 0%, rgba(0,0,0,0) 55%)`,
        }}
      />
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col px-4 py-6">
        {/* Header */}
        <header className="mb-5 flex h-12 items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 backdrop-blur">
          <Link href="/" className="text-[13px] text-white/70 hover:text-white">
            ← Know_vest
          </Link>
          <nav className="flex items-center gap-1.5 text-[11px]">
            {TEMP_BANDS.map((b) => (
              <Link
                key={b.key}
                href={`/temperature/${b.key}`}
                className={[
                  "rounded-lg border px-2 py-1 transition",
                  b.key === band.key ? "font-bold" : "text-white/60 hover:text-white",
                ].join(" ")}
                style={
                  b.key === band.key
                    ? { color: b.color, borderColor: `${b.color}66`, background: `${b.color}18` }
                    : { borderColor: "rgba(255,255,255,0.08)" }
                }
                title={b.label}
              >
                {b.emoji} {b.label}
              </Link>
            ))}
          </nav>
        </header>

        {/* Title */}
        <section className="mb-4">
          <div className="flex items-end gap-3">
            <div className="text-[34px] leading-none">{band.emoji}</div>
            <div>
              <div className="text-[11px] uppercase tracking-wider" style={{ color: band.color }}>
                Market Temperature
              </div>
              <div className="text-[26px] font-extrabold" style={{ color: band.color }}>
                {band.label}
                <span className="ml-2 text-[14px] font-semibold text-white/55">
                  {loading ? "loading…" : `${inBand.length}개 테마`}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-1 text-[12px] text-white/45">
            7D 종합 점수 {band.min}
            {band.key === "blazing" ? " 이상" : `~${nextMax(band.key)}`} 구간의 테마 지도
          </div>
        </section>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        ) : inBand.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-[13px] text-white/50">
            현재 이 온도 구간에 속한 테마가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inBand.map((t) => (
              <Link
                key={t.themeId}
                href={`/graph/${t.themeId}`}
                className="group flex flex-col overflow-hidden rounded-2xl border bg-white/[0.02] transition hover:bg-white/[0.05]"
                style={{ borderColor: `${band.color}33` }}
              >
                {/* 그래프 모델 썸네일 */}
                <div
                  className="relative h-[132px] w-full border-b"
                  style={{
                    borderColor: `${band.color}22`,
                    background: `radial-gradient(ellipse at 50% 40%, ${band.color}14 0%, rgba(255,255,255,0.02) 70%)`,
                  }}
                >
                  <MiniThemeGraph seed={t.themeId} graph={t.graph} />
                  <span className="absolute left-2 top-2 rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[9.5px] text-white/60 backdrop-blur">
                    {t.themeId}
                  </span>
                  <span
                    className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums backdrop-blur"
                    style={{ color: scoreBadgeColor(t.score), background: "rgba(0,0,0,0.4)" }}
                    title={scoreLabel(t.score)}
                  >
                    {t.score === null ? "—" : Math.round(t.score)}
                  </span>
                </div>
                {/* 하단 정보 */}
                <div className="px-3 py-2.5">
                  <div className="truncate text-[13px] font-semibold text-white/90" title={t.themeName}>
                    {t.themeName}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/40">
                    <span>자산 {t.assetCount}</span>
                    <span>·</span>
                    <span>노드 {t.nodeCount}</span>
                    <span>·</span>
                    <span>엣지 {t.edgeCount}</span>
                    {t.topMover?.name ? (
                      <span className="ml-auto truncate text-white/45">
                        ▲ {t.topMover.name}
                        {typeof t.topMover.ret === "number" ? ` ${t.topMover.ret.toFixed(1)}%` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function nextMax(key: string): number {
  const idx = TEMP_BANDS.findIndex((b) => b.key === key);
  if (idx <= 0) return 1000;
  return TEMP_BANDS[idx - 1].min - 1;
}
