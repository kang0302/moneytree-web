// src/lib/barometerSnapshot.ts
// 매일 생성되는 바로미터 스냅샷(import_MT/data/barometer/{date}.json)을 단일 소스로 로드.
// 홈 "시장의 온도" · 테마 페이지 바로미터 · 트렌드가 모두 이 점수를 공유해 화면 간 일관성 보장.
// rows[].scores = 호라이즌별(1D~3Y) 바로미터 점수, headlineScore = 대표 점수, movers = 상위 종목.

const BASE = "/api/raw/data/barometer";

export type SnapMover = { n?: string; t?: string; r?: number };
export type SnapRow = {
  themeId: string;
  themeName?: string;
  ok?: boolean;
  assetCount?: number;
  headlinePeriod?: string;
  headlineScore?: number;
  scores?: Record<string, number>;
  avgRet?: Record<string, number>;
  movers?: SnapMover[];
};

export type BarometerSnapshot = {
  date: string;
  rows: SnapRow[];
  map: Map<string, SnapRow>;
};

let _cache: { at: number; snap: BarometerSnapshot } | null = null;
const TTL_MS = 5 * 60 * 1000; // 5분 메모리 캐시(과도한 재fetch 방지)

/** 최신 바로미터 스냅샷을 로드(모듈 메모리 5분 캐시). 실패 시 null. */
export async function fetchLatestBarometer(force = false): Promise<BarometerSnapshot | null> {
  if (!force && _cache && Date.now() - _cache.at < TTL_MS) return _cache.snap;
  try {
    const cb = Date.now();
    const ri = await fetch(`${BASE}/index.json?_cb=${cb}`, { cache: "no-store" });
    if (!ri.ok) return _cache?.snap ?? null;
    const idx = await ri.json();
    const list: any[] = Array.isArray(idx) ? idx : idx?.dates ?? [];
    const latest = (list[0]?.date ?? list[0]) as string | undefined;
    if (!latest) return _cache?.snap ?? null;
    const rs = await fetch(`${BASE}/${latest}.json?_cb=${cb}`, { cache: "no-store" });
    if (!rs.ok) return _cache?.snap ?? null;
    const data = await rs.json();
    const rows: SnapRow[] = (data?.rows ?? (Array.isArray(data) ? data : [])) as SnapRow[];
    const map = new Map<string, SnapRow>();
    for (const r of rows) if (r?.themeId) map.set(r.themeId, r);
    const snap: BarometerSnapshot = { date: latest, rows, map };
    _cache = { at: Date.now(), snap };
    return snap;
  } catch {
    return _cache?.snap ?? null;
  }
}

/** 스냅샷 row에서 특정 기간 점수(없으면 headlineScore, 그것도 없으면 null). */
export function scoreForPeriod(row: SnapRow | null | undefined, period: string): number | null {
  if (!row) return null;
  const s = row.scores?.[period];
  if (typeof s === "number" && Number.isFinite(s)) return s;
  if (typeof row.headlineScore === "number" && Number.isFinite(row.headlineScore)) return row.headlineScore;
  return null;
}
