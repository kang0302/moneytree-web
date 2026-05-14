// scripts/daily_brief.mjs
// 매일 아침 4개 소스를 fetch → SSOT 테마 인덱스 컨텍스트 주입 → Anthropic API로
// 테마 매핑 분석 MD 생성.
//
// Sources:
//   1. Bloomberg Technology YouTube (latest video transcript)
//   2. CNBC Closing Bell YouTube (latest video transcript)
//   3. 한국경제 증권 RSS (top 10 articles)
//   4. 한경 컨센서스 (latest 5 analyst reports)
//
// Output: public/data/daily_briefs/YYYY-MM-DD.md
//
// Env required: ANTHROPIC_API_KEY

import fs from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import { YoutubeTranscript } from "youtube-transcript";
import Anthropic from "@anthropic-ai/sdk";

const SOURCES = {
  bloomberg: {
    type: "youtube",
    name: "Bloomberg Technology",
    channelId: "UCrM7B7SL_g1edFOnmj-SDKg",
  },
  closingBell: {
    type: "youtube",
    name: "CNBC's Closing Bell",
    channelId: "UCsCECHfjJQUH-JKQDozHwZA",
  },
  hankyung: {
    type: "rss",
    name: "한국경제 증권",
    url: "https://www.hankyung.com/feed/finance",
    limit: 10,
  },
  consensus: {
    type: "consensus",
    name: "한경 컨센서스",
    url: "https://consensus.hankyung.com/",
    limit: 5,
  },
};

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 12000; // 테마 매핑 테이블 + 10개 헤드라인 + 신규 후보 섹션 확장 대비
const TRANSCRIPT_HARD_LIMIT_CHARS = 30000; // 종목당 transcript 토큰 폭주 방지

// ---------- Source fetchers ----------

async function fetchYouTubeLatest({ name, channelId }) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  let xml;
  try {
    const res = await fetch(feedUrl);
    if (!res.ok) throw new Error(`YouTube feed HTTP ${res.status}`);
    xml = await res.text();
  } catch (e) {
    return { name, error: `feed fetch failed: ${e.message}` };
  }

  const parser = new XMLParser({ ignoreAttributes: false });
  const feed = parser.parse(xml);
  const entries = feed.feed?.entry ?? [];
  const list = Array.isArray(entries) ? entries : [entries];
  if (!list.length) return { name, error: "no entries in feed" };

  const latest = list[0];
  const videoId = latest["yt:videoId"];
  const title = String(latest.title ?? "").trim();
  const published = String(latest.published ?? "").trim();
  const link =
    (Array.isArray(latest.link) ? latest.link[0]?.["@_href"] : latest.link?.["@_href"]) ??
    `https://youtu.be/${videoId}`;
  const description = (latest["media:group"]?.["media:description"] ?? "").toString().trim();

  let transcript = null;
  let transcriptError = null;
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    transcript = items.map((i) => i.text).join(" ");
    if (transcript.length > TRANSCRIPT_HARD_LIMIT_CHARS) {
      transcript = transcript.slice(0, TRANSCRIPT_HARD_LIMIT_CHARS) + " ...[truncated]";
    }
  } catch (e) {
    transcriptError = e.message;
  }

  return {
    name,
    videoId,
    title,
    link,
    published,
    description,
    transcript,
    transcriptError,
  };
}

async function fetchHankyungRSS({ name, url, limit }) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const feed = parser.parse(xml);
    const items = feed.rss?.channel?.item ?? [];
    const list = Array.isArray(items) ? items : [items];
    return {
      name,
      items: list.slice(0, limit).map((it) => ({
        title: String(it.title ?? "").trim(),
        link: String(it.link ?? "").trim(),
        pubDate: String(it.pubDate ?? "").trim(),
        description: String(it.description ?? "")
          .replace(/<[^>]+>/g, "")
          .trim()
          .slice(0, 500),
      })),
    };
  } catch (e) {
    return { name, error: e.message };
  }
}

async function fetchConsensusLatest({ name, url, limit }) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MoneytreeBriefBot/1.0)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const reports = [];

    // 한경 컨센서스 메인 페이지 — table.bdtype1 또는 .table_style1 등 다양한 클래스 가능
    // 안전하게 모든 tbody tr을 시도
    $("table tbody tr").each((i, tr) => {
      if (reports.length >= limit) return false;
      const tds = $(tr).find("td");
      if (tds.length < 4) return;
      const dateStr = $(tds[0]).text().trim();
      const titleA = $(tds[1]).find("a").first();
      const title = titleA.text().trim() || $(tds[1]).text().trim();
      const href = titleA.attr("href") || "";
      const security = $(tds[2]).text().trim();
      const broker = $(tds[3]).text().trim();
      const analyst = tds[4] ? $(tds[4]).text().trim() : "";
      if (!title) return;
      reports.push({
        date: dateStr,
        title,
        link: href.startsWith("http") ? href : `https://consensus.hankyung.com${href}`,
        security,
        broker,
        analyst,
      });
    });
    return { name, items: reports.slice(0, limit) };
  } catch (e) {
    return { name, error: e.message };
  }
}

