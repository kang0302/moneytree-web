// src/lib/themeIndex.ts

import { getThemeJsonUrl } from "@/lib/getThemeJsonUrl";

export type ThemeIndexItem = {
  themeId: string;
  themeName: string;

  // ✅ index.json에 더 많은 필드가 있어도 “기능을 깨지 않기 위해” 허용 (사용은 선택)
  nodeCount?: number;
  edgeCount?: number;
  source?: string;
  updatedAt?: string;
};

const GITHUB_RAW_THEME_INDEX =
  "https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/index.json";

/**
 * MoneyTree FIXED RULE (LOCK)
 * - index.json은 import_MT/data/theme/index.json 에서만 읽는다 (원격 RAW)
 * - 이 함수는 앞으로 수정하지 않는다
 */
export function getThemeIndexUrl(): string {
  return GITHUB_RAW_THEME_INDEX;
}

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function toNumOrUndef(v: any): number | undefined {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : undefined;
}

function normalizeItem(x: any): ThemeIndexItem | null {
  const themeId = String(x?.themeId ?? x?.id ?? "").trim();
  // ✅ themeName이 비어 있어도 themeId만 있으면 일단 통과시킨다 (이후 placeholder 해결 단계에서 보정).
  const themeName = String(x?.themeName ?? x?.name ?? "").trim() || themeId;
  if (!themeId) return null;

  // 추가 필드(있으면 보존) — 기존 기능에는 영향 없음
  const nodeCount = toNumOrUndef(x?.nodeCount);
  const edgeCount = toNumOrUndef(x?.edgeCount);
  const source = x?.source != null ? String(x.source).trim() : undefined;
  const updatedAt = x?.updatedAt != null ? String(x.updatedAt).trim() : undefined;

  return { themeId, themeName, nodeCount, edgeCount, source, updatedAt };
}

/**
 * GitHub raw index.json의 JSON 문법 오류(예: 배열을 두 번 닫는 trailing `]`,
 * pretty-printed와 compact object 혼합 등)에 대비해 텍스트 레벨 fallback으로
 * 테마 목록을 추출한다.
 *
 * 구현: 중첩 없는 object body({ ... })를 정규식으로 매칭해 각각에서 필드 추출.
 * 이렇게 하면 pretty-printed(`themeId`·`themeName`이 서로 다른 줄) 과 compact
 * (한 줄에 모두) 어떤 포맷이든 동일하게 동작한다.
 */
function extractThemesFromRawText(text: string): ThemeIndexItem[] {
  const seen = new Set<string>();
  const out: ThemeIndexItem[] = [];

  // Match each flat object body `{ ... }` (no nested braces — theme items are flat).
  // Multiline-dotall via [\s\S], so object spanning multiple lines works.
  const objRe = /\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(text)) !== null) {
    const body = m[1];

    const idM = body.match(/"themeId"\s*:\s*"([^"]+)"/);
    if (!idM) continue;
    const themeId = idM[1].trim();
    if (!themeId || seen.has(themeId)) continue;
    seen.add(themeId);

    const nmM = body.match(/"themeName"\s*:\s*"([^"]+)"/);
    const themeName = (nmM ? nmM[1].trim() : "") || themeId;

    const ncM = body.match(/"nodeCount"\s*:\s*(\d+)/);
    const ecM = body.match(/"edgeCount"\s*:\s*(\d+)/);
    const srcM = body.match(/"source"\s*:\s*"([^"]+)"/);
    const updM = body.match(/"updatedAt"\s*:\s*"([^"]+)"/);

    out.push({
      themeId,
      themeName,
      nodeCount: ncM ? parseInt(ncM[1]) : undefined,
      edgeCount: ecM ? parseInt(ecM[1]) : undefined,
      source: srcM ? srcM[1] : undefined,
      updatedAt: updM ? updM[1] : undefined,
    });
  }

  return out;
}

/**
 * JSON.parse("[...]...") 와 같이 trailing garbage(double closing brackets 등)
 * 때문에 실패한 경우, 앞쪽 유효 JSON 배열만 잘라 다시 파싱을 시도한다.
 * 성공하면 정상 결과, 실패하면 null 반환.
 */
function tryParseTruncated(text: string): unknown | null {
  const first = text.indexOf("[");
  if (first < 0) return null;
  // 마지막 `]`부터 역순으로 뒤집으며 valid JSON이 되는 prefix를 찾는다.
  for (let end = text.length; end > first; end--) {
    if (text[end - 1] !== "]") continue;
    try {
      return JSON.parse(text.slice(first, end));
    } catch {
      // keep shrinking
    }
  }
  return null;
}

