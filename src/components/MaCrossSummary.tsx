"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const BASE = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/ma_brief";

type Row = {
  id?: string | null;
  name: string;
  ticker: string;
  country: string;
  daysAgo: number;
};
type Crosses = {
  asof?: string;
  window?: number;
  goldenCount: number;
  deadCount: number;
  golden: Row[];
  dead: Row[];
};

const FLAG: Record<string, string> = {
  US: "🇺🇸", KR: "🇰🇷", JP: "🇯🇵", CN: "🇨🇳", TW: "🇹🇼", HK: "🇭🇰",
  CA: "🇨🇦", DE: "🇩🇪", IT: "🇮🇹", GB: "🇬🇧", IL: "🇮🇱", AU: "🇦🇺",
};

function dayLabel(d: number): string {
  return d <= 0 ? "오늘" : `${d}일 전`;
}

function Chip({ r, tone }: { r: Row; tone: "gold" | "dead" }) {
  const cls =
    tone === "gold"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-100 hover:border-rose-300/60 hover:bg-rose-500/20"
      : "border-sky-400/30 bg-sky-500/10 text-sky-100 hover:border-sky-300/60 hover:bg-sky-500/20";
  const inner = (
    <>
      <span className="mr-1">{FLAG[r.country] ?? "🏳️"}</span>
      {r.name}
      <span className="ml-1 text-[10px] opacity-60">{dayLabel(r.daysAgo)}</span>
    </>
  );
  const base = `inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] transition ${cls}`;
  return r.id ? (
    <Link href={`/asset/${r.id}`} className={base} title={`${r.name} · ${r.ticker} · ${dayLabel(r.daysAgo)}`}>
      {inner}
    </Link>
  ) : (
    <span className={base} title={r.ticker}>
      {inner}
    </span>
  );
}

export default function MaCrossSummary() {
  const [data, setData] = useState<Crosses | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${BASE}/crosses.json?_cb=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setData(j))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;

  return (
    <section className="mb-4">
      {/* 접이식 sub 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2.5 text-left transition hover:border-white/30 hover:bg-white/[0.06]"
      >
        <span className="flex items-center gap-2.5 text-[13px] font-semibold text-white/85">
          <span className={`transition ${open ? "rotate-90" : ""}`}>▶</span>
          최근 5거래일 이동평균 크로스
          <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-bold text-rose-200">
            ▲ 골든 {data.goldenCount}
          </span>
          <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-bold text-sky-200">
            ▼ 데드 {data.deadCount}
          </span>
        </span>
        <span className="text-[11px] text-white/40">
          SMA20×SMA60 · {data.asof ?? ""} · {open ? "접기" : "펼치기"}
        </span>
      </button>

      {!open ? null : (
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {/* 골든크로스 */}
        <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.04] p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-[12px] font-bold text-rose-200">
              ▲ 골든크로스
            </span>
            <span className="text-[11px] text-white/50">상승 전환 · {data.goldenCount}종목</span>
          </div>
          <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {data.golden.map((r) => (
              <Chip key={(r.id ?? r.ticker) + r.ticker} r={r} tone="gold" />
            ))}
            {data.golden.length === 0 && <span className="text-[12px] text-white/30">해당 없음</span>}
          </div>
        </div>
        {/* 데드크로스 */}
        <div className="rounded-xl border border-sky-400/20 bg-sky-500/[0.04] p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-[12px] font-bold text-sky-200">
              ▼ 데드크로스
            </span>
            <span className="text-[11px] text-white/50">하락 전환 · {data.deadCount}종목</span>
          </div>
          <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {data.dead.map((r) => (
              <Chip key={(r.id ?? r.ticker) + r.ticker} r={r} tone="dead" />
            ))}
            {data.dead.length === 0 && <span className="text-[12px] text-white/30">해당 없음</span>}
          </div>
        </div>
      </div>
      )}
    </section>
  );
}