// ---------- SSOT theme index ----------

async function loadThemeIndex() {
  try {
    const text = await fs.readFile("public/data/theme/index.json", "utf-8");
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => ({
        themeId: String(x?.themeId ?? "").trim(),
        themeName: String(x?.themeName ?? "").trim(),
      }))
      .filter((x) => x.themeId && x.themeName);
  } catch (e) {
    console.warn("[loadThemeIndex] failed:", e.message);
    return [];
  }
}

function formatThemeIndexForPrompt(themes) {
  if (!themes.length) return "(테마 인덱스 로드 실패 — 일반 지식 기반 매핑)";
  return themes.map((t) => `- ${t.themeId}: ${t.themeName}`).join("\n");
}

// ---------- Anthropic prompt ----------

const SYSTEM_PROMPT = `당신은 머니트리 SSOT 테마 분석 도구입니다.
4개 소스(영상 transcript / 증권 헤드라인 / 애널리스트 리포트)를 입력받아,
moneytree-web의 기존 SSOT 테마 인덱스에 매핑하고, 신규 테마/자산 후보를 추출합니다.

핵심 작업:
1. 각 소스에서 종목·산업·매크로 시그널을 추출
2. 기존 테마 인덱스(아래 SSOT) 중 가장 강하게 매칭되는 테마를 선택 — 반드시 T_xxx ID 명시
3. 기존 테마로 안 잡히는 시그널은 신규 테마/자산 후보로 분리
4. 모든 매핑은 원문 인용(소스 종류 + 한 줄 quote)으로 근거 제시

# SSOT 테마 인덱스 (총 {THEME_COUNT}개)
{THEME_INDEX}

# 출력 포맷 (한국어 마크다운, 간결·정보밀도 우선)

# 머니트리 데일리 테마 매핑 — {DATE}

## 1. 오늘의 핫 테마 TOP 5
| 순위 | 테마 ID | 테마명 | 신호 강도 | 트리거 소스 | 한 줄 근거 |
|---|---|---|---|---|---|
| 1 | T_xxx | ... | ★★★ | Bloomberg / 한경 / 컨센서스 | "..." |

신호 강도: ★★★(다중 소스 교차) / ★★(단일 강한 시그널) / ★(약한 시사)

## 2. 신규 테마 후보
기존 인덱스에 없는 시그널만. 없으면 "해당 없음".
- **{제안 테마명}** — 근거: {소스} "{quote}"
  - 영향 자산 후보: {ticker1}/{exchange1}, {ticker2}/{exchange2}

## 3. 기존 테마 보강 후보
기존 T_xxx에 추가할 자산·관계.
- **T_xxx ({테마명})** ← 추가: {ticker}/{exchange} — 근거: {소스} "{quote}"

## 4. 소스별 핵심 요약
### Bloomberg Technology
**[{title}]({link})** ({published_kst})
- 핵심 시그널 3개 (테마 ID cross-ref)

### CNBC Closing Bell
**[{title}]({link})** ({published_kst})
- 핵심 시그널 3개 (테마 ID cross-ref)

### 한국경제 증권 헤드라인 (top 10)
1. **[{title}]({link})** — 한 줄 + 매핑 테마 T_xxx
... (10개)

### 한경 컨센서스 (latest 5)
1. **[{title}]({link})** — {broker} {analyst} — 핵심 thesis + 매핑 테마 T_xxx
... (5개)

---

규칙:
- 매핑은 반드시 SSOT 인덱스의 실제 T_xxx ID만 사용. 인덱스에 없는 ID 생성 금지.
- 추측은 "추정:" 접두어. 출처 인용은 짧은 직접 quote 권장.
- 빈 섹션은 "해당 없음"으로 명시 (섹션 생략 금지).

---
_생성: github-actions[bot] · {NOW_UTC}_`;

