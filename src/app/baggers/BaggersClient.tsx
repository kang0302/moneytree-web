"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type BaggerItem = {
  id: string;
  name: string;
  ticker: string;
  country: string;
  multiple: number;
  ret: number;
  desc: string;
};
export type BaggerBucket = { label: string; min: number; count: number; items: BaggerItem[] };
export type BaggersData = {
  title: string;
  window: { start: string; end: string };
  note: string;
  asOf: string;
  total: number;
  buckets: BaggerBucket[];
};

// 배수 버킷별 색상 (X10+ 골드 → X3 청색)
const BUCKET_COLOR: Record<string, { bar: string; text: string; ring: string }> = {
  "X10+": { bar: "#F59E0B", text: "#FCD34D", ring: "rgba(245,158,11,0.5)" },
  X9: { bar: "#F97316", text: "#FDBA74", ring: "rgba(249,115,22,0.45)" },
  X8: { bar: "#FB7185", text: "#FDA4AF", ring: "rgba(251,113,133,0.4)" },
  X7: { bar: "#E879F9", text: "#F0ABFC", ring: "rgba(232,121,249,0.4)" },
  X6: { bar: "#C084FC", text: "#D8B4FE", ring: "rgba(192,132,252,0.4)" },
  X5: { bar: "#818CF8", text: "#A5B4FC", ring: "rgba(129,140,248,0.4)" },
  X4: { bar: "#60A5FA", text: "#93C5FD", ring: "rgba(96,165,250,0.4)" },
  X3: { bar: "#38BDF8", text: "#7DD3FC", ring: "rgba(56,189,248,0.4)" },
  X2: { bar: "#2DD4BF", text: "#5EEAD4", ring: "rgba(45,212,191,0.4)" },
};

const FLAG: Record<string, string> = {
  US: "🇺🇸", KR: "🇰🇷", JP: "🇯🇵", CN: "🇨🇳", TW: "🇹🇼", HK: "🇭🇰",
  CA: "🇨🇦", DE: "🇩🇪", IT: "🇮🇹", GB: "🇬🇧", IL: "🇮🇱", AU: "🇦🇺",
  SE: "🇸🇪", ES: "🇪🇸", FR: "🇫🇷", NL: "🇳🇱",
};

const COUNTRY_KO: Record<string, string> = {
  US: "미국", KR: "한국", JP: "일본", CN: "중국", TW: "대만", HK: "홍콩",
  CA: "캐나다", DE: "독일", IT: "이탈리아", GB: "영국", IL: "이스라엘", AU: "호주",
  SE: "스웨덴", ES: "스페인", FR: "프랑스", NL: "네덜란드",
};

function countryBreakdown(items: BaggerItem[]): { ko: string; n: number }[] {
  const m: Record<string, number> = {};
  for (const it of items) m[it.country] = (m[it.country] ?? 0) + 1;
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([co, n]) => ({ ko: COUNTRY_KO[co] ?? co, n }));
}

