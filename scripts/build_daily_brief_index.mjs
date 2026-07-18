// scripts/build_daily_brief_index.mjs
// public/data/daily_briefs/YYYY-MM-DD.md 들을 스캔해 index.json 생성.
// - 날짜 목록(newest first)
// - 각 날짜별 "## 1. 오늘의 핫 테마 TOP 5" 5줄 요약(홈 카드용) 추출
import fs from "node:fs";
import path from "node:path";

const DIR = "public/data/daily_briefs";

function stripMd(s) {
  return String(s || "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/[*`]/g, "") // 언더스코어(_)는 테마ID·테마명에 쓰이므로 보존
    .replace(/^["“]|["”]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// "## 1. 오늘의 핫 테마 TOP 5" 표에서 최대 5행 추출
function extractTop5(md) {
  const lines = md.split(/\r?\n/);
  let i = lines.findIndex((l) => /^##\s*1\.\s*오늘의?\s*핫\s*테마/.test(l));
  if (i < 0) return [];
  const rows = [];
  let seenSep = false;
  for (let j = i + 1; j < lines.length && rows.length < 5; j++) {
    const l = lines[j].trim();
    if (l.startsWith("## ") || l.startsWith("---")) break; // 다음 섹션
    if (!l.startsWith("|")) continue;
    const cells = l.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c) || c === "")) { seenSep = true; continue; } // separator
    if (!seenSep) continue; // 헤더행 skip (구분선 전)
    // 컬럼: 순위 | 테마ID | 테마명 | 신호강도 | 트리거 | 근거
    const [rank, id, name, strength, , reason] = cells;
    if (!name) continue;
    rows.push({
      rank: stripMd(rank),
      id: stripMd(id),
      name: stripMd(name),
      strength: stripMd(strength),
      reason: stripMd(reason).slice(0, 90),
    });
  }
  return rows;
}

function main() {
  if (!fs.existsSync(DIR)) {
    console.error(`[daily-brief-index] dir not found: ${DIR}`);
    process.exit(0);
  }
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse(); // newest first

  const entries = files.map((f) => {
    const date = f.replace(/\.md$/, "");
    const md = fs.readFileSync(path.join(DIR, f), "utf-8");
    const titleM = md.match(/^#\s+(.+)$/m);
    return {
      date,
      title: titleM ? stripMd(titleM[1]) : `데일리 브리핑 — ${date}`,
      themes: extractTop5(md),
    };
  });

  const out = path.join(DIR, "index.json");
  fs.writeFileSync(out, JSON.stringify(entries, null, 2), "utf-8");
  console.log(`[daily-brief-index] wrote ${out} — ${entries.length} briefs (latest: ${entries[0]?.date})`);
}

main();