function buildUserMessage(sources) {
  const parts = [];
  parts.push(`# 소스별 원문 데이터\n\n`);

  // Bloomberg
  parts.push(`## [1] Bloomberg Technology\n`);
  if (sources.bloomberg?.error) {
    parts.push(`ERROR: ${sources.bloomberg.error}\n`);
  } else {
    parts.push(
      `Title: ${sources.bloomberg.title}\nLink: ${sources.bloomberg.link}\n` +
        `Published: ${sources.bloomberg.published}\n` +
        `Description: ${sources.bloomberg.description}\n` +
        `Transcript: ${
          sources.bloomberg.transcript ||
          `[unavailable: ${sources.bloomberg.transcriptError}]`
        }\n`
    );
  }

  // Closing Bell
  parts.push(`\n## [2] CNBC Closing Bell\n`);
  if (sources.closingBell?.error) {
    parts.push(`ERROR: ${sources.closingBell.error}\n`);
  } else {
    parts.push(
      `Title: ${sources.closingBell.title}\nLink: ${sources.closingBell.link}\n` +
        `Published: ${sources.closingBell.published}\n` +
        `Description: ${sources.closingBell.description}\n` +
        `Transcript: ${
          sources.closingBell.transcript ||
          `[unavailable: ${sources.closingBell.transcriptError}]`
        }\n`
    );
  }

  // Hankyung
  parts.push(`\n## [3] 한국경제 증권 RSS (top 10)\n`);
  if (sources.hankyung?.error) {
    parts.push(`ERROR: ${sources.hankyung.error}\n`);
  } else {
    sources.hankyung.items.forEach((it, i) => {
      parts.push(
        `${i + 1}. ${it.title}\n   Link: ${it.link}\n   Date: ${it.pubDate}\n   Desc: ${it.description}\n`
      );
    });
  }

  // Consensus
  parts.push(`\n## [4] 한경 컨센서스 (latest 5)\n`);
  if (sources.consensus?.error) {
    parts.push(`ERROR: ${sources.consensus.error}\n`);
  } else if (!sources.consensus.items.length) {
    parts.push(`(no reports parsed — check selector)\n`);
  } else {
    sources.consensus.items.forEach((it, i) => {
      parts.push(
        `${i + 1}. ${it.title}\n   Link: ${it.link}\n   Date: ${it.date}\n   Security: ${it.security}\n   Broker: ${it.broker}\n   Analyst: ${it.analyst}\n`
      );
    });
  }

  return parts.join("");
}

// ---------- Main ----------

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var missing");

  console.log("Loading SSOT theme index + fetching sources in parallel...");
  const [themes, bloomberg, closingBell, hankyung, consensus] = await Promise.all([
    loadThemeIndex(),
    fetchYouTubeLatest(SOURCES.bloomberg),
    fetchYouTubeLatest(SOURCES.closingBell),
    fetchHankyungRSS(SOURCES.hankyung),
    fetchConsensusLatest(SOURCES.consensus),
  ]);
  console.log(`SSOT themes loaded: ${themes.length}`);

  const sources = { bloomberg, closingBell, hankyung, consensus };
  console.log(
    JSON.stringify(
      {
        bloomberg: bloomberg.error
          ? { error: bloomberg.error }
          : { title: bloomberg.title, hasTranscript: !!bloomberg.transcript },
        closingBell: closingBell.error
          ? { error: closingBell.error }
          : { title: closingBell.title, hasTranscript: !!closingBell.transcript },
        hankyung: hankyung.error ? { error: hankyung.error } : { count: hankyung.items.length },
        consensus: consensus.error
          ? { error: consensus.error }
          : { count: consensus.items.length },
      },
      null,
      2
    )
  );

  const today = new Date();
  // KST date for output filename
  const kst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = kst.toISOString().slice(0, 10);
  const nowUtc = today.toISOString();

  const systemPrompt = SYSTEM_PROMPT
    .replaceAll("{DATE}", dateStr)
    .replaceAll("{NOW_UTC}", nowUtc)
    .replaceAll("{THEME_COUNT}", String(themes.length))
    .replaceAll("{THEME_INDEX}", formatThemeIndexForPrompt(themes));
  const userMsg = buildUserMessage(sources);

  console.log(`User message size: ${userMsg.length} chars`);
  console.log("Calling Anthropic...");
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: "user", content: userMsg }],
  });

  const md = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();

  const outDir = "public/data/daily_briefs";
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${dateStr}.md`);
  await fs.writeFile(outPath, md + "\n", "utf-8");
  console.log(`✅ Wrote ${outPath} (${md.length} chars)`);
}

main().catch((e) => {
  console.error("❌ Failed:", e);
  process.exit(1);
});