/**
 * ✅ 중요:
 * - cache: "no-store"로 강제 (Next fetch 캐시/재검증 이슈 방지)
 * - 응답이 배열이든 {themes:[...]}든 둘 다 허용
 * - JSON 파싱 실패 시 line-by-line regex fallback으로 최대한 복원
 * - 실패하면 [] 반환하되, 콘솔에 원인을 남김
 */
// 단일 URL에서 theme index를 파싱 시도 (JSON → text regex fallback).
async function tryFetchFromUrl(url: string, label: string): Promise<ThemeIndexItem[]> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[fetchThemeIndex] ${label} fetch failed:`, res.status, url);
      return [];
    }

    const text = await res.text();

    // 1차: JSON.parse
    let parsed: unknown | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // 2차: "Extra data" 같이 trailing garbage로 깨진 경우, 유효한 앞부분만 자르고 재시도
      parsed = tryParseTruncated(text);
      if (parsed !== null) {
        // eslint-disable-next-line no-console
        console.warn(`[fetchThemeIndex] ${label} recovered via truncated-parse`);
      }
    }

    if (parsed !== null) {
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as any)?.themes)
          ? (parsed as any).themes
          : [];

      const out: ThemeIndexItem[] = [];
      for (const it of safeArray<any>(arr)) {
        const n = normalizeItem(it);
        if (n) out.push(n);
      }

      if (out.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[fetchThemeIndex] ok (${label} json):`, out.length, "items");
        return out;
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[fetchThemeIndex] ${label} JSON.parse failed, falling back to regex`);
    }

    // 3차: text regex (object-block 기반, pretty/compact 혼재 모두 커버)
    const out = extractThemesFromRawText(text);
    if (out.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[fetchThemeIndex] ok (${label} text fallback):`, out.length, "items");
      return out;
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn(`[fetchThemeIndex] ${label} error:`, e?.message ?? e, url);
  }
  return [];
}

/**
 * GitHub raw → 로컬(/data/theme/index.json) 순으로 시도.
 * GitHub raw가 네트워크 에러/CORS/타임아웃으로 실패해도 로컬 파일에서 전체 테마를 확보.
 */
export async function fetchThemeIndex(): Promise<ThemeIndexItem[]> {
  // 1) GitHub raw (원격)
  const remote = await tryFetchFromUrl(getThemeIndexUrl(), "remote");
  if (remote.length > 0) return remote;

  // 2) 로컬 fallback (public/data/theme/index.json — dev 서버 & build 환경에서 항상 가용)
  const local = await tryFetchFromUrl("/data/theme/index.json", "local");
  if (local.length > 0) return local;

  // eslint-disable-next-line no-console
  console.warn("[fetchThemeIndex] all sources failed");
  return [];
}

/**
 * ✅ index.json에 themeName이 누락되거나 themeId와 같은 placeholder("T_006" 등)인 항목들에 대해,
 * 개별 테마 JSON에서 themeName을 가져와 보정한다.
 *
 * - 한 번 해결된 이름은 모듈 메모리에 캐시(중복 fetch 방지).
 * - 동시 fetch 수를 제한해 GitHub raw에 부하를 주지 않는다.
 * - 실패한 항목은 placeholder 그대로 유지(드롭다운 동작은 깨지지 않음).
 */
const resolvedNameCache = new Map<string, string>();

async function resolveOneName(themeId: string): Promise<string | null> {
  if (resolvedNameCache.has(themeId)) return resolvedNameCache.get(themeId)!;
  try {
    const res = await fetch(getThemeJsonUrl(themeId), { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    const nm = String(j?.themeName ?? "").trim();
    if (nm && nm !== themeId) {
      resolvedNameCache.set(themeId, nm);
      return nm;
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolvePlaceholderThemeNames(items: ThemeIndexItem[]): Promise<ThemeIndexItem[]> {
  const placeholders = items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => !it.themeName || it.themeName === it.themeId);

  if (placeholders.length === 0) return items;

  const out = items.slice();
  const concurrency = 8;
  let i = 0;
  async function worker() {
    while (i < placeholders.length) {
      const cur = placeholders[i++];
      const nm = await resolveOneName(cur.it.themeId);
      if (nm) out[cur.idx] = { ...cur.it, themeName: nm };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, placeholders.length) }, worker));
  // eslint-disable-next-line no-console
  console.log(
    "[resolvePlaceholderThemeNames] resolved",
    placeholders.filter((p) => out[p.idx].themeName !== p.it.themeId).length,
    "/",
    placeholders.length,
    "placeholder names"
  );
  return out;
}