"use client";

// src/components/ThemeBriefing.tsx
// 테마 그래프 하단에 붙는 markdown briefing 섹션.
// 데이터 소스: GitHub raw — kang0302/import_MT/main/data/briefing/{themeId}.md
// 없으면 조용히 숨김 (그래프만 표시).
// briefing 의 본문 표 각 행에서 첫 셀의 ticker 를 추출 → 6개 기간 수익률 컬럼(3년/1년/YTD/1개월/7일/3일) 자동 부착.

import { Children, Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBriefingUrl, getBriefingFallbackUrl } from "@/lib/getBriefingUrl";
import { extractReturnByPeriod, type PeriodKey } from "@/lib/themeReturn";

// rehype-raw 가 remark-gfm 테이블과 호환성 이슈 → cell 내부 literal "<br>" 를 React node 단에서 직접 <br/> 로 치환.
function renderWithBrs(children: ReactNode): ReactNode {
  return Children.map(children, (child, idx) => {
    if (typeof child !== "string") return child;
    const parts = child.split(/<br\s*\/?>/i);
    if (parts.length === 1) return child;
    return (
      <Fragment key={idx}>
        {parts.map((part, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {part}
          </Fragment>
        ))}
      </Fragment>
    );
  });
}

type State = "loading" | "ok" | "missing" | "error";

async function tryFetchMd(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/** ReactMarkdown td children 에서 텍스트만 재귀 추출 — link 등 중첩 노드 평탄화. */
function extractText(node: any): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && node?.props?.children) {
    return extractText(node.props.children);
  }
  return "";
}

/** "[Name (TICKER)](url)" / "(062040)" / "(0027)" / "(RR.)" 등에서 티커 추출.
 *  비상장 "(비)"는 한글이라 매칭 안 됨 → null 반환 → 수익률 dash. */
function extractTickerFromCell(text: string): string | null {
  const m = text.match(/\(([A-Za-z][A-Za-z0-9.]*|\d{3,7})\)/);
  return m ? m[1] : null;
}

type AssetNode = {
  id: string;
  name: string;
  type?: string;
  exposure?: { ticker?: string; exchange?: string; country?: string };
  metrics?: Record<string, number | null | undefined>;
};

type Props = {
  themeId: string;
  /** ASSET 노드 배열 — 행별 수익률 6개 컬럼(3Y/1Y/YTD/1M/7D/3D) 자동 append 용. 미제공 시 수익률 컬럼 숨김. */
  nodes?: AssetNode[];
};

// 왼쪽=가장 긴 기간, 오른쪽=가장 짧은 기간 (BAROMETER 추세 차트와 동일).
const RETURN_COLUMNS: Array<{ periodKey: PeriodKey; label: string }> = [
  { periodKey: "3Y", label: "3년" },
  { periodKey: "1Y", label: "1년" },
  { periodKey: "YTD", label: "YTD" },
  { periodKey: "1M", label: "1개월" },
  { periodKey: "7D", label: "7일" },
  { periodKey: "3D", label: "3일" },
];

/** 수익률 셀 렌더 — 한국 시장 컨벤션: 양수=빨강, 음수=파랑, null=회색 dash. */
function ReturnCell({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <td className="border border-white/30 px-2 py-2 text-right align-middle text-[12px] text-white/35">
        —
      </td>
    );
  }
  const isUp = value >= 0;
  const color = isUp ? "text-red-400" : "text-sky-400";
  const sign = isUp ? "+" : "";
  return (
    <td
      className={`border border-white/30 px-2 py-2 text-right align-middle text-[12px] tabular-nums font-semibold ${color}`}
    >
      {`${sign}${value.toFixed(2)}%`}
    </td>
  );
}

