// src/app/api/stock-returns/route.ts
// Yahoo Finance proxy for real-time stock return data
// Called when theme JSON has null return values (FMP-sourced T_040+ themes)

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ─── Exchange → Yahoo Finance suffix ─── */
const EXCHANGE_SUFFIX: Record<string, string> = {
  // US - no suffix
  NYSE: "", NASDAQ: "", AMEX: "", NYSEARCA: "", BATS: "", OTC: "", OTCMKTS: "",
  // Korean (PYKRX usually covers these, but just in case)
  KOSPI: ".KS", KOSDAQ: ".KQ", KRX: ".KS",
  // European
  EPA: ".PA", EURONEXT: ".PA",   // Paris
  EBR: ".BR",                     // Brussels
  EAM: ".AS", AMS: ".AS",         // Amsterdam
  LSE: ".L", LON: ".L",           // London
  FRA: ".F", XETRA: ".DE", ETR: ".DE", // Frankfurt
  MIL: ".MI", BIT: ".MI",         // Milan
  SWX: ".SW",                     // Zurich
  VIE: ".VI",                     // Vienna
  OSL: ".OL",                     // Oslo
  STO: ".ST",                     // Stockholm
  CPH: ".CO",                     // Copenhagen
  HEL: ".HE",                     // Helsinki
  // Asia-Pacific
  HKG: ".HK", HKEX: ".HK",
  TSE: ".T", TYO: ".T",
  SGX: ".SI",
  ASX: ".AX",
  BSE: ".BO", NSE: ".NS",
  SHA: ".SS", SHE: ".SZ",
};

function toYahooSymbol(ticker: string, exchange: string): string {
  const ex = exchange.toUpperCase().trim();
  const suffix = ex in EXCHANGE_SUFFIX ? EXCHANGE_SUFFIX[ex] : "";
  return `${ticker}${suffix}`;
}

type PeriodInfo = { yRange: string; calendarDays: number; isYtd: boolean };

function getPeriodInfo(period: string): PeriodInfo {
  switch (period.toUpperCase()) {
    case "3D":  return { yRange: "10d",  calendarDays: 3,    isYtd: false };
    case "7D":  return { yRange: "15d",  calendarDays: 7,    isYtd: false };
    case "1M":  return { yRange: "60d",  calendarDays: 30,   isYtd: false };
    case "YTD": return { yRange: "ytd",  calendarDays: 0,    isYtd: true  };
    case "1Y":  return { yRange: "13mo", calendarDays: 365,  isYtd: false };
    case "3Y":  return { yRange: "4y",   calendarDays: 1095, isYtd: false };
    default:    return { yRange: "15d",  calendarDays: 7,    isYtd: false };
  }
}

async function fetchTickerReturn(
  ticker: string,
  exchange: string,
  period: string
): Promise<number | null> {
  const symbol = toYahooSymbol(ticker, exchange);
  const { yRange, calendarDays, isYtd } = getPeriodInfo(period);

  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${yRange}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data = (await res.json()) as any;
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    if (!timestamps.length || !closes.length) return null;

    // Build valid (ts, close) pairs
    const pairs: { ts: number; close: number }[] = [];
    for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
      const c = closes[i];
      if (typeof c === "number" && Number.isFinite(c) && c > 0) {
        pairs.push({ ts: timestamps[i], close: c });
      }
    }

    if (pairs.length < 2) return null;

    const latest = pairs[pairs.length - 1];

    let baseClose: number;
    if (isYtd) {
      // First price in the ytd range = first trading day of this year
      baseClose = pairs[0].close;
    } else {
      // Find price at or before calendarDays ago
      const targetTs = latest.ts - calendarDays * 86400;
      let basePair = pairs[0];
      for (const p of pairs) {
        if (p.ts <= targetTs) basePair = p;
        else break;
      }
      baseClose = basePair.close;
    }

    if (!baseClose || !latest.close) return null;

    // Return as percentage points (e.g., 3.21 means +3.21%)
    return ((latest.close - baseClose) / baseClose) * 100;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tickersParam = searchParams.get("tickers") ?? "";
  const period = searchParams.get("period") ?? "7D";

  // Format: "TPR:NYSE,EXPE:NASDAQ,MONC:MIL"
  const pairs = tickersParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [ticker, exchange] = s.split(":");
      return {
        ticker: (ticker ?? "").trim().toUpperCase(),
        exchange: (exchange ?? "").trim().toUpperCase(),
      };
    })
    .filter((p) => p.ticker && p.exchange);

  if (!pairs.length) {
    return NextResponse.json({});
  }

  // Parallel fetch (cap at 30 tickers)
  const results = await Promise.all(
    pairs.slice(0, 30).map(async ({ ticker, exchange }) => {
      const ret = await fetchTickerReturn(ticker, exchange, period);
      return { ticker, ret };
    })
  );

  const out: Record<string, number | null> = {};
  for (const { ticker, ret } of results) {
    out[ticker] = ret;
  }

  return NextResponse.json(out, {
    headers: {
      // 5-minute client cache so repeated page loads don't re-fetch
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