export default function BaggersClient({ data }: { data: BaggersData }) {
  const router = useRouter();
  const [tip, setTip] = useState<{ x: number; y: number; item: BaggerItem } | null>(null);

  return (
    <main className="min-h-screen text-white/90" style={{ background: "#0b0f19", minHeight: "100vh", color: "#e5e7eb" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-20 border-b border-white/10 px-6 py-4 backdrop-blur"
        style={{ background: "rgba(11,15,25,0.92)" }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-amber-200">x2~x10 배거 포트폴리오</h1>
              <p className="text-[11px] text-white/50">
                {data.window.start} → {data.window.end} · 개별종목 {data.total}
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
          >
            ← 홈
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* 기간 설명 */}
        <section className="mb-6 rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
          <h2 className="mb-1.5 text-sm font-semibold text-amber-200">기간 · 산출 기준</h2>
          <p className="text-[13px] leading-relaxed text-white/70">{data.note}</p>
          <p className="mt-2 text-[11px] text-white/40">
            💡 종목 행에 마우스를 올리면 개략 설명이 뜨고, <b className="text-white/60">더블클릭</b>하면 종목 상세 페이지로 이동합니다.
          </p>
        </section>

        {/* 버킷 이동 버튼 (X2 → X10, 왼쪽부터) — 블랙·흰테두리, 국가 구성 표기 */}
        <nav className="mb-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {[...data.buckets]
            .sort((a, b) => a.min - b.min)
            .map((b) => {
              const bd = countryBreakdown(b.items);
              return (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => {
                    document
                      .getElementById(`bkt-${b.label}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="group flex flex-col items-start gap-2 rounded-2xl border border-white/20 bg-black px-4 py-3.5 text-left transition hover:border-white/60 hover:bg-white/[0.05] focus:outline-none focus-visible:border-white/70"
                  title={`${b.label} 버킷으로 이동`}
                >
                  <div className="flex w-full items-baseline justify-between">
                    <span className="text-xl font-extrabold tracking-tight text-white">{b.label}</span>
                    <span className="text-[12px] font-medium text-white/45 tabular-nums">
                      {b.count}<span className="ml-0.5 text-white/30">종목</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] leading-tight text-white/55">
                    {bd.slice(0, 5).map((x) => (
                      <span key={x.ko} className="tabular-nums">
                        {x.ko} <span className="font-semibold text-white/75">{x.n}</span>
                      </span>
                    ))}
                    {bd.length > 5 && <span className="text-white/35">외 {bd.length - 5}국</span>}
                  </div>
                </button>
              );
            })}
        </nav>

        {/* 버킷별 테이블 */}
        {data.buckets.map((b) => {
          const c = BUCKET_COLOR[b.label] ?? BUCKET_COLOR["X3"];
          return (
            <section key={b.label} id={`bkt-${b.label}`} className="mb-7 scroll-mt-24">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="rounded-md px-2 py-0.5 text-sm font-extrabold"
                  style={{ background: c.bar, color: "#0a0e17" }}
                >
                  {b.label}
                </span>
                <span className="text-xs text-white/50">
                  {b.label === "X10+" ? "10배 이상" : `${b.min}배대`} · {b.count}종목
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[560px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wide text-white/45">
                      <th className="w-10 px-3 py-2 text-right">#</th>
                      <th className="px-3 py-2">종목</th>
                      <th className="px-3 py-2">티커</th>
                      <th className="px-3 py-2 text-right">배수</th>
                      <th className="px-3 py-2 text-right">수익률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.items.map((it, i) => (
                      <tr
                        key={it.id + it.ticker}
                        className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.06]"
                        onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, item: it })}
                        onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, item: it })}
                        onMouseLeave={() => setTip(null)}
                        onDoubleClick={() => router.push(`/asset/${it.id}`)}
                        title={it.desc || undefined}
                      >
                        <td className="px-3 py-2 text-right text-white/35 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-white/90">
                          <span className="mr-1.5">{FLAG[it.country] ?? "🏳️"}</span>
                          {it.name}
                        </td>
                        <td className="px-3 py-2 font-mono text-[12px] text-white/55">{it.ticker}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: c.text }}>
                          {it.multiple.toLocaleString(undefined, { maximumFractionDigits: 1 })}배
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-300">
                          +{Math.round(it.ret).toLocaleString()}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      {/* 호버 툴팁 */}
      {tip && tip.item.desc && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-white/15 bg-black/90 px-3 py-2 text-[12px] leading-snug text-white/85 shadow-xl backdrop-blur"
          style={{
            left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 280),
            top: tip.y + 16,
          }}
        >
          <div className="mb-0.5 font-semibold text-amber-200">
            {tip.item.name} <span className="font-mono text-[11px] text-white/50">{tip.item.ticker}</span>
          </div>
          {tip.item.desc}
        </div>
      )}
    </main>
  );
}
