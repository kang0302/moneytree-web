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

export type SearchIndexV3 = {
  schemaVersion: "search_v3";
  generatedAt: string;
  totals: {
    assets: number;
    themes: number;
    businessFields: number;
    macros: number;
  };
  assets: SearchAsset[];
  themes: SearchTheme[];
  businessFields: SearchBF[];
  macros: SearchMacro[];
};

let cached: SearchIndexV3 | null = null;

export async function loadSearchIndex(url: string): Promise<SearchIndexV3> {
  if (cached) return cached;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load search index: ${res.status}`);

  const json = (await res.json()) as SearchIndexV3;
  if (json?.schemaVersion !== "search_v3") {
    throw new Error(`Invalid search index schemaVersion: ${json?.schemaVersion}`);
  }

  cached = json;
  return json;
}

export function searchByKeyword(idx: SearchIndexV3, keywordRaw: string) {
  const kw = (keywordRaw ?? "").trim().toLowerCase();
  if (!kw) return { assets: [], themes: [], businessFields: [], macros: [] };

  const hit = (tokens: string[]) =>
    Array.isArray(tokens) && tokens.some((t) => (t ?? "").toString().toLowerCase().includes(kw));

  const assets = idx.assets.filter((a) => hit(a.searchTokens)).slice(0, 30);
  const themes = idx.themes.filter((t) => hit(t.searchTokens)).slice(0, 30);
  const businessFields = idx.businessFields.filter((b) => hit(b.searchTokens)).slice(0, 30);
  const macros = idx.macros.filter((m) => hit(m.searchTokens)).slice(0, 30);

  return { assets, themes, businessFields, macros };
}
