// src/app/api/raw/[...path]/route.ts
// import_MT 데이터 프록시 — 클라이언트가 raw.githubusercontent 대신 이 경로로 읽는다.
//   - GITHUB_TOKEN 설정 시: GitHub Contents API(raw)로 인증 fetch → private repo 대응
//   - 미설정 시: raw.githubusercontent 로 폴백 → public repo 그대로 동작(전환 전 무중단)
// 로드맵 2번(PAT 프록시). 캐싱 헤더로 GitHub 요청 수를 줄인다.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER = "kang0302";
const REPO = "import_MT";
const BRANCH = "main";

const CT: Record<string, string> = {
  json: "application/json; charset=utf-8",
  jsonl: "application/x-ndjson; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mjs: "text/javascript; charset=utf-8",
  js: "text/javascript; charset=utf-8",
};
const isImage = (ext: string) => ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext);

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const rel = (path || []).map(encodeURIComponent).join("/");
  if (!rel || rel.includes("..")) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }
  const ext = (rel.split(".").pop() || "").toLowerCase();
  const token = process.env.GITHUB_TOKEN;

  // 캐시버스터(_cb 등)는 GitHub로 전달하지 않음 — 프록시 자체 캐시 정책 사용
  const upstream = token
    ? `https://api.github.com/repos/${OWNER}/${REPO}/contents/${rel}?ref=${BRANCH}`
    : `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${rel}`;

  const headers: Record<string, string> = { "User-Agent": "knowvest-proxy" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["Accept"] = "application/vnd.github.raw";
    headers["X-GitHub-Api-Version"] = "2022-11-28";
  }

  try {
    const r = await fetch(upstream, { headers, cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json({ error: `upstream ${r.status}` }, { status: r.status === 404 ? 404 : 502 });
    }
    const buf = await r.arrayBuffer();
    const contentType = CT[ext] || r.headers.get("content-type") || "application/octet-stream";
    // 이미지는 길게, 데이터(JSON 등)는 짧게 캐싱 + SWR
    const cacheControl = isImage(ext)
      ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
      : "public, max-age=120, s-maxage=300, stale-while-revalidate=86400";
    return new NextResponse(buf, {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": cacheControl },
    });
  } catch {
    return NextResponse.json({ error: "proxy fetch failed" }, { status: 502 });
  }
}
