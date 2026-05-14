// scripts/daily_brief.mjs
// 매일 아침 4개 소스를 fetch → Anthropic API로 데일리 브리프 MD 생성.
//
// Sources:
//   1. Bloomberg Technology YouTube (latest video transcript)
//   2. CNBC Closing Bell YouTube (latest video transcript)
//   3. 한국경제 증권 RSS (top 5 articles)
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
    limit: 5,
  },
  consensus: {
    type: "consensus",
    name: "한경 컨센서스",
    url: "https://consensus.hankyung.com/",
    limit: 5,
  },
};

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8000;
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

// ---------- Anthropic prompt ----------

const SYSTEM_PROMPT = `당신은 한국 주식·글로벌 시장 데일리 브리프 작성자입니다.
moneytree-web의 SSOT 온톨로지(테마/자산/사업영역/매크로/캐릭터)를 알고 있다는 가정 하에,
4개 소스를 받아 다음 구조의 한국어 마크다운 브리프를 작성하세요.
간결하고 정보 밀도 높게, 추측 표시는 명확히. 출처는 반드시 링크로.

# 머니트리 데일리 브리프 — {DATE}

## 1. 오늘의 매크로 이슈
- 3-5개 bullet, US/EU/CN/KR 횡단 (Fed/ECB/PBoC/BoK 정책, 주요 지표, 지정학 이벤트)

## 2. Bloomberg Technology 요약
**원문**: [{title}]({link}) ({published_kst})
- 핵심 인사이트 3-5개 (종목·테마 cross-reference)

## 3. CNBC Closing Bell 요약
**원문**: [{title}]({link}) ({published_kst})
- 핵심 인사이트 3-5개 (시장 마감 상황·섹터 흐름·종목 mover)

## 4. 한국경제 증권 헤드라인
1. **[{title}]({link})** — 한 줄 요약 (관련 종목·테마 명시)
... (5개)

## 5. 한경 컨센서스 애널리스트 리포트
1. **[{title}]({link})** — {broker} {analyst} — 핵심 thesis 한 줄
... (5개)

## 6. 테마/자산 제안 (SSOT 관점)
오늘 콘텐츠에서 추출한 머니트리 SSOT 보강 후보:
- **신규 테마 후보**: {theme_name} — 근거 (어느 소스의 어떤 시그널인지)
- **기존 테마 보강**: T_xxx에 {asset/관계} 추가 제안
- **신규 자산 후보**: {ticker}/{exchange} — 어느 테마에 속할지
- **신규 관계**: {asset_a} → {asset_b} {PARTNERS|SUPPLIES|IMPACTS} — 출처 인용

빈 항목은 "해당 없음"으로 표기. 추측은 "추정:" 접두어로 명시.

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
  parts.push(`\n## [3] 한국경제 증권 RSS (top 5)\n`);
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

  console.log("Fetching sources in parallel...");
  const [bloomberg, closingBell, hankyung, consensus] = await Promise.all([
    fetchYouTubeLatest(SOURCES.bloomberg),
    fetchYouTubeLatest(SOURCES.closingBell),
    fetchHankyungRSS(SOURCES.hankyung),
    fetchConsensusLatest(SOURCES.consensus),
  ]);

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

  const systemPrompt = SYSTEM_PROMPT.replaceAll("{DATE}", dateStr).replaceAll(
    "{NOW_UTC}",
    nowUtc
  );
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
