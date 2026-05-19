// src/lib/sourceRouter.ts
// 자산 데이터 소스 라우팅 룰 — 라이브 fetch + 배치 freeze 양쪽 단일 진실원천.
//
// 정책 (2026-05-19 사용자 확정):
//   - US 거래소 → FMP (1순위)
//   - 그 외 모든 거래소 → EODHD (1순위)
//   - primary 가 error / null 반환 시 → YAHOO (universal fallback)
//   - unknown country/exchange → YAHOO 단독
//
// Python 배치 측 동치 모듈: import_MT/scripts/source_router.py (mapping 일치 필수).

export type DataSource = "FMP" | "EODHD" | "YAHOO";

/* ─── FMP 1순위 거래소 (US) ─── */
const FMP_EXCHANGES = new Set<string>([
  "NYSE", "NASDAQ", "AMEX", "NYSEARCA", "BATS",
  "OTC", "OTCMKTS", "OTCBB", "PINK", "CBOE",
]);
const FMP_COUNTRIES = new Set<string>(["US", "USA"]);

/* ─── EODHD 1순위 거래소 (전 글로벌, US 제외) ─── */
const EODHD_EXCHANGES = new Set<string>([
  // Korea
  "KOSPI", "KOSDAQ", "KRX", "KONEX",
  // Japan
  "TSE", "TYO", "TOKYO",
  // China
  "SHA", "SSE", "SHANGHAI", "SHE", "SZSE", "SHENZHEN",
  // Hong Kong
  "HKG", "HKEX", "HK",
  // Taiwan
  "TWSE", "TPE", "TAI",
  // Europe — UK
  "LSE", "LON",
  // Europe — DE
  "XETRA", "ETR", "FRA",
  // Europe — FR / NL / BE
  "EPA", "EURONEXT", "EAM", "AMS", "EBR", "BRU",
  // Europe — IT / ES
  "MIL", "BIT", "MCE", "BME",
  // Europe — CH / AT
  "SWX", "SIX", "VIE",
  // Europe — Nordic
  "OSL", "OL", "STO", "ST", "CPH", "CO", "HEL", "HE",
  // Europe — others
  "LIS", "LS", "WSE", "WAR", "IST", "IS",
  // Canada
  "TSX", "TO", "TSXV", "CVE", "V",
  // Australia / NZ
  "ASX", "AX",
  // India / Singapore / Indonesia
  "BSE", "BOM", "NSE", "NSI", "SGX", "SI", "IDX",
  // LatAm / Africa / Mideast
  "B3", "BVMF", "BMV", "BVL", "JSE", "TADAWUL",
]);
const EODHD_COUNTRIES = new Set<string>([
  "KR", "JP", "JPN", "CN", "CHN", "HK", "HKG",
  "TW", "TWN", "GB", "UK", "DE", "DEU", "FR", "FRA",
  "NL", "NLD", "BE", "BEL", "IT", "ITA", "ES", "ESP",
  "CH", "CHE", "AT", "AUT", "NO", "NOR", "SE", "SWE",
  "DK", "DNK", "FI", "FIN", "PT", "PRT", "PL", "POL",
  "TR", "TUR", "CA", "CAN", "AU", "AUS", "NZ", "NZL",
  "IN", "IND", "SG", "SGP", "ID", "IDN", "BR", "BRA",
  "MX", "MEX", "AR", "ARG", "ZA", "ZAF", "SA", "SAU",
  "QA", "QAT", "AE", "ARE", "IE", "IRL",
]);

/**
 * 1순위 데이터 소스 결정.
 *
 * @param country - ISO-2 code (US/KR/JP/...). 빈 문자열 허용.
 * @param exchange - 거래소 코드 (NASDAQ/KOSPI/TSE/...). 빈 문자열 허용.
 * @returns "FMP" | "EODHD" | "YAHOO" (unknown 시 YAHOO)
 *
 * 매칭 우선순위: exchange 가 country 보다 강함 (NASDAQ 같은 명확한 신호).
 */
export function pickPrimarySource(country?: string, exchange?: string): DataSource {
  const c = (country ?? "").toUpperCase().trim();
  const ex = (exchange ?? "").toUpperCase().trim();

  // exchange 우선
  if (ex) {
    if (FMP_EXCHANGES.has(ex)) return "FMP";
    if (EODHD_EXCHANGES.has(ex)) return "EODHD";
  }
  // country fallback
  if (c) {
    if (FMP_COUNTRIES.has(c)) return "FMP";
    if (EODHD_COUNTRIES.has(c)) return "EODHD";
  }
  // unknown → YAHOO last resort
  return "YAHOO";
}

/** Fallback source (primary 실패·null 시 사용). 현재 정책: 항상 YAHOO. */
export function pickFallbackSource(_primary: DataSource): DataSource | null {
  return "YAHOO";
}

/** Primary + Fallback 둘 다 반환 — 호출자가 순차 시도. */
export function pickSources(country?: string, exchange?: string): { primary: DataSource; fallback: DataSource | null } {
  const primary = pickPrimarySource(country, exchange);
  const fallback = primary === "YAHOO" ? null : pickFallbackSource(primary);
  return { primary, fallback };
}
