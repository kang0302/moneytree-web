// src/lib/insights.ts
// 인사이트 아카이브 — 발행자가 작성/게시하는 글의 데이터 모델 & 클라이언트 저장 유틸.
//
// 저장 모델(별도 DB 없이 즉시 동작):
//   - 시드/공유본: public/data/insights.json (리포지토리 커밋 → 전체 방문자 공유·영구)
//   - 로컬 초안/게시: 브라우저 localStorage (작성 즉시 이 브라우저에서 노출)
//   읽을 때 둘을 병합(같은 id는 로컬 우선), 게시일 내림차순 정렬.
//   영구·공유 게시는 글 상세/작성 화면의 "게시용 JSON 복사"로 내보내 insights.json에 반영.

export type Insight = {
  id: string;
  title: string;
  body: string;         // 마크다운(경량)
  tags: string[];
  author: string;
  publishedAt: string;  // ISO
  updatedAt?: string;   // ISO
};

const LS_KEY = "mt_insights_v1";
const SEED_URL = "/data/insights.json";

export function makeId(): string {
  try {
    const uuid = typeof crypto !== "undefined" ? crypto.randomUUID?.() : undefined;
    if (uuid) return uuid;
  } catch {}
  return `ins_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function readLocal(): Insight[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Insight[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: Insight[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {}
}

async function readSeed(): Promise<Insight[]> {
  try {
    const r = await fetch(SEED_URL, { cache: "no-store" });
    if (!r.ok) return [];
    const arr = await r.json();
    return Array.isArray(arr) ? (arr as Insight[]) : [];
  } catch {
    return [];
  }
}

function mergeSort(seed: Insight[], local: Insight[]): Insight[] {
  const byId = new Map<string, Insight>();
  for (const a of seed) if (a && a.id) byId.set(a.id, a);
  for (const a of local) if (a && a.id) byId.set(a.id, a); // 로컬 우선
  return Array.from(byId.values()).sort((a, b) =>
    String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")),
  );
}

/** 시드 + 로컬 병합 목록 (게시일 내림차순). */
export async function loadInsights(): Promise<Insight[]> {
  const [seed, local] = [await readSeed(), readLocal()];
  return mergeSort(seed, local);
}

/** 단건 조회 (병합 기준). */
export async function getInsight(id: string): Promise<Insight | null> {
  const all = await loadInsights();
  return all.find((a) => a.id === id) ?? null;
}

/** 신규 게시 또는 기존 수정(로컬 저장). 반환 = 저장된 글. */
export function upsertLocal(input: Omit<Insight, "id" | "publishedAt"> & Partial<Pick<Insight, "id" | "publishedAt">>): Insight {
  const local = readLocal();
  const now = new Date().toISOString();
  const id = input.id ?? makeId();
  const existingIdx = local.findIndex((a) => a.id === id);
  const article: Insight = {
    id,
    title: input.title.trim(),
    body: input.body,
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    author: (input.author ?? "").trim() || "발행자",
    publishedAt: input.publishedAt ?? now,
    updatedAt: now,
  };
  if (existingIdx >= 0) local[existingIdx] = article;
  else local.unshift(article);
  writeLocal(local);
  return article;
}

/** 로컬 글 삭제(시드 글은 삭제 불가). 삭제되면 true. */
export function deleteLocal(id: string): boolean {
  const local = readLocal();
  const next = local.filter((a) => a.id !== id);
  if (next.length === local.length) return false;
  writeLocal(next);
  return true;
}

/** 이 글이 로컬(브라우저) 저장본인지 — 편집/삭제 가능 여부 판단. */
export function isLocal(id: string): boolean {
  return readLocal().some((a) => a.id === id);
}

/** 제목/본문/태그/작성자 across 검색 (대소문자 무시, 공백 분리 AND). */
export function searchInsights(list: Insight[], query: string): Insight[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const terms = q.split(/\s+/).filter(Boolean);
  return list.filter((a) => {
    const hay = `${a.title}\n${a.body}\n${a.tags.join(" ")}\n${a.author}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** 목록 카드용 발췌 (마크다운 기호 제거 후 n자). */
export function excerpt(body: string, n = 140): string {
  const plain = body
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > n ? plain.slice(0, n) + "…" : plain;
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 경량 마크다운 → 안전한 HTML(입력 escape 후 제한된 인라인/블록만 변환). */
export function renderMarkdown(md: string): string {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  let para: string[] = [];

  const inline = (raw: string): string => {
    let s = escapeHtml(raw);
    // 테마 그래프 토큰 [[T_028]] 또는 [[T_028|라벨]] — 인라인 링크로 (블록은 아래 별도 카드)
    s = s.replace(/\[\[(T_\d{1,4})(?:\|([^\]]+))?\]\]/g, (_m, id: string, label?: string) =>
      `<a href="/graph/${id}" class="font-semibold text-indigo-300 underline underline-offset-2 hover:text-indigo-200">📊 ${label ? label : id}</a>`);
    // 링크 [text](url) — url은 http(s)/상대경로만 허용
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" class="text-sky-300 underline underline-offset-2 hover:text-sky-200">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1 py-0.5 text-[0.9em]">$1</code>');
    return s;
  };
  const flushPara = () => {
    if (para.length) {
      out.push(`<p class="my-3 leading-relaxed text-white/85">${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (inList) { out.push("</ul>"); inList = false; }
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) { flushPara(); closeList(); continue; }
    let m: RegExpMatchArray | null;
    // 한 줄 전체가 테마 토큰이면 → 그래프 링크 카드 또는 라이브 임베드(블록)
    if ((m = t.match(/^\[\[(T_\d{1,4})(?:\|([^\]]+))?\]\]$/))) {
      flushPara(); closeList();
      const id = m[1];
      const opt = (m[2] ?? "").trim();
      if (/^embed$/i.test(opt)) {
        // 라이브 임베드 — 해당 테마 그래프를 글 안에서 그대로 불러온다.
        out.push(
          `<span class="my-5 block overflow-hidden rounded-2xl border border-white/12 bg-black/40">` +
            `<iframe src="/graph/${id}" loading="lazy" title="테마 그래프 ${id}" style="width:100%;height:560px;border:0;display:block"></iframe>` +
            `<a href="/graph/${id}" target="_blank" rel="noreferrer" class="flex items-center justify-between px-4 py-2.5 text-[12px] text-white/55 no-underline transition hover:text-white/90">` +
              `<span>📊 ${id} · 관련 테마 그래프</span><span class="text-indigo-200/70">새 탭에서 열기 →</span>` +
            `</a>` +
          `</span>`,
        );
      } else {
        const label = opt ? escapeHtml(opt) : "테마 그래프";
        out.push(
          `<a href="/graph/${id}" class="my-4 flex items-center justify-between gap-3 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 no-underline transition hover:border-indigo-300/60 hover:bg-indigo-500/20">` +
            `<span class="flex items-center gap-2.5">` +
              `<span style="font-size:18px">📊</span>` +
              `<span class="flex flex-col">` +
                `<span class="text-[14px] font-semibold text-white">${label}</span>` +
                `<span class="text-[11px] text-white/50">${id} · 관련 테마 그래프 열기</span>` +
              `</span>` +
            `</span>` +
            `<span class="text-indigo-200/70">→</span>` +
          `</a>`,
        );
      }
    } else if ((m = t.match(/^#{1,3}\s+(.*)$/))) {
      flushPara(); closeList();
      const level = t.match(/^#+/)![0].length;
      const cls = level === 1 ? "mt-6 mb-2 text-2xl font-extrabold text-white"
        : level === 2 ? "mt-5 mb-2 text-xl font-bold text-white"
        : "mt-4 mb-1.5 text-lg font-bold text-white/95";
      out.push(`<h${level} class="${cls}">${inline(m[1])}</h${level}>`);
    } else if ((m = t.match(/^[-*]\s+(.*)$/))) {
      flushPara();
      if (!inList) { out.push('<ul class="my-3 list-disc space-y-1 pl-5 text-white/85">'); inList = true; }
      out.push(`<li class="leading-relaxed">${inline(m[1])}</li>`);
    } else if ((m = t.match(/^>\s+(.*)$/))) {
      flushPara(); closeList();
      out.push(`<blockquote class="my-3 border-l-2 border-sky-400/50 pl-3 text-white/70 italic">${inline(m[1])}</blockquote>`);
    } else {
      closeList();
      para.push(t);
    }
  }
  flushPara(); closeList();
  return out.join("\n");
}
