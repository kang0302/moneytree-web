// src/lib/searchIndex.ts

export type SearchAsset = {
  id: string;
  name: string;
  ticker: string;
  exchange: string;
  country: string;
  themes: string[];
  businessFields: string[];
  macros: string[];
  searchTokens: string[];
};

export type SearchTheme = {
  id: string;
  name: string;
  assets: string[];
  businessFields: string[];
  macros: string[];
  searchTokens: string[];
};

export type SearchBF = {
  id: string;
  name: string;
  themes: string[];
  assets: string[];
  searchTokens: string[];
};

export type SearchMacro = {
  id: string;
  name: string;
  macro_type: string;
  themes: string[];
  assets: string[];
  searchTokens: string[];
};

export type SearchCharacter = {
  id: string;
  name: string;
  themes: string[];
  assets: string[];
  searchTokens: string[];
};

export type SearchIndexV3 = {
  schemaVersion: "search_v3";
  generatedAt: string;
  totals: {
    assets: number;
    themes: number;
    businessFields: number;
    macros: number;
    characters?: number;
  };
  assets: SearchAsset[];
  themes: SearchTheme[];
  businessFields: SearchBF[];
  macros: SearchMacro[];
  characters?: SearchCharacter[];
};

// URL 기준 캐시: 캐시버스트 쿼리(?v=...)가 바뀌면 자동으로 재요청되도록 한다.
const cacheByUrl = new Map<string, SearchIndexV3>();

export async function loadSearchIndex(url: string): Promise<SearchIndexV3> {
  const hit = cacheByUrl.get(url);
  if (hit) return hit;

  // no-store로 최신 강제 (dev에서 특히 중요)
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load search index: ${res.status}`);

  const json = (await res.json()) as SearchIndexV3;

  // 스키마 강제 체크
  if (json?.schemaVersion !== "search_v3") {
    throw new Error(`Invalid search index schemaVersion: ${json?.schemaVersion}`);
  }

  cacheByUrl.set(url, json);
  return json;
}

// 문자열 정규화(한글/영문 혼용에서 매칭 안정성 ↑)
function norm(v: unknown): string {
  return (v ?? "")
    .toString()
    .normalize("NFC")
    .trim()
    .toLowerCase();
}

function includesKw(field: unknown, kw: string): boolean {
  if (!kw) return false;
  return norm(field).includes(kw);
}

function tokensHit(tokens: unknown, kw: string): boolean {
  if (!Array.isArray(tokens)) return false;
  return tokens.some((t) => includesKw(t, kw));
}

export function searchByKeyword(idx: SearchIndexV3, keywordRaw: string) {
  const kw = norm(keywordRaw);
  if (!kw) return { assets: [], themes: [], businessFields: [], macros: [], characters: [] };

  // ✅ 핵심: searchTokens가 깨져도, id/name/ticker로는 반드시 검색되게 “이중 매칭”
  const assetMatch = (a: SearchAsset) =>
    includesKw(a.id, kw) ||
    includesKw(a.name, kw) ||
    includesKw(a.ticker, kw) ||
    includesKw(a.exchange, kw) ||
    includesKw(a.country, kw) ||
    tokensHit(a.searchTokens, kw);

  const themeMatch = (t: SearchTheme) =>
    includesKw(t.id, kw) ||
    includesKw(t.name, kw) ||
    tokensHit(t.searchTokens, kw);

  const bfMatch = (b: SearchBF) =>
    includesKw(b.id, kw) ||
    includesKw(b.name, kw) ||
    tokensHit(b.searchTokens, kw);

  const macroMatch = (m: SearchMacro) =>
    includesKw(m.id, kw) ||
    includesKw(m.name, kw) ||
    includesKw(m.macro_type, kw) ||
    tokensHit(m.searchTokens, kw);

  const characterMatch = (c: SearchCharacter) =>
    includesKw(c.id, kw) ||
    includesKw(c.name, kw) ||
    tokensHit(c.searchTokens, kw);

  const assets = idx.assets.filter(assetMatch).slice(0, 30);
  const themes = idx.themes.filter(themeMatch).slice(0, 30);
  const businessFields = idx.businessFields.filter(bfMatch).slice(0, 30);
  const macros = idx.macros.filter(macroMatch).slice(0, 30);
  const characters = (idx.characters ?? []).filter(characterMatch).slice(0, 30);

  return { assets, themes, businessFields, macros, characters };
}