export default function ThemeBriefing({ themeId, nodes }: Props) {
  const [md, setMd] = useState<string | null>(null);
  const [state, setState] = useState<State>("loading");

  const showReturnColumns = !!nodes;

  // ticker → ASSET node lookup. ticker 는 origin 그대로 사용.
  const tickerToNode = useMemo(() => {
    const m = new Map<string, AssetNode>();
    if (!nodes) return m;
    for (const n of nodes) {
      if (n.type !== "ASSET") continue;
      const t = (n.exposure?.ticker ?? "").trim();
      if (!t) continue;
      m.set(t, n);
    }
    return m;
  }, [nodes]);

  // Markdown fetch
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setMd(null);

    (async () => {
      const primary = await tryFetchMd(getBriefingUrl(themeId));
      if (cancelled) return;
      if (primary) {
        setMd(primary);
        setState("ok");
        return;
      }
      const fbUrl = getBriefingFallbackUrl(themeId);
      if (fbUrl) {
        const fb = await tryFetchMd(fbUrl);
        if (cancelled) return;
        if (fb) {
          setMd(fb);
          setState("ok");
          return;
        }
      }
      if (!cancelled) setState("missing");
    })();

    return () => {
      cancelled = true;
    };
  }, [themeId]);

  // 파일 없으면 섹션 자체를 숨김
  if (state === "missing" || state === "error" || !md) return null;

  return (
    <section className="mt-3 rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-[14px] font-semibold text-white/90">
          브리핑 테이블 <span className="text-white/55">(Briefing Table)</span>
        </h3>
        <span className="text-[10px] text-white/40">data/briefing/{themeId}.md</span>
      </div>

      <article className="text-[14px] leading-relaxed text-white/85">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto">
                <table className="w-full border-collapse border border-white/40 text-[13px] [&_tbody_tr:nth-child(even)]:bg-white/4 [&_tbody_tr:hover]:bg-white/7">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-white/10">{children}</thead>,
            tr: ({ children, node, ...rest }: any) => {
              if (!showReturnColumns) {
                return <tr {...(rest as any)}>{children}</tr>;
              }
              const isHeader =
                Array.isArray(node?.children) &&
                node.children.some((c: any) => c?.tagName === "th");
              const arr = Children.toArray(children);
              if (isHeader) {
                return (
                  <tr {...(rest as any)}>
                    {arr}
                    {RETURN_COLUMNS.map((c) => (
                      <th
                        key={c.label}
                        className="w-16 border border-white/40 px-2 py-2 text-right align-middle text-[12px] font-semibold text-white"
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                );
              }
              const first = arr[0] as any;
              const ticker = extractTickerFromCell(extractText(first));
              const assetNode = ticker ? tickerToNode.get(ticker) : null;
              return (
                <tr {...(rest as any)}>
                  {arr}
                  {RETURN_COLUMNS.map((c) => (
                    <ReturnCell
                      key={c.label}
                      value={extractReturnByPeriod(assetNode?.metrics, c.periodKey)}
                    />
                  ))}
                </tr>
              );
            },
            th: ({ children }) => (
              <th className="border border-white/40 px-3 py-2 text-left align-top text-[13px] font-semibold text-white">
                {renderWithBrs(children)}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-white/30 px-3 py-2 align-top text-[13px] text-white/85">
                {renderWithBrs(children)}
              </td>
            ),
            h1: ({ children }) => <h1 className="mt-3 mb-2 text-[16px] font-semibold text-white/95">{children}</h1>,
            h2: ({ children }) => <h2 className="mt-3 mb-2 text-[14px] font-semibold text-white/90">{children}</h2>,
            h3: ({ children }) => <h3 className="mt-2 mb-1 text-[13px] font-semibold text-white/85">{children}</h3>,
            p: ({ children }) => <p className="my-1.5">{children}</p>,
            ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
            ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
            li: ({ children }) => <li className="my-0.5">{children}</li>,
            hr: () => <hr className="my-3 border-white/10" />,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:underline">
                {children}
              </a>
            ),
            code: ({ children }) => (
              <code className="rounded bg-white/10 px-1 py-px text-[11px] text-white/90">{children}</code>
            ),
          }}
        >
          {md}
        </ReactMarkdown>
      </article>
    </section>
  );
}
