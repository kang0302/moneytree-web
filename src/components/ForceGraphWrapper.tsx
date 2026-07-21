// src/components/ForceGraphWrapper.tsx
// UI COMPACT v1 - 2026-02-16
// - Allow external control of lockTheme (header)
// PATCH 2026-02-23
// - Text size x1.5 for all graph labels
// - Tuning to reduce overlap: stronger collide, slightly longer links, slightly stronger charge
// PATCH 2026-02-23 (Bloomberg Hover)
// - Remove old 3 lines (type~PER block) in node hover
// - Show only return (top), divider, 2x2 grid, footer meta
// PATCH 2026-02-23 (FOCUS)
// - Read ?focus=NODE_ID from URL if focusId prop is not provided
// - Auto center/zoom & highlight the focused node

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { forceRadial, forceY } from "d3-force";
import { staleLevel, staleLabel } from "@/components/GraphRightPanel";
import { getBriefingUrl } from "@/lib/getBriefingUrl";
// import { getLogoUrl, getInitials } from "@/lib/logoMap"; // CompanyLogo 미구현 (logoMap 파일 부재)

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export type PeriodKey = "3D" | "7D" | "1M" | "YTD" | "1Y" | "3Y";

type MetricsT = {
  perFwd12m?: number;
  per?: number;
  pe?: number;

  ret3d?: number;
  ret7d?: number;
  ret1m?: number;
  retYtd?: number;
  ret1y?: number;
  ret3y?: number;

  return3d?: number;
  return7d?: number;
  return30d?: number;
  return1m?: number;
  returnYtd?: number;
  return1y?: number;
  return3y?: number;

  // ✅ Bloomberg hover: optional value fields (if present)
  last_price?: number;
  close?: number;
  market_cap?: number;
  marketCap?: number;
  valuationAsOf?: string;
  val_date?: string;
  asof?: string;

  ticker?: string;
  exchange?: string;
  country?: string;

  [key: string]: any;
};

type NodeT = {
  id: string;
  name: string;
  type?: string;
  metrics?: MetricsT;

  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;

  asset_name_ko?: string;
  asset_name_en?: string;
  business_field_ko?: string;
  business_field_en?: string;
  name_ko?: string;
  name_en?: string;
  label_ko?: string;
  label_en?: string;

  // optional meta (some datasets put these on node instead of metrics)
  ticker?: string;
  exchange?: string;
  country?: string;

  [key: string]: any;
};

type EdgeT = {
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  src?: string;
  dst?: string;

  type?: string;
  label?: string;
  relType?: string;
  relation?: string;

  [key: string]: any;
};

type Props = {
  themeId: string;
  themeName: string;
  nodes: NodeT[];
  edges: EdgeT[];

  period: PeriodKey;
  onChangePeriod: (p: PeriodKey) => void;

  onSelectNode?: (n: NodeT | null) => void;
  showPeriodButtons?: boolean;

  // ✅ external lock support (header)
  lockTheme?: boolean;
  onChangeLockTheme?: (v: boolean) => void;

  // ✅ overlay controls on/off (default true)
  showOverlayControls?: boolean;

  // ✅ focus node highlight (from search or external)
  focusId?: string | null;

  // ✅ hover에 표시할 테마 바로미터 요약 (선택). GraphClient에서 computeThemeReturnSummary 결과를 그대로 전달.
  themeReturn?: any;

  // ✅ THEME hover 박스에 표시할 테마 설명 (meta.notes 기반). 비어 있으면 설명 영역 미표시.
  themeDescription?: string;

  // ✅ ASSET 노드 색상 결정 모드 (default "return": 수익률 색깔, "type": 타입 base 색).
  //    asset view (/asset/[assetId]) 에서 metrics 없는 노드들이 모두 회색으로 보이는 문제 해결용.
  assetColorMode?: "return" | "type";

  // ✅ 24h 이내 갱신된 인사이트 보유 노드 ID set (T_xxx / A_xxx) — hover 박스에 NEW 배지 표시용.
  freshInsightIds?: Set<string>;
};

// ─────────────────────────────────────────────
// 🏢 Company logo (hover box top-left, 40x40 round)
// ─────────────────────────────────────────────
// CompanyLogo 컴포넌트는 logoMap 의존 — 미구현이라 제거 (hover 박스에서 로고 영역 생략).

// =========================
// 🛰 Orbit layout (4 layered radial)
//   1궤도(180): Theme에 직접 연결된 Macro(IMPACTS) / Character(HAS_TRAIT) / BusinessField / EXPOSED_TO Asset(ETF)  → 11시~1시
//   2궤도(300): THEMED_AS Asset                                                                                     → 2시~10시
//   3궤도(440): (A) SUPPLIES/OPERATES/INVESTS/PARTNERS/COMPETES로 layer2 Asset에 연결된 Asset
//               (B) IMPACTS / HAS_TRAIT로 layer2 Asset에 연결된 Macro / Character                                    → layer2 이웃 각도 기준
//   4궤도(560): layer3 Asset에 연결된 Macro / Character                                                              → layer3 이웃 각도 그대로
// =========================
// 🎯 Graph layout config — 앞으로 레이아웃 조정은 이 객체만 수정
const GRAPH_CONFIG = {
  nodeRadius: {
    theme: 11,   // 중앙 Theme 노드
    asset: 19,   // 일반 Asset 노드
    small: 8,    // Macro / BusinessField / Character 노드
  },
  orbitRadius: {
    l1: 200,     // Macro / BF / Character / EXPOSED_TO ETF
    l2: 300,     // THEMED_AS Asset
    l3: 400,     // 연결 Asset / IMPACTS·HAS_TRAIT → L2 Macro·Character
    l4: 500,     // IMPACTS·HAS_TRAIT → L3 Asset Macro·Character
  },
  force: {
    charge: -200,
    // collide은 노드별 반경 + 타입별 패딩 (원이 1/2로 작아진 만큼 패딩도 같이 축소).
    collidePad: { theme: 10, asset: 38, smallL1: 8, smallOuter: 18 },
    linkDistance: {
      themeL1: 200,
      themeL2: 300,
      l2l3:    110,
      l3l4:    100,
    },
    velocityDecay: 0.55,
    alphaDecay:    0.04,
  },
  zoom: {
    initial: 1.0,
  },
  // 중심 노드 위치 — viewport 의 비율 (0.5 = 정중앙).
  // L1 (12시 sector) 은 1궤도만 차지하고 L2/L3 (6시 sector) 는 다궤도라
  // 정중앙이면 아래쪽이 잘림 → 중심을 위로 올려 아래 공간 확보 (2026-05-19 사용자 결정).
  center: {
    yRatio: 0.28,
  },
} as const;

// 비스펙 튜닝값 (구조적 파라미터, GRAPH_CONFIG와 분리)
const LINK_STRENGTH          = 0.3;
const TOWARD_PARENT_STRENGTH = 0.18; // L3/L4 → parent 각도 방향성 force (약하게: 형제 노드들이 collide로 펼쳐지게 둠)

// Angular sectors (canvas coords: -π/2 = 12시, +π/2 = 6시)
// Layer1 (Theme 직접 연결 Macro/Character/BF/EXPOSED_TO Asset): 12시 중심, 10~2시 부채꼴
const LAYER1_CENTER_ANGLE = -Math.PI / 2;        // -90°  (12시)
const LAYER1_HALF_SPAN    =  Math.PI / 3;        //  60°  → 10~2시 (총 120°)
const LAYER1_ANGLE_START = LAYER1_CENTER_ANGLE - LAYER1_HALF_SPAN; // -150°  (10시)
const LAYER1_ANGLE_END   = LAYER1_CENTER_ANGLE + LAYER1_HALF_SPAN; //  -30°  ( 2시)
const LAYER1_STACK_STEP  = Math.PI / 18;         //  10°  (적을 때 12시 주변에 모이도록)
// Layer2 (Theme 직접 연결 THEMED_AS Asset): 6시 중심, 2시01분~9시59분 (top L1 sector 제외)
const LAYER2_CENTER_ANGLE = Math.PI / 2;         //  90°  (6시)
const LAYER2_HALF_SPAN    = Math.PI * 2 / 3 - 0.04; // ~115.7° → 2시01분~9시59분 (총 ~231°)
const LAYER2_STACK_STEP   = Math.PI / 10;        //  18°  (인접 노드 간 자연 간격, 많아지면 자동 축소)
const LAYER3_ASSET_JITTER = Math.PI / 6;         // Asset: layer2 이웃 각도 ±30°
const L3_L4_STACK_STEP   = Math.PI / 7;          // Macro/Character/BF 같은 이웃에 여러 개: ±25.7°

// Asset ↔ Asset relations
const ASSET_LINK_RELS = new Set(["SUPPLIES", "OPERATES", "INVESTS", "PARTNERS", "COMPETES"]);

function normType(t?: string) {
  const x = (t ?? "").toUpperCase();
  if (x === "THEME") return "THEME";
  if (x === "ASSET") return "ASSET";
  if (x.includes("BUSINESS_FIELD")) return "FIELD";
  if (x.includes("FIELD")) return "FIELD";
  return x || "UNKNOWN";
}

function resolveLabel(n: any, fallbackThemeName?: string) {
  const t = normType(n?.type);

  if (t === "THEME") {
    const v =
      (typeof n?.label_ko === "string" && n.label_ko.trim()) ||
      (typeof n?.name_ko === "string" && n.name_ko.trim()) ||
      (typeof n?.themeName === "string" && n.themeName.trim()) ||
      (typeof n?.name === "string" && n.name.trim()) ||
      (typeof fallbackThemeName === "string" && fallbackThemeName.trim()) ||
      n?.id;
    return String(v ?? "");
  }

  if (t === "ASSET") {
    const v =
      (typeof n?.asset_name_ko === "string" && n.asset_name_ko.trim()) ||
      (typeof n?.name_ko === "string" && n.name_ko.trim()) ||
      (typeof n?.label_ko === "string" && n.label_ko.trim()) ||
      (typeof n?.asset_name_en === "string" && n.asset_name_en.trim()) ||
      (typeof n?.name_en === "string" && n.name_en.trim()) ||
      (typeof n?.label_en === "string" && n.label_en.trim()) ||
      (typeof n?.name === "string" && n.name.trim()) ||
      n?.id;
    return String(v ?? "");
  }

  if (t === "FIELD") {
    const v =
      (typeof n?.business_field_ko === "string" && n.business_field_ko.trim()) ||
      (typeof n?.name_ko === "string" && n.name_ko.trim()) ||
      (typeof n?.label_ko === "string" && n.label_ko.trim()) ||
      (typeof n?.business_field_en === "string" && n.business_field_en.trim()) ||
      (typeof n?.name_en === "string" && n.name_en.trim()) ||
      (typeof n?.label_en === "string" && n.label_en.trim()) ||
      (typeof n?.name === "string" && n.name.trim()) ||
      n?.id;
    return String(v ?? "");
  }

  const v =
    (typeof n?.name_ko === "string" && n.name_ko.trim()) ||
    (typeof n?.label_ko === "string" && n.label_ko.trim()) ||
    (typeof n?.name === "string" && n.name.trim()) ||
    n?.id;
  return String(v ?? "");
}

function nodeRadius(n: NodeT, isTheme: boolean) {
  if (isTheme) return GRAPH_CONFIG.nodeRadius.theme;
  const t = normType(n.type);
  if (t === "ASSET") return GRAPH_CONFIG.nodeRadius.asset;
  return GRAPH_CONFIG.nodeRadius.small; // BusinessField / Macro / Character 등 작은 노드
}

// ✅ PATCH: 문자열 숫자도 파싱
function pickNum(v: any): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, "");
    if (!s) return undefined;
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function normalizePct(v: number) {
  // heuristic 제거 (2026-05-26): 원천 데이터를 % 단위로 신뢰.
  // 이전 `|v| ≤ 1.5 면 ×100` 는 정상 작은 변동(-0.51%·+0.64%)을 -51%·+64% 로 둔갑시키던 bug 원인.
  return v;
}

function getReturnByPeriod(n: NodeT, p: PeriodKey): number | undefined {
  const m: any = (n as any).metrics ?? {};

  // ✅ Yahoo Finance 실시간 폴백 값(GraphClient에서 주입)이 있으면 절대 우선.
  const live = m._liveReturn;
  if (typeof live === "number" && Number.isFinite(live)) return live;

  const P = String(p).toUpperCase() as PeriodKey;
  const pLower = P.toLowerCase();

  // ✅ PATCH: return_7D / return_3D / return_1M / return_YTD / return_1Y / return_3Y 대응 추가
  const candidates: string[] = (() => {
    switch (P) {
      case "3D":
        return [
          "ret3d",
          "r3d",
          "return3d",
          "return_3d",
          "return_3D", // ✅ 추가
          "ret_3d",
          "3d",
          "3D",
          "d3",
          "3day",
          "3days",
        ];
      case "7D":
        return [
          "ret7d",
          "r7d",
          "return7d",
          "return_7d",
          "return_7D", // ✅ 추가
          "ret_7d",
          "7d",
          "7D",
          "d7",
          "7day",
          "7days",
        ];
      case "1M":
        return [
          "ret1m",
          "r1m",
          "return1m",
          "return_1m",
          "return_1M", // ✅ 추가
          "ret_1m",
          "1m",
          "1M",
          "m1",
          "30d",
          "1mo",
          "1month",
        ];
      case "YTD":
        return [
          "retYtd", // ✅ 추가(대소문자 혼재 대응)
          "retytd",
          "rytd",
          "returnYtd",
          "returnytd",
          "return_ytd",
          "return_YTD", // ✅ 추가
          "ret_ytd",
          "ytd",
          "YTD",
        ];
      case "1Y":
        return [
          "ret1y",
          "r1y",
          "return1y",
          "return_1y",
          "return_1Y", // ✅ 추가
          "ret_1y",
          "1y",
          "1Y",
          "y1",
          "1yr",
          "1year",
        ];
      case "3Y":
        return [
          "ret3y",
          "r3y",
          "return3y",
          "return_3y",
          "return_3Y", // ✅ 추가
          "ret_3y",
          "3y",
          "3Y",
          "y3",
          "3yr",
          "3year",
        ];
      default:
        return [pLower, P];
    }
  })();

  const tryPick = (obj: any): number | undefined => {
    if (!obj || typeof obj !== "object") return undefined;
    for (const k of candidates) {
      const v = pickNum(obj[k]);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  // 1) direct keys on metrics
  let v = tryPick(m);

  // 2) common nested shapes
  if (v === undefined) v = tryPick(m.returns);
  if (v === undefined) v = tryPick(m.return);
  if (v === undefined) v = tryPick(m.performance);
  if (v === undefined) v = tryPick(m.performance?.returns);
  if (v === undefined) v = tryPick(m.performance?.return);

  // 3) metrics.returns[pLower] style
  if (v === undefined && m?.returns && typeof m.returns === "object") {
    v = pickNum(m.returns[pLower] ?? m.returns[P] ?? m.returns[pLower.toUpperCase()]);
  }

  if (v === undefined) return undefined;

  // MoneyTree 원천 데이터는 모두 % 단위 (2.31 = +2.31%).
  // 과거 '|v|<1 이면 ×100' heuristic 은 작은 정상 변동(0.79% 등) 을 79% 로
  // 오변환시켜 commit ebbaaea 에서 두 곳 제거. 여기 getReturnByPeriod 도
  // 동일 원칙 — 원천 신뢰, 변환 없이 그대로 반환.
  return v;
}

function colorFromReturn(r?: number) {
  if (typeof r !== "number" || !Number.isFinite(r)) return "#888888"; // 수익률 없음 → 회색

  // ✅ 한국 주식 시장 관행: 빨강 = 상승, 파랑 = 하락 (수익률 크기별 농도 차등)
  if (r >= 50) return "#FF0000";   // +50% 이상 → 진한 빨강
  if (r >= 20) return "#FF4444";   // +20~50%   → 중간 빨강
  if (r >= 5)  return "#FF8888";   // +5~20%    → 연한 빨강
  if (r >= 0)  return "#FFCCCC";   // 0~+5%     → 아주 연한 빨강
  if (r >= -5) return "#CCCCFF";   // 0~-5%     → 아주 연한 파랑
  if (r >= -20) return "#8888FF";  // -5~-20%   → 연한 파랑
  return "#0000FF";                // -20% 이하 → 진한 파랑
}

function nodeBaseColor(n: NodeT, isTheme: boolean) {
  if (isTheme) return "#F2C94C";          // theme(main): yellow
  const t = normType(n.type);
  if (t === "THEME") return "#F2C94C";    // theme(non-main, e.g. asset view 의 주변 테마들): yellow
  if (t === "ASSET") return "#22d3ee";    // asset: cyan (base — return color 가 override 안 할 때)
  if (t === "FIELD") return "#D946EF";    // BF: magenta
  if (t === "MACRO") return "#FB923C";    // macro: orange
  if (t === "CHARACTER") return "#34d399"; // character: emerald green (BF 마젠타와 명확히 구분)
  return "#9CA3AF";                       // 기타: gray
}

function pickEdgeEndpoints(e: EdgeT): { s?: string; t?: string } {
  const s =
    (typeof e.from === "string" && e.from.trim()) ||
    (typeof e.source === "string" && e.source.trim()) ||
    (typeof e.src === "string" && e.src.trim()) ||
    undefined;

  const t =
    (typeof e.to === "string" && e.to.trim()) ||
    (typeof e.target === "string" && e.target.trim()) ||
    (typeof e.dst === "string" && e.dst.trim()) ||
    undefined;

  return { s, t };
}

function pickRelType(e: EdgeT): string {
  return (
    (typeof e.type === "string" && e.type.trim()) ||
    (typeof e.label === "string" && e.label.trim()) ||
    (typeof e.relType === "string" && e.relType.trim()) ||
    (typeof e.relation === "string" && e.relation.trim()) ||
    ""
  );
}

export default function ForceGraphWrapper({
  themeId,
  themeName,
  nodes,
  edges,
  period,
  onChangePeriod,
  onSelectNode,
  showPeriodButtons = true,
  lockTheme: lockThemeProp,
  onChangeLockTheme,
  showOverlayControls = true,
  focusId,
  themeReturn,
  themeDescription,
  assetColorMode = "return",
  freshInsightIds,
}: Props) {
  const fgRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [size, setSize] = useState({ w: 800, h: 560 });

  // ✅ internal fallback (if parent doesn't control)
  const [lockThemeInternal, setLockThemeInternal] = useState(false);
  const lockTheme = typeof lockThemeProp === "boolean" ? lockThemeProp : lockThemeInternal;

  const setLockTheme = (v: boolean) => {
    if (typeof lockThemeProp === "boolean") onChangeLockTheme?.(v);
    else setLockThemeInternal(v);
  };

  const [hoverNode, setHoverNode] = useState<NodeT | null>(null);
  const [hoverLink, setHoverLink] = useState<any | null>(null);

  // ✅ 출처(provenance): 중앙 evidence 저장소 + 클릭된 엣지 디테일 패널
  const [evidenceMap, setEvidenceMap] = useState<Record<string, any>>({});
  const [selectedEdge, setSelectedEdge] = useState<any | null>(null);

  // 브리핑 핵심사업 매핑 (ticker → 핵심사업 텍스트, <br> 보존)
  const [coreBizMap, setCoreBizMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!themeId) {
      setCoreBizMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(getBriefingUrl(themeId), { cache: "no-store" });
        if (!r.ok) return;
        const text = await r.text();
        const map = new Map<string, string>();
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim().startsWith("|")) continue;
          if (line.includes("---")) continue;
          if (line.includes("종목") && line.includes("핵심")) continue;
          const cells = line.split("|").slice(1, -1).map((c) => c.trim());
          if (cells.length < 2) continue;
          const m = cells[0].match(/\(([A-Za-z][A-Za-z0-9.]*|\d{3,7})(?:\s+[A-Z]+)*\)/);
          if (!m) continue;
          if (cells[1]) map.set(m[1], cells[1]);
        }
        if (!cancelled) setCoreBizMap(map);
      } catch {
        // briefing 없으면 조용히 무시
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [themeId]);
  // ✅ 출처 저장소 로드 (import_MT/data/ssot/evidence_ssot.jsonl, GitHub raw main)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url =
          "https://raw.githubusercontent.com/kang0302/import_MT/main/data/ssot/evidence_ssot.jsonl";
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const text = await r.text();
        const map: Record<string, any> = {};
        for (const line of text.split(/\r?\n/)) {
          const s = line.trim();
          if (!s) continue;
          try {
            const rec = JSON.parse(s);
            if (rec?.evidence_id) map[rec.evidence_id] = rec;
          } catch {}
        }
        if (!cancelled) setEvidenceMap(map);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  // 브리핑 테이블이 viewport 진입 시 좌측 상단 테마 설명 패널 자동 숨김 (겹침 방지).
  // ThemeBriefing 은 비동기 fetch 후 렌더라 mount 시점에 DOM 에 없을 수 있음 →
  // MutationObserver 로 element 등장 감지 후 IntersectionObserver 부착.
  const [briefingVisible, setBriefingVisible] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;

    let intersectionObs: IntersectionObserver | null = null;

    const attachIntersection = (el: HTMLElement) => {
      intersectionObs = new IntersectionObserver(
        (entries) => setBriefingVisible(!!entries[0]?.isIntersecting),
        { threshold: 0.05 }
      );
      intersectionObs.observe(el);
    };

    // 이미 DOM 에 있으면 즉시 부착
    const existing = document.querySelector<HTMLElement>("[data-briefing-section]");
    if (existing) {
      attachIntersection(existing);
      return () => intersectionObs?.disconnect();
    }

    // 없으면 등장 대기 (ThemeBriefing 의 비동기 fetch 완료 후)
    const mutationObs = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>("[data-briefing-section]");
      if (el) {
        mutationObs.disconnect();
        attachIntersection(el);
      }
    });
    mutationObs.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObs.disconnect();
      intersectionObs?.disconnect();
    };
  }, []);

  // ──────────────────────────────────────────────────────────────
  // 🎬 Entrance animation: staggered by orbit layer
  //   0ms    → Theme
  //   600ms  → layer1 (Theme에 직접 연결된 Macro / Character / BF / EXPOSED_TO ETF)
  //   1200ms → layer2 (THEMED_AS Asset)
  //   1800ms → layer3 (layer2 Asset에 연결된 Asset / Macro / Character)
  //   2400ms → layer4 (layer3 Asset에 연결된 Macro / Character)
  //   같은 레이어 내: 0~200ms 랜덤 jitter
  // ──────────────────────────────────────────────────────────────
  const LAYER_DELAY_MS = {
    theme:  0,
    layer1: 600,
    layer2: 1200,
    layer3: 1800,
    layer4: 2400,
  } as const;
  type LayerKey = keyof typeof LAYER_DELAY_MS;
  const INTRA_LAYER_JITTER_MAX_MS = 900;
  const NODE_ANIM_DUR_MS = 350;
  const EDGE_ANIM_DUR_MS = 250;
  const EXTRA_ASSET_STAGGER_MS = 120; // 확장 시 추가 layer2 asset 노드 간 간격
  const DEFAULT_ASSET_LIMIT = 10;
  const animStartRef = useRef<number | null>(null);
  // ✅ 첫 렌더 시점에 animStart를 즉시 셋팅. useEffect보다 먼저 실행되므로
  //   초기 paint에서 노드들이 "no animation, fully visible"로 깜빡 노출되는 현상 방지.
  if (animStartRef.current === null && typeof performance !== "undefined") {
    animStartRef.current = performance.now();
  }
  const rafRef = useRef<number | null>(null);
  const [, setAnimTick] = useState(0);

  // 🎯 Full Asset toggle — 기본은 상위 10개만 (return_7d desc), 클릭 시 전체 표시
  const [expanded, setExpanded] = useState(false);
  const expandStartRef = useRef<number | null>(null);
  const rafExpandRef = useRef<number | null>(null);

  const getNodeLayer = (id?: string): LayerKey => {
    if (!id) return "layer3";
    if (id === themeNodeId) return "theme";
    if (layerInfo.layer1.has(id)) return "layer1";
    if (layerInfo.layer2.has(id)) return "layer2";
    if (layerInfo.layer3.has(id)) return "layer3";
    if (layerInfo.layer4.has(id)) return "layer4";
    return "layer3";
  };

  const getNodeReveal = (node: any): number => {
    const base = animStartRef.current ?? 0;
    const id = node?.id as string | undefined;
    // 숨겨진 layer2 asset(상위 10 밖)은 expand 클릭 시점부터 순차 등장
    if (id && layerInfo.layer2.has(id) && !assetRankInfo.topAssetIds.has(id)) {
      const expandBase = expandStartRef.current;
      if (expandBase == null) return base + LAYER_DELAY_MS.layer2;
      const order = assetRankInfo.extraAssetOrderMap.get(id) ?? 0;
      return expandBase + order * EXTRA_ASSET_STAGGER_MS;
    }
    const delay = LAYER_DELAY_MS[getNodeLayer(id)];
    const jitter = intraDelayMap.get(id ?? "") ?? 0;
    return base + delay + jitter;
  };

  // easeOutBack: 0 → ~1.1 overshoot → 1.0 (gives the "pop" feel the user asked for)
  const easeOutBack = (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const x = Math.max(0, Math.min(1, t));
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

  const getNodeAnimState = (node: any): { scale: number; opacity: number; visible: boolean } => {
    if (animStartRef.current === null) return { scale: 1, opacity: 1, visible: true };
    const elapsed = performance.now() - getNodeReveal(node);
    if (elapsed < 0) return { scale: 0, opacity: 0, visible: false };
    if (elapsed >= NODE_ANIM_DUR_MS) return { scale: 1, opacity: 1, visible: true };
    const p = elapsed / NODE_ANIM_DUR_MS;
    return { scale: easeOutBack(p), opacity: p, visible: true };
  };

  const getEdgeOpacity = (link: any): number => {
    if (animStartRef.current === null) return 1;
    const s = typeof link?.source === "object" ? link.source : null;
    const t = typeof link?.target === "object" ? link.target : null;
    if (!s || !t) return 1;
    const revealAt = Math.max(getNodeReveal(s), getNodeReveal(t));
    const elapsed = performance.now() - revealAt;
    if (elapsed < 0) return 0;
    if (elapsed >= EDGE_ANIM_DUR_MS) return 1;
    return elapsed / EDGE_ANIM_DUR_MS;
  };

  // ✅ URL ?focus=NODE_ID fallback (props가 없을 때만 사용)
  const [focusFromUrl, setFocusFromUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const read = () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const f = sp.get("focus");
        setFocusFromUrl(f && f.trim() ? f.trim() : null);
      } catch {
        setFocusFromUrl(null);
      }
    };

    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const effectiveFocusId = typeof focusId === "string" && focusId.trim() ? focusId.trim() : focusFromUrl;

  // 🎬 Start/restart entrance animation when the theme changes (first load + navigation).
  useEffect(() => {
    if (typeof window === "undefined") return;

    animStartRef.current = performance.now();

    // 테마 전환 시 확장 상태 리셋 (기본=상위10 모드로 돌아감)
    expandStartRef.current = null;
    setExpanded(false);

    const END_MS =
      Math.max(...Object.values(LAYER_DELAY_MS)) +
      INTRA_LAYER_JITTER_MAX_MS +
      NODE_ANIM_DUR_MS +
      EDGE_ANIM_DUR_MS;

    // 애니메이션 시작 시 시뮬레이션을 데워서 자연스러운 tick 기반 redraw 확보
    // (refresh()가 환경에 따라 no-op일 수 있어 이중 안전망)
    try { fgRef.current?.d3ReheatSimulation?.(); } catch {}

    const loop = () => {
      const elapsed = performance.now() - (animStartRef.current ?? 0);
      if (elapsed >= END_MS) {
        rafRef.current = null;
        setAnimTick((t) => t + 1);
        fgRef.current?.refresh?.();
        return;
      }
      setAnimTick((t) => t + 1);
      fgRef.current?.refresh?.();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // themeId drives it; we intentionally ignore the other helper constants (stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId]);

  // 🎬 Expand animation: 숨겨진 asset 들이 순차 등장
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!expanded) return;

    expandStartRef.current = performance.now();
    const extraCount = assetRankInfo.extraAssetOrderMap.size;
    if (extraCount === 0) return;

    const END_MS = extraCount * EXTRA_ASSET_STAGGER_MS + NODE_ANIM_DUR_MS + EDGE_ANIM_DUR_MS;

    const loop = () => {
      const elapsed = performance.now() - (expandStartRef.current ?? 0);
      if (elapsed >= END_MS) {
        rafExpandRef.current = null;
        setAnimTick((t) => t + 1);
        fgRef.current?.refresh?.();
        return;
      }
      setAnimTick((t) => t + 1);
      fgRef.current?.refresh?.();
      rafExpandRef.current = requestAnimationFrame(loop);
    };

    rafExpandRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafExpandRef.current !== null) {
        cancelAnimationFrame(rafExpandRef.current);
        rafExpandRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({
        w: Math.max(320, Math.floor(rect.width)),
        h: Math.max(320, Math.floor(rect.height)),
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clone nodes only when `nodes` prop identity changes, so x/y positions
  // persist across expand toggles.
  const allClonedNodes = useMemo<NodeT[]>(() => {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    return safeNodes.map((n) => ({
      ...n,
      metrics: n.metrics ? { ...n.metrics } : n.metrics,
    }));
  }, [nodes]);

  // Theme (center) node id — resolved once over the full node set.
  const themeNodeId = useMemo(() => {
    const ns = allClonedNodes;
    const byType = ns.find((n) => normType(n.type) === "THEME");
    if (byType) return byType.id;
    const byId = ns.find((n) => n.id === themeId);
    if (byId) return byId.id;
    const byName = ns.find((n) => n.name === themeName);
    if (byName) return byName.id;
    return ns[0]?.id;
  }, [allClonedNodes, themeId, themeName]);

  // 🛰 4-layer classification
  //   layer1: Theme 직접 연결 노드 (IMPACTS→theme Macro, HAS_TRAIT→theme Character, BF, EXPOSED_TO Asset)
  //   layer2: THEMED_AS Asset
  //   layer3: (A) asset-asset rel(SUPPLIES/OPERATES/INVESTS/PARTNERS/COMPETES)로 layer2에 연결된 Asset
  //            (B) IMPACTS로 layer2 Asset에 연결된 Macro
  //            (C) HAS_TRAIT로 layer2 Asset에 연결된 Character
  //   layer4: IMPACTS/HAS_TRAIT로 layer3 Asset에 연결된 Macro/Character
  //   neighborMap: layer3/4 노드 → 초기 각도 계산용 이웃 id
  const layerInfo = useMemo(() => {
    const safeEdges = Array.isArray(edges) ? edges : [];
    const tId = themeNodeId;
    const nodeById = new Map<string, NodeT>();
    for (const n of allClonedNodes) nodeById.set(n.id, n);

    const themeRels         = new Map<string, Set<string>>(); // 각 노드 → Theme과의 rel 집합
    const assetAdj          = new Map<string, Set<string>>(); // asset ↔ asset 인접 (ASSET_LINK_RELS)
    const macroImpactsAsset = new Map<string, Set<string>>(); // macroId → asset ids
    const charHasTraitAsset = new Map<string, Set<string>>(); // charId  → asset ids
    const bfAssetAdj        = new Map<string, Set<string>>(); // bfId    → asset ids (OPERATES 등 asset↔BF)
    const assetEtfAdj       = new Map<string, Set<string>>(); // asset ↔ asset (IN_ETF), 양방향
    const assetHasMicroEdge = new Set<string>();              // CHARACTER HAS_TRAIT or MACRO IMPACTS 연결 가진 asset
    const macroBfAdj        = new Map<string, Set<string>>(); // macroId → bf ids (macro ↔ BF, 임의 rel)
    const charBfAdj         = new Map<string, Set<string>>(); // charId  → bf ids

    for (const e of safeEdges) {
      const { s, t } = pickEdgeEndpoints(e);
      if (!s || !t) continue;
      const rel = pickRelType(e).toUpperCase();
      const sT = normType(nodeById.get(s)?.type);
      const tT = normType(nodeById.get(t)?.type);

      if (s === tId || t === tId) {
        const other = s === tId ? t : s;
        if (!themeRels.has(other)) themeRels.set(other, new Set());
        themeRels.get(other)!.add(rel);
      }
      if (ASSET_LINK_RELS.has(rel) && sT === "ASSET" && tT === "ASSET") {
        if (!assetAdj.has(s)) assetAdj.set(s, new Set());
        if (!assetAdj.has(t)) assetAdj.set(t, new Set());
        assetAdj.get(s)!.add(t);
        assetAdj.get(t)!.add(s);
      }
      if (rel === "IMPACTS") {
        let mId: string | null = null;
        let aId: string | null = null;
        if (sT === "MACRO" && tT === "ASSET") { mId = s; aId = t; }
        else if (tT === "MACRO" && sT === "ASSET") { mId = t; aId = s; }
        if (mId && aId) {
          if (!macroImpactsAsset.has(mId)) macroImpactsAsset.set(mId, new Set());
          macroImpactsAsset.get(mId)!.add(aId);
          assetHasMicroEdge.add(aId);
        }
      }
      if (rel === "HAS_TRAIT") {
        let cId: string | null = null;
        let aId: string | null = null;
        if (sT === "CHARACTER" && tT === "ASSET") { cId = s; aId = t; }
        else if (tT === "CHARACTER" && sT === "ASSET") { cId = t; aId = s; }
        if (cId && aId) {
          if (!charHasTraitAsset.has(cId)) charHasTraitAsset.set(cId, new Set());
          charHasTraitAsset.get(cId)!.add(aId);
          assetHasMicroEdge.add(aId);
        }
      }
      // BF ↔ asset (OPERATES 등 모든 BF-asset 관계)
      {
        let bfId: string | null = null;
        let aId: string | null = null;
        if (sT === "FIELD" && tT === "ASSET") { bfId = s; aId = t; }
        else if (tT === "FIELD" && sT === "ASSET") { bfId = t; aId = s; }
        if (bfId && aId) {
          if (!bfAssetAdj.has(bfId)) bfAssetAdj.set(bfId, new Set());
          bfAssetAdj.get(bfId)!.add(aId);
        }
      }
      // BF ↔ macro (어떤 rel이든)
      {
        let bfId: string | null = null;
        let mId: string | null = null;
        if (sT === "FIELD" && tT === "MACRO") { bfId = s; mId = t; }
        else if (tT === "FIELD" && sT === "MACRO") { bfId = t; mId = s; }
        if (bfId && mId) {
          if (!macroBfAdj.has(mId)) macroBfAdj.set(mId, new Set());
          macroBfAdj.get(mId)!.add(bfId);
        }
      }
      // BF ↔ character (어떤 rel이든)
      {
        let bfId: string | null = null;
        let cId: string | null = null;
        if (sT === "FIELD" && tT === "CHARACTER") { bfId = s; cId = t; }
        else if (tT === "FIELD" && sT === "CHARACTER") { bfId = t; cId = s; }
        if (bfId && cId) {
          if (!charBfAdj.has(cId)) charBfAdj.set(cId, new Set());
          charBfAdj.get(cId)!.add(bfId);
        }
      }
      // IN_ETF (asset ↔ asset) — 양방향으로 인접 기록.
      //   convention이 테마마다 다를 수 있어(member→ETF or ETF→member) 양쪽 모두 저장.
      if (rel === "IN_ETF" && sT === "ASSET" && tT === "ASSET") {
        if (!assetEtfAdj.has(s)) assetEtfAdj.set(s, new Set());
        if (!assetEtfAdj.has(t)) assetEtfAdj.set(t, new Set());
        assetEtfAdj.get(s)!.add(t);
        assetEtfAdj.get(t)!.add(s);
      }
    }

    const layer1 = new Set<string>();
    const layer2 = new Set<string>();
    const layer3 = new Set<string>();
    const layer4 = new Set<string>();
    const neighborMap = new Map<string, string>();

    // L1: BF — Theme에 직접 연결된 경우만 (asset에만 연결된 BF는 L3로 내려감)
    for (const n of allClonedNodes) {
      if (n.id === tId) continue;
      if (normType(n.type) !== "FIELD") continue;
      if (themeRels.get(n.id)?.size) layer1.add(n.id);
    }
    // L1/L2: Asset (EXPOSED_TO → L1, THEMED_AS → L2)
    for (const n of allClonedNodes) {
      if (n.id === tId) continue;
      if (normType(n.type) !== "ASSET") continue;
      const rels = themeRels.get(n.id);
      if (rels?.has("EXPOSED_TO")) layer1.add(n.id);
      else if (rels?.has("THEMED_AS")) layer2.add(n.id);
    }
    // L2 augmentation (조건부): IN_ETF로 L2 자산과 연결된 자산을 L2로 승격하는 건
    //   해당 자산에 character/macro가 매달려 있을 때만 (그래야 그것들이 L4 대신 L3로 갈 수 있음).
    //   - T_124: GDX/SGDM/GOEX/GOAU는 HAS_TRAIT chars 보유 → L2로 승격
    //   - T_041: EFAS/IPD/PEJ는 char/macro 없음 → L2 승격 안 함, 아래 L3(A) 폴백에서 L3로 분류
    for (const n of allClonedNodes) {
      if (n.id === tId) continue;
      if (normType(n.type) !== "ASSET") continue;
      if (layer1.has(n.id) || layer2.has(n.id)) continue;
      if (!assetHasMicroEdge.has(n.id)) continue;
      const adj = assetEtfAdj.get(n.id);
      if (!adj) continue;
      for (const other of adj) {
        if (layer2.has(other)) { layer2.add(n.id); break; }
      }
    }
    // L1: Macro/Character directly connected to Theme
    for (const n of allClonedNodes) {
      if (n.id === tId) continue;
      const nt = normType(n.type);
      if (nt === "MACRO" && themeRels.get(n.id)?.has("IMPACTS")) layer1.add(n.id);
      if (nt === "CHARACTER" && themeRels.get(n.id)?.has("HAS_TRAIT")) layer1.add(n.id);
    }

    // L3 (A): Asset connected to L2 Asset.
    //   먼저 ASSET_LINK_RELS (SUPPLIES/OPERATES/INVESTS/PARTNERS/COMPETES) 시도,
    //   없으면 IN_ETF (위 L2 augmentation에서 승격되지 않은 ETF 자산이 여기로 떨어짐).
    for (const n of allClonedNodes) {
      if (n.id === tId) continue;
      if (normType(n.type) !== "ASSET") continue;
      if (layer1.has(n.id) || layer2.has(n.id)) continue;
      let placed = false;
      for (const adjMap of [assetAdj.get(n.id), assetEtfAdj.get(n.id)]) {
        if (placed || !adjMap) continue;
        for (const other of adjMap) {
          if (layer2.has(other)) {
            layer3.add(n.id);
            neighborMap.set(n.id, other);
            placed = true;
            break;
          }
        }
      }
    }
    // L3 (B): Macro IMPACTS → L2 Asset (not already L1)
    for (const [mId, assets] of macroImpactsAsset) {
      if (layer1.has(mId)) continue;
      for (const aid of assets) {
        if (layer2.has(aid)) { layer3.add(mId); neighborMap.set(mId, aid); break; }
      }
    }
    // L3 (C): Character HAS_TRAIT → L2 Asset
    for (const [cId, assets] of charHasTraitAsset) {
      if (layer1.has(cId)) continue;
      for (const aid of assets) {
        if (layer2.has(aid)) { layer3.add(cId); neighborMap.set(cId, aid); break; }
      }
    }
    // L3 (D): BF connected to L2 Asset (e.g., OPERATES) — parent의 각도 방향으로 배치
    for (const [bfId, assets] of bfAssetAdj) {
      if (layer1.has(bfId)) continue;
      for (const aid of assets) {
        if (layer2.has(aid)) { layer3.add(bfId); neighborMap.set(bfId, aid); break; }
      }
    }

    // L4: Macro IMPACTS → L3 Asset
    for (const [mId, assets] of macroImpactsAsset) {
      if (layer1.has(mId) || layer3.has(mId)) continue;
      for (const aid of assets) {
        if (layer3.has(aid)) { layer4.add(mId); neighborMap.set(mId, aid); break; }
      }
    }
    // L4: Character HAS_TRAIT → L3 Asset
    for (const [cId, assets] of charHasTraitAsset) {
      if (layer1.has(cId) || layer3.has(cId)) continue;
      for (const aid of assets) {
        if (layer3.has(aid)) { layer4.add(cId); neighborMap.set(cId, aid); break; }
      }
    }
    // L4: Macro connected to L3 BF (BF가 L3에 있을 때 그에 매달린 macro도 한 궤도 더 바깥)
    for (const [mId, bfs] of macroBfAdj) {
      if (layer1.has(mId) || layer3.has(mId) || layer4.has(mId)) continue;
      for (const bfId of bfs) {
        if (layer3.has(bfId)) { layer4.add(mId); neighborMap.set(mId, bfId); break; }
      }
    }
    // L4: Character connected to L3 BF
    for (const [cId, bfs] of charBfAdj) {
      if (layer1.has(cId) || layer3.has(cId) || layer4.has(cId)) continue;
      for (const bfId of bfs) {
        if (layer3.has(bfId)) { layer4.add(cId); neighborMap.set(cId, bfId); break; }
      }
    }
    // L4: BF connected to L3 Asset
    for (const [bfId, assets] of bfAssetAdj) {
      if (layer1.has(bfId) || layer3.has(bfId)) continue;
      for (const aid of assets) {
        if (layer3.has(aid)) { layer4.add(bfId); neighborMap.set(bfId, aid); break; }
      }
    }

    // Fallback — 어디에도 못 들어간 노드는 렌더 누락 방지 차원에서
    //   Asset: layer3, Macro/Character/기타: layer1
    for (const n of allClonedNodes) {
      if (n.id === tId) continue;
      if (layer1.has(n.id) || layer2.has(n.id) || layer3.has(n.id) || layer4.has(n.id)) continue;
      if (normType(n.type) === "ASSET") layer3.add(n.id);
      else layer1.add(n.id);
    }

    return { layer1, layer2, layer3, layer4, neighborMap };
  }, [allClonedNodes, edges, themeNodeId]);

  // 🧲 Layer2 자산을 "trait signature" 기준으로 정렬 — 같은 BF/MACRO/CHARACTER 를 공유하는
  //    자산들이 sector 안에서 인접 배치되도록. (사용자 요청 2026-06-09)
  //    signature = sorted(연결된 BF + MACRO + CHARACTER ID).join("|")
  //    같은 signature → 같은 그룹으로 인접 배치 → 시각적 clustering.
  const layer2OrderById = useMemo(() => {
    const safeEdges = Array.isArray(edges) ? edges : [];
    const nodeTypeById = new Map<string, string>();
    for (const n of allClonedNodes) nodeTypeById.set(n.id, normType(n.type));

    const traitsByAsset = new Map<string, Set<string>>();
    for (const e of safeEdges) {
      const { s, t } = pickEdgeEndpoints(e);
      if (!s || !t) continue;
      const sT = nodeTypeById.get(s);
      const tT = nodeTypeById.get(t);
      let assetId: string | null = null;
      let traitId: string | null = null;
      if (sT === "ASSET" && (tT === "FIELD" || tT === "MACRO" || tT === "CHARACTER")) {
        assetId = s; traitId = t;
      } else if (tT === "ASSET" && (sT === "FIELD" || sT === "MACRO" || sT === "CHARACTER")) {
        assetId = t; traitId = s;
      }
      if (assetId && traitId && layerInfo.layer2.has(assetId)) {
        if (!traitsByAsset.has(assetId)) traitsByAsset.set(assetId, new Set());
        traitsByAsset.get(assetId)!.add(traitId);
      }
    }

    // signature 별로 그룹화 + 그룹 크기 큰 순으로 정렬 (대중적 trait → 중앙에 큰 sector)
    const l2Ids = allClonedNodes.filter((n) => layerInfo.layer2.has(n.id)).map((n) => n.id);
    const sigByAsset = new Map<string, string>();
    for (const aid of l2Ids) {
      const s = traitsByAsset.get(aid);
      sigByAsset.set(aid, s ? [...s].sort().join("|") : "");
    }
    const sigToAssets = new Map<string, string[]>();
    for (const aid of l2Ids) {
      const sig = sigByAsset.get(aid) || "";
      if (!sigToAssets.has(sig)) sigToAssets.set(sig, []);
      sigToAssets.get(sig)!.push(aid);
    }
    // 그룹 크기 내림차순 (큰 그룹 우선) → 같은 크기면 signature 알파벳순 → 그룹 내 자산 ID 알파벳순
    const sortedGroups = [...sigToAssets.entries()].sort((a, b) => {
      if (a[1].length !== b[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0]);
    });
    const orderMap = new Map<string, number>();
    let idx = 0;
    for (const [, assets] of sortedGroups) {
      assets.sort((a, b) => a.localeCompare(b));
      for (const aid of assets) orderMap.set(aid, idx++);
    }
    return orderMap;
  }, [allClonedNodes, edges, layerInfo]);

  // 같은 레이어 안에서 등장 시 0~INTRA_LAYER_JITTER_MAX_MS 만큼 staggered delay.
  // 순서는 12시 기준 시계방향. 각 layer의 placement 각도(공식 기반)를 시계방향으로 정렬해
  // 첫 노드 = 0ms, 마지막 노드 = MAX 가 되도록 선형 분배.
  const intraDelayMap = useMemo(() => {
    const map = new Map<string, number>();
    const TWO_PI = 2 * Math.PI;
    // 12시(=LAYER1_CENTER_ANGLE) 기준으로 시계방향 [0, 2π)
    const cwFromTwelve = (a: number) => (((a - LAYER1_CENTER_ANGLE) % TWO_PI) + TWO_PI) % TWO_PI;

    const assignByAngle = (ids: string[], angleOf: (id: string, idx: number) => number) => {
      if (!ids.length) return;
      const items = ids.map((id, i) => ({ id, cw: cwFromTwelve(angleOf(id, i)) }));
      items.sort((a, b) => a.cw - b.cw);
      const n = items.length;
      items.forEach((it, idx) => {
        const t = n > 1 ? idx / (n - 1) : 0;
        map.set(it.id, t * INTRA_LAYER_JITTER_MAX_MS);
      });
    };

    // Layer1 (top sector, 12시 중심) — placeOnSector 공식 그대로 각도 계산
    const l1Ids = allClonedNodes
      .filter((n) => n.id !== themeNodeId && layerInfo.layer1.has(n.id))
      .map((n) => n.id);
    const l1Step = l1Ids.length > 1
      ? Math.min(LAYER1_STACK_STEP, (2 * LAYER1_HALF_SPAN) / l1Ids.length)
      : 0;
    assignByAngle(l1Ids, (_id, i) => LAYER1_CENTER_ANGLE + (i - (l1Ids.length - 1) / 2) * l1Step);

    // Layer2 (bottom sector, 6시 중심) — trait signature 정렬 적용 (placeOnSector 와 동일 순서)
    const l2Ids = allClonedNodes
      .filter((n) => layerInfo.layer2.has(n.id))
      .map((n) => n.id)
      .sort((a, b) => {
        const oa = layer2OrderById.get(a) ?? Number.POSITIVE_INFINITY;
        const ob = layer2OrderById.get(b) ?? Number.POSITIVE_INFINITY;
        return oa - ob;
      });
    const l2Step = l2Ids.length > 1
      ? Math.min(LAYER2_STACK_STEP, (2 * LAYER2_HALF_SPAN) / l2Ids.length)
      : 0;
    assignByAngle(l2Ids, (_id, i) => LAYER2_CENTER_ANGLE + (i - (l2Ids.length - 1) / 2) * l2Step);

    // L2 각도 lookup (L3/L4 자식의 각도 추정용 — placeOnSector에서 자식은 부모 각도 기준)
    const l2AngleById = new Map<string, number>();
    l2Ids.forEach((id, i) => {
      l2AngleById.set(id, LAYER2_CENTER_ANGLE + (i - (l2Ids.length - 1) / 2) * l2Step);
    });

    // Layer3: parent(L2) 각도를 그대로 사용
    const l3Ids = allClonedNodes
      .filter((n) => layerInfo.layer3.has(n.id))
      .map((n) => n.id);
    assignByAngle(l3Ids, (id) => {
      const parent = layerInfo.neighborMap.get(id);
      if (!parent) return LAYER2_CENTER_ANGLE;
      const a = l2AngleById.get(parent);
      return typeof a === "number" ? a : LAYER2_CENTER_ANGLE;
    });

    // Layer4: parent(L3 자산) → grandparent(L2)의 각도로 추정
    const l4Ids = allClonedNodes
      .filter((n) => layerInfo.layer4.has(n.id))
      .map((n) => n.id);
    assignByAngle(l4Ids, (id) => {
      const parent = layerInfo.neighborMap.get(id);
      if (!parent) return LAYER2_CENTER_ANGLE;
      const grandparent = layerInfo.neighborMap.get(parent);
      if (!grandparent) return LAYER2_CENTER_ANGLE;
      const a = l2AngleById.get(grandparent);
      return typeof a === "number" ? a : LAYER2_CENTER_ANGLE;
    });

    return map;
  }, [allClonedNodes, layerInfo, themeNodeId, layer2OrderById]);

  // 🎯 Asset 순위 — layer2(THEMED_AS) Asset만 상위 10/나머지 분리.
  //    layer1(ETF) / layer3(연결 Asset)은 항상 전체 표시.
  const assetRankInfo = useMemo(() => {
    const l2Assets = allClonedNodes.filter((n) => layerInfo.layer2.has(n.id));
    const sorted = [...l2Assets].sort((a, b) => {
      const ar = getReturnByPeriod(a as NodeT, "7D");
      const br = getReturnByPeriod(b as NodeT, "7D");
      const av = typeof ar === "number" && Number.isFinite(ar) ? ar : -Infinity;
      const bv = typeof br === "number" && Number.isFinite(br) ? br : -Infinity;
      return bv - av;
    });
    const topAssetIds = new Set<string>();
    const extraAssetOrderMap = new Map<string, number>();
    sorted.forEach((n, i) => {
      if (i < DEFAULT_ASSET_LIMIT) topAssetIds.add(n.id);
      else extraAssetOrderMap.set(n.id, i - DEFAULT_ASSET_LIMIT);
    });
    return {
      topAssetIds,
      extraAssetOrderMap,
      totalAssets: l2Assets.length,
      hiddenAssetCount: Math.max(0, l2Assets.length - DEFAULT_ASSET_LIMIT),
    };
  }, [allClonedNodes, layerInfo]);

  const graphData = useMemo(() => {
    const safeEdges = Array.isArray(edges) ? edges : [];
    const { topAssetIds } = assetRankInfo;

    // 2궤도 Asset 중 상위 10 밖만 숨김. 1/3궤도는 항상 표시.
    const clonedNodes: NodeT[] = expanded
      ? allClonedNodes
      : allClonedNodes.filter((n) => {
          if (!layerInfo.layer2.has(n.id)) return true;
          return topAssetIds.has(n.id);
        });
    const visibleIds = new Set(clonedNodes.map((n) => n.id));

    const links = safeEdges
      .map((e) => {
        const { s, t } = pickEdgeEndpoints(e);
        if (!s || !t) return null;
        if (!visibleIds.has(s) || !visibleIds.has(t)) return null;
        const rel = pickRelType(e);
        return {
          source: s,
          target: t,
          type: rel,
          label: rel,
          // ✅ 출처(provenance) 필드 보존 — 엣지 클릭 시 디테일 패널에서 사용
          evidence: (e as any).evidence,
          confidence: (e as any).confidence,
          status: (e as any).status,
        };
      })
      .filter(Boolean) as any[];

    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.log(
        "[ForceGraphWrapper] nodes:",
        clonedNodes.length,
        "edges(raw):",
        safeEdges.length,
        "links(mapped):",
        links.length,
        "L1/L2/L3/L4:",
        layerInfo.layer1.size,
        layerInfo.layer2.size,
        layerInfo.layer3.size,
        layerInfo.layer4.size,
      );
    }

    return { nodes: clonedNodes, links };
  }, [allClonedNodes, edges, expanded, assetRankInfo, layerInfo]);

  useEffect(() => {
    const ns = graphData.nodes;
    if (!ns.length) return;

    const cx = size.w * 0.5;
    const cy = size.h * GRAPH_CONFIG.center.yRatio;

    const theme = ns.find((n) => n.id === themeNodeId) ?? ns[0];
    if (!theme) return;

    theme.x = cx;
    theme.y = cy;
    theme.vx = 0;
    theme.vy = 0;
    // Theme은 항상 중앙 고정 (궤도 원점)
    theme.fx = cx;
    theme.fy = cy;

    // 기존 위치가 있으면 유지 (expand 시 점프 방지).
    // sector center에서 좌우로 대칭 stack (1개면 정중앙, 짝수면 중앙 살짝 옆에 가까이 배치).
    const placeOnSector = (
      ids: Set<string>,
      radius: number,
      centerAngle: number,
      halfSpan: number,
      naturalStep: number,
      customOrder?: Map<string, number>,
    ) => {
      const arr = ns.filter((n) => n.id !== theme.id && ids.has(n.id));
      if (customOrder) {
        arr.sort((a, b) => {
          const oa = customOrder.get(a.id) ?? Number.POSITIVE_INFINITY;
          const ob = customOrder.get(b.id) ?? Number.POSITIVE_INFINITY;
          return oa - ob;
        });
      }
      const count = arr.length;
      if (count === 0) return;
      const span = 2 * halfSpan;
      // 노드가 많아져 sector를 넘치면 step을 자동 축소
      const step = count > 1 ? Math.min(naturalStep, span / count) : 0;
      arr.forEach((node, i) => {
        if (typeof node.x === "number" && typeof node.y === "number") return;
        const a = centerAngle + (i - (count - 1) / 2) * step;
        node.x = cx + Math.cos(a) * radius;
        node.y = cy + Math.sin(a) * radius;
        node.vx = 0;
        node.vy = 0;
        node.fx = null;
        node.fy = null;
      });
    };

    // 1궤도: 12시 중심, 11~1시 부채꼴 안에서 좌우로 펼침
    placeOnSector(
      layerInfo.layer1,
      GRAPH_CONFIG.orbitRadius.l1,
      LAYER1_CENTER_ANGLE,
      LAYER1_HALF_SPAN,
      LAYER1_STACK_STEP,
    );

    // 2궤도: 6시 중심, 1시01분~10시59분 안에서 좌우로 펼침
    //   ✅ 같은 trait signature (공유 BF/MACRO/CHARACTER) 자산이 인접 배치
    placeOnSector(
      layerInfo.layer2,
      GRAPH_CONFIG.orbitRadius.l2,
      LAYER2_CENTER_ANGLE,
      LAYER2_HALF_SPAN,
      LAYER2_STACK_STEP,
      layer2OrderById,
    );

    const angleOf = (id: string): number | null => {
      const nb = ns.find((m) => m.id === id);
      if (!nb || typeof nb.x !== "number" || typeof nb.y !== "number") return null;
      return Math.atan2((nb.y as number) - cy, (nb.x as number) - cx);
    };

    // 3궤도 Asset: 같은 부모(L2 asset)에 매달린 자식들을 한 그룹으로 묶어
    // ±LAYER3_ASSET_JITTER 폭 안에서 균등 stack (이전 random jitter는 우연한 중첩 발생).
    //   - 자산은 큰 노드라 라벨까지 고려해 stack step을 동적 계산
    const l3Assets = ns.filter(
      (n) => n.id !== theme.id && layerInfo.layer3.has(n.id) && normType(n.type) === "ASSET",
    );
    const l3AssetGroupByNb = new Map<string, NodeT[]>();
    for (const node of l3Assets) {
      const nbId = layerInfo.neighborMap.get(node.id) ?? "__orphan__";
      if (!l3AssetGroupByNb.has(nbId)) l3AssetGroupByNb.set(nbId, []);
      l3AssetGroupByNb.get(nbId)!.push(node);
    }
    // 라벨 포함 인접 자산 간 최소 호(arc) 간격 (px). 19px 노드 + 라벨 80~120px 고려.
    const L3_ASSET_MIN_ARC_PX = 135;
    // 부모 ±JITTER 한계와 radius 확장 한계.
    //   ±90° = 부모 각도 기준 반원(180° span). 자식 다수일 때 거의 bottom 반원 전체 사용.
    const L3_ASSET_MAX_JITTER = Math.PI / 2;        // ±90° (총 180°)
    const L3_ASSET_MAX_RADIUS = 720;                // 화면 밖으로 너무 벗어나지 않도록 cap

    for (const [nbId, group] of l3AssetGroupByNb) {
      const baseAngle =
        nbId !== "__orphan__" ? (angleOf(nbId) ?? Math.random() * Math.PI * 2) : Math.random() * Math.PI * 2;
      const count = group.length;

      // 1) 자연 step (기본 jitter, 기본 radius) 계산.
      let jitter = LAYER3_ASSET_JITTER;
      let radius: number = GRAPH_CONFIG.orbitRadius.l3;
      let step   = count > 1 ? (2 * jitter) / count : 0;
      let arc    = step * radius;

      // 2) 자식 수가 많아 라벨이 겹치면, 우선 jitter를 확장 (최대 ±60°).
      if (count > 1 && arc < L3_ASSET_MIN_ARC_PX) {
        const wantJitter = (L3_ASSET_MIN_ARC_PX * count) / (2 * radius);
        jitter = Math.min(L3_ASSET_MAX_JITTER, wantJitter);
        step   = (2 * jitter) / count;
        arc    = step * radius;
      }

      // 3) 그래도 부족하면 radius를 바깥으로 밀기 (최대 720px).
      if (count > 1 && arc < L3_ASSET_MIN_ARC_PX) {
        const wantRadius = (L3_ASSET_MIN_ARC_PX * count) / (2 * jitter);
        radius = Math.min(L3_ASSET_MAX_RADIUS, wantRadius);
        step   = (2 * jitter) / count;
      }

      group.forEach((node, i) => {
        // 동적 radius를 노드에 박아둠 → forceRadial이 default l3=400 대신 이 값 사용.
        (node as any).__layoutRadius = radius;
        if (typeof node.x === "number" && typeof node.y === "number") return;
        const offset = (i - (count - 1) / 2) * step;
        const a = baseAngle + offset;
        node.x = cx + Math.cos(a) * radius;
        node.y = cy + Math.sin(a) * radius;
        node.vx = 0; node.vy = 0; node.fx = null; node.fy = null;
      });
    }

    // 3궤도 Macro/Character/BF: 이웃 각도 그대로, 같은 이웃 공유 시 ±15° stack
    const l3NonAssets = ns.filter((n) => {
      if (n.id === theme.id) return false;
      if (!layerInfo.layer3.has(n.id)) return false;
      const t = normType(n.type);
      return t === "MACRO" || t === "CHARACTER" || t === "FIELD";
    });
    const l3GroupByNb = new Map<string, NodeT[]>();
    for (const node of l3NonAssets) {
      const nbId = layerInfo.neighborMap.get(node.id) ?? "__orphan__";
      if (!l3GroupByNb.has(nbId)) l3GroupByNb.set(nbId, []);
      l3GroupByNb.get(nbId)!.push(node);
    }
    for (const [nbId, group] of l3GroupByNb) {
      const baseAngle =
        nbId !== "__orphan__" ? (angleOf(nbId) ?? Math.random() * Math.PI * 2) : Math.random() * Math.PI * 2;
      const count = group.length;
      group.forEach((node, i) => {
        if (typeof node.x === "number" && typeof node.y === "number") return;
        const offset = (i - (count - 1) / 2) * L3_L4_STACK_STEP;
        const a = baseAngle + offset;
        node.x = cx + Math.cos(a) * GRAPH_CONFIG.orbitRadius.l3;
        node.y = cy + Math.sin(a) * GRAPH_CONFIG.orbitRadius.l3;
        node.vx = 0; node.vy = 0; node.fx = null; node.fy = null;
      });
    }

    // 4궤도 Macro/Character: layer3 이웃 각도 그대로 + 같은 이웃 공유 시 ±15° stack
    const l4Arr = ns.filter((n) => n.id !== theme.id && layerInfo.layer4.has(n.id));
    const l4GroupByNb = new Map<string, NodeT[]>();
    for (const node of l4Arr) {
      const nbId = layerInfo.neighborMap.get(node.id) ?? "__orphan__";
      if (!l4GroupByNb.has(nbId)) l4GroupByNb.set(nbId, []);
      l4GroupByNb.get(nbId)!.push(node);
    }
    for (const [nbId, group] of l4GroupByNb) {
      const baseAngle =
        nbId !== "__orphan__" ? (angleOf(nbId) ?? Math.random() * Math.PI * 2) : Math.random() * Math.PI * 2;
      const count = group.length;
      group.forEach((node, i) => {
        if (typeof node.x === "number" && typeof node.y === "number") return;
        const offset = count > 1 ? (i - (count - 1) / 2) * L3_L4_STACK_STEP : 0;
        const a = baseAngle + offset;
        node.x = cx + Math.cos(a) * GRAPH_CONFIG.orbitRadius.l4;
        node.y = cy + Math.sin(a) * GRAPH_CONFIG.orbitRadius.l4;
        node.vx = 0; node.vy = 0; node.fx = null; node.fy = null;
      });
    }

    // 🎯 동적 L1 반경 조정 — L2 자산이 많은 L3 자식 (IN_ETF 등) 또는 L3 radius 자체 push 가
    //    크면 L1 도 비례 외부로 push 해 상하 균형 회복 (예: T_003 SoftBank 처럼 L2 1 개에
    //    L3 7 개 매달리는 케이스).
    {
      let maxL3GroupSize = 0;
      for (const [, group] of l3AssetGroupByNb) {
        if (group.length > maxL3GroupSize) maxL3GroupSize = group.length;
      }
      let maxL3Radius = GRAPH_CONFIG.orbitRadius.l3; // default 400
      for (const n of l3Assets) {
        const r = (n as any).__layoutRadius;
        if (typeof r === "number" && r > maxL3Radius) maxL3Radius = r;
      }

      // signal A: L3 group size — 3 children=0.17, 9+=1.0
      const sizeFactor = maxL3GroupSize >= 3
        ? Math.min(1, (maxL3GroupSize - 2) / 6)
        : 0;
      // signal B: L3 radius push — l3 default 400 → max L3_ASSET_MAX_RADIUS 720
      const radiusFactor = maxL3Radius > GRAPH_CONFIG.orbitRadius.l3
        ? Math.min(1, (maxL3Radius - GRAPH_CONFIG.orbitRadius.l3) /
            (L3_ASSET_MAX_RADIUS - GRAPH_CONFIG.orbitRadius.l3))
        : 0;
      const factor = Math.max(sizeFactor, radiusFactor);

      if (factor > 0) {
        // L1 radius 를 l1(200) → l2(300) 사이 full range scale (최대 newL1 = 300)
        const baseL1 = GRAPH_CONFIG.orbitRadius.l1;
        const newL1 = baseL1 + (GRAPH_CONFIG.orbitRadius.l2 - baseL1) * factor;
        for (const n of ns) {
          if (n.id === theme.id) continue;
          if (!layerInfo.layer1.has(n.id)) continue;
          const cur = (n as any).__layoutRadius ?? baseL1;
          const scale = newL1 / cur;
          if (typeof n.x === "number" && typeof n.y === "number") {
            n.x = cx + (n.x - cx) * scale;
            n.y = cy + (n.y - cy) * scale;
          }
          (n as any).__layoutRadius = newL1;
        }
      }
    }

    if (fgRef.current) {
      fgRef.current.d3ReheatSimulation();
      setTimeout(() => {
        try {
          // 카메라 중심을 theme(cy)보다 살짝 아래로 — theme이 화면 상단 ~38% 지점에
          // 자리잡도록. L1(상단, r=200) · L4(하단, r=500) 반경 비대칭 때문에 정중앙
          // 정렬 시 윗공간이 비어 보였음. zoom 보정 포함.
          const camOffsetY = (size.h * 0.12) / GRAPH_CONFIG.zoom.initial;
          fgRef.current.centerAt(cx, cy + camOffsetY, 0);
          fgRef.current.zoom(GRAPH_CONFIG.zoom.initial, 0);
        } catch {}
      }, 120);
    }
  }, [graphData.nodes, size.w, size.h, themeNodeId, lockTheme, layerInfo, layer2OrderById]);

  // ✅ focus: center & zoom to searched node
  useEffect(() => {
    if (!effectiveFocusId) return;
    if (!fgRef.current) return;

    const n = (graphData.nodes as any[]).find((x) => x?.id === effectiveFocusId);
    if (!n || typeof n.x !== "number" || typeof n.y !== "number") return;

    try {
      fgRef.current.centerAt(n.x, n.y, 450);

      // mild zoom-in so highlight is obvious
      const currentZ = typeof fgRef.current.zoom === "function" ? fgRef.current.zoom() : 2.2;
      const z = Math.min(4, Math.max(2.2, currentZ ?? 2.2));
      fgRef.current.zoom(z, 450);

      // optional: also notify selection
      onSelectNode?.(n as NodeT);
    } catch {}
  }, [effectiveFocusId, graphData.nodes, onSelectNode]);

  useEffect(() => {
    if (!fgRef.current) return;
    const fg = fgRef.current;

    const cx = size.w * 0.5;
    const cy = size.h * GRAPH_CONFIG.center.yRatio;

    const radiusFor = (n: any): number => {
      const id = n?.id as string | undefined;
      if (!id || id === themeNodeId) return 0;
      // 노드에 동적 layout radius가 박혀 있으면 그걸 우선 (L3 자산 동적 확장용).
      const dyn = (n as any)?.__layoutRadius;
      if (typeof dyn === "number" && dyn > 0) return dyn;
      if (layerInfo.layer1.has(id)) return GRAPH_CONFIG.orbitRadius.l1;
      if (layerInfo.layer2.has(id)) return GRAPH_CONFIG.orbitRadius.l2;
      if (layerInfo.layer3.has(id)) return GRAPH_CONFIG.orbitRadius.l3;
      if (layerInfo.layer4.has(id)) return GRAPH_CONFIG.orbitRadius.l4;
      return GRAPH_CONFIG.orbitRadius.l3;
    };
    const radialStrength = (n: any): number => {
      const id = n?.id as string | undefined;
      if (!id || id === themeNodeId) return 0;
      if (layerInfo.layer1.has(id)) return 1.0;
      if (layerInfo.layer2.has(id)) return 1.0;
      if (layerInfo.layer3.has(id)) return 1.0;
      if (layerInfo.layer4.has(id)) return 0.9;
      return 0.9;
    };

    // 🎯 Radial: 레이어별 반경으로 끌어당김 (L1 1.0 · L2 0.9 · L3 0.8 · L4 0.7)
    fg.d3Force(
      "radial",
      forceRadial((n: any) => radiusFor(n), cx, cy).strength((n: any) => radialStrength(n)),
    );

    // 🧭 forceY: L1은 위(궤도 반경만큼), L2는 아래로 부드럽게.
    //    ✅ dynamic L1 반경 (__layoutRadius) 가 박혀 있으면 그 값 사용 — 그렇지 않으면
    //       L1 노드가 항상 같은 y 위치로 끌려가 dynamic radius 가 무효화됨.
    fg.d3Force(
      "ySector",
      forceY((n: any) => {
        const id = n?.id as string | undefined;
        if (id && layerInfo.layer1.has(id)) {
          const r = (n as any).__layoutRadius ?? GRAPH_CONFIG.orbitRadius.l1;
          return cy - r * 0.6;
        }
        if (id && layerInfo.layer2.has(id)) return cy + GRAPH_CONFIG.orbitRadius.l2 * 0.2;
        return cy;
      }).strength((n: any) => {
        const id = n?.id as string | undefined;
        if (id && layerInfo.layer1.has(id)) return 0.4;
        if (id && layerInfo.layer2.has(id)) return 0.1;
        return 0;
      }),
    );

    // 🔗 Link distance —
    //   BF endpoint  → 기본 거리 × 1.2  (시각적 분리감)
    //   MACRO endpoint → 기본 거리 × 1.32 (= BF × 1.1, 가장 멀리)
    const BF_DISTANCE_BOOST    = 1.2;
    const MACRO_DISTANCE_BOOST = 1.2 * 1.1; // = 1.32, "bf 관계선보다 1.1배"
    const nodeTypeById = new Map<string, string>();
    for (const n of graphData.nodes as any[]) {
      if (n?.id) nodeTypeById.set(n.id, normType(n.type));
    }
    const endpointType = (endpoint: any): string | undefined => {
      if (!endpoint) return undefined;
      if (typeof endpoint === "object") return normType(endpoint.type);
      return nodeTypeById.get(endpoint);
    };
    fg.d3Force("link")?.distance((l: any) => {
      const sid = typeof l.source === "object" ? l.source?.id : l.source;
      const tid = typeof l.target === "object" ? l.target?.id : l.target;
      const isTheme = (id: string) => id === themeNodeId;
      let dist: number = GRAPH_CONFIG.force.linkDistance.themeL1; // default
      if (isTheme(sid) || isTheme(tid)) {
        const other = isTheme(sid) ? tid : sid;
        if (layerInfo.layer1.has(other)) dist = GRAPH_CONFIG.force.linkDistance.themeL1;
        else if (layerInfo.layer2.has(other)) dist = GRAPH_CONFIG.force.linkDistance.themeL2;
      } else if (
        (layerInfo.layer3.has(sid) && layerInfo.layer2.has(tid)) ||
        (layerInfo.layer3.has(tid) && layerInfo.layer2.has(sid))
      ) {
        dist = GRAPH_CONFIG.force.linkDistance.l2l3;
      } else if (
        (layerInfo.layer4.has(sid) && layerInfo.layer3.has(tid)) ||
        (layerInfo.layer4.has(tid) && layerInfo.layer3.has(sid))
      ) {
        dist = GRAPH_CONFIG.force.linkDistance.l3l4;
      }
      const sType = endpointType(l.source);
      const tType = endpointType(l.target);
      // ✅ 2026-05-22 재조정: L2 가 많아 멀리 밀려날 때 L1 macro 가 너무 가까이 붙어 보임 →
      //    theme↔macro 도 일반 macro boost (1.32) 그대로 적용. L1 distance ≈ 264 으로 L2 base 300 과 비율 맞춤.
      //    이전 (2026-05-21) × 2/3 단축은 L2 sparse 케이스에 한정해 적합 → 일관성 위해 revert.
      if (sType === "MACRO" || tType === "MACRO") dist *= MACRO_DISTANCE_BOOST;
      else if (sType === "FIELD" || tType === "FIELD") dist *= BF_DISTANCE_BOOST;
      return dist;
    });
    // 링크 장력 — Theme↔L1, Theme↔L2 (스켈레톤)만 강하게, 그 외 부속 링크는 약하게.
    //   - L2↔L2 (IN_ETF 등): 0.04  → 한 ETF에 묶인 종목들이 한쪽으로 몰리는 것 방지
    //   - L2↔L3 (asset↔BF/Macro/Char): 0.05  → 여러 asset이 같은 BF를 공유할 때 asset들이 묶여서 같이 끌려오는 클러스터링 방지
    //   - L3↔L4: 0.05  → 같은 이유
    //   - 기타: LINK_STRENGTH
    fg.d3Force("link")?.strength?.((l: any) => {
      const sid = typeof l.source === "object" ? l.source?.id : l.source;
      const tid = typeof l.target === "object" ? l.target?.id : l.target;
      if (!sid || !tid) return LINK_STRENGTH;
      const sL1 = layerInfo.layer1.has(sid), tL1 = layerInfo.layer1.has(tid);
      const sL2 = layerInfo.layer2.has(sid), tL2 = layerInfo.layer2.has(tid);
      const sL3 = layerInfo.layer3.has(sid), tL3 = layerInfo.layer3.has(tid);
      const sL4 = layerInfo.layer4.has(sid), tL4 = layerInfo.layer4.has(tid);
      if (sL2 && tL2) return 0.04;
      if ((sL2 && tL3) || (sL3 && tL2)) return 0.05;
      if ((sL3 && tL4) || (sL4 && tL3)) return 0.05;
      // L1 끼리 / L1↔L3 등 드문 케이스도 안전하게 약하게
      if ((sL1 && tL3) || (sL3 && tL1)) return 0.05;
      return LINK_STRENGTH;
    });

    // 🧲 Charge
    fg.d3Force("charge")?.strength(GRAPH_CONFIG.force.charge);
    fg.d3Force("charge")?.distanceMax?.(220);

    // 🧱 Collide: 노드별 시각 반경 + 타입별 패딩.
    //   - asset: 큰 패딩 (라벨 + 동그라미)
    //   - small in L3/L4: 큰 패딩 (외궤도라 sector 넓음, 라벨 겹침 방지)
    //   - small in L1: 작은 패딩 (11~1시 좁은 sector)
    fg.d3Force("collide")?.radius((n: any) => {
      const isTheme = n?.id === themeNodeId;
      const baseR = nodeRadius(n as NodeT, isTheme);
      const pads = GRAPH_CONFIG.force.collidePad;
      if (isTheme) return baseR + pads.theme;
      if (normType((n as NodeT).type) === "ASSET") return baseR + pads.asset;
      const id = n?.id as string | undefined;
      if (id && (layerInfo.layer3.has(id) || layerInfo.layer4.has(id))) {
        return baseR + pads.smallOuter;
      }
      return baseR + pads.smallL1;
    });

    // ⛔ Center force 제거 — radial이 정렬 담당
    fg.d3Force("center", null as any);

    // 🧭 커스텀 towardParent: L3/L4 노드를 각각 연결된 L2/L3 parent 각도 쪽으로 당김
    const towardParent = function (alpha: number) {
      const linkForce = fg.d3Force("link") as any;
      const ls: any[] | undefined = typeof linkForce?.links === "function" ? linkForce.links() : undefined;
      if (!ls || ls.length === 0) return;
      for (const l of ls) {
        const src = typeof l.source === "object" ? l.source : null;
        const tgt = typeof l.target === "object" ? l.target : null;
        if (!src || !tgt) continue;
        const sid: string | undefined = src?.id;
        const tid: string | undefined = tgt?.id;
        if (!sid || !tid) continue;

        // parent / child 판별: L2→L3 또는 L3→L4 방향만 의미 있음
        let parent: any = null;
        let child: any = null;
        if (layerInfo.layer2.has(sid) && layerInfo.layer3.has(tid)) { parent = src; child = tgt; }
        else if (layerInfo.layer2.has(tid) && layerInfo.layer3.has(sid)) { parent = tgt; child = src; }
        else if (layerInfo.layer3.has(sid) && layerInfo.layer4.has(tid)) { parent = src; child = tgt; }
        else if (layerInfo.layer3.has(tid) && layerInfo.layer4.has(sid)) { parent = tgt; child = src; }
        else continue;

        if (typeof parent.x !== "number" || typeof parent.y !== "number") continue;
        if (typeof child.x  !== "number" || typeof child.y  !== "number") continue;

        const pxRel = parent.x - cx;
        const pyRel = parent.y - cy;
        if (pxRel === 0 && pyRel === 0) continue;
        const parentAngle = Math.atan2(pyRel, pxRel);

        const cxRel = child.x - cx;
        const cyRel = child.y - cy;
        const targetR = Math.sqrt(cxRel * cxRel + cyRel * cyRel);

        const desiredX = cx + Math.cos(parentAngle) * targetR;
        const desiredY = cy + Math.sin(parentAngle) * targetR;

        child.vx = (child.vx ?? 0) + (desiredX - child.x) * alpha * TOWARD_PARENT_STRENGTH;
        child.vy = (child.vy ?? 0) + (desiredY - child.y) * alpha * TOWARD_PARENT_STRENGTH;
      }
    };
    (towardParent as any).initialize = () => {}; // d3-force 규약: nodes 주입 불필요
    fg.d3Force("towardParent", towardParent as any);

    // 🧭 sectorCenterPull: L1은 12시, L2는 6시 방향으로 접선 방향 당김
    //    → collide/charge에 의한 좌우 드리프트를 상쇄해 가운데가 비지 않게 유지.
    let sectorNodes: any[] = [];
    const sectorCenterPull = function (alpha: number) {
      for (const node of sectorNodes) {
        if (!node || node.id === themeNodeId) continue;
        if (typeof node.x !== "number" || typeof node.y !== "number") continue;
        const dx = node.x - cx;
        const dy = node.y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 1) continue;

        let centerAngle: number | null = null;
        let strength = 0;
        if (layerInfo.layer1.has(node.id)) {
          centerAngle = LAYER1_CENTER_ANGLE;
          strength = 0.08; // 약하게 — collide가 노드를 충분히 벌릴 수 있게
        } else if (layerInfo.layer2.has(node.id)) {
          centerAngle = LAYER2_CENTER_ANGLE;
          strength = 0.04; // 매우 약하게 — collide 우선
        }
        if (centerAngle === null) continue;

        const targetX = cx + Math.cos(centerAngle) * r;
        const targetY = cy + Math.sin(centerAngle) * r;
        node.vx = (node.vx ?? 0) + (targetX - node.x) * alpha * strength;
        node.vy = (node.vy ?? 0) + (targetY - node.y) * alpha * strength;
      }
    };
    const initSectorNodes = (nodes: any[]) => {
      sectorNodes = nodes ?? [];
    };
    (sectorCenterPull as any).initialize = initSectorNodes;
    fg.d3Force("sectorCenterPull", sectorCenterPull as any);

    // 🚧 sectorClamp: 허용 sector 밖으로 나간 노드를 sector 내부로 강하게 밀어넣음.
    //    L1은 [11시, 1시] 안쪽만 허용, L2는 [11시, 1시] 안쪽이 금지(나머지 270°만 허용).
    const sectorClamp = function (alpha: number) {
      for (const node of sectorNodes) {
        if (!node || node.id === themeNodeId) continue;
        if (typeof node.x !== "number" || typeof node.y !== "number") continue;
        const dx = node.x - cx;
        const dy = node.y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 1) continue;
        const angle = Math.atan2(dy, dx); // -π ~ π

        if (layerInfo.layer1.has(node.id)) {
          // 허용: [LAYER1_ANGLE_START, LAYER1_ANGLE_END]
          if (angle < LAYER1_ANGLE_START || angle > LAYER1_ANGLE_END) {
            const targetX = cx + Math.cos(LAYER1_CENTER_ANGLE) * r;
            const targetY = cy + Math.sin(LAYER1_CENTER_ANGLE) * r;
            node.vx = (node.vx ?? 0) + (targetX - node.x) * alpha * 1.0;
            node.vy = (node.vy ?? 0) + (targetY - node.y) * alpha * 1.0;
          }
        } else if (layerInfo.layer2.has(node.id)) {
          // 금지: (LAYER1_ANGLE_START, LAYER1_ANGLE_END) — top sector 안쪽이면 6시로 밀기
          if (angle > LAYER1_ANGLE_START && angle < LAYER1_ANGLE_END) {
            const targetX = cx + Math.cos(LAYER2_CENTER_ANGLE) * r;
            const targetY = cy + Math.sin(LAYER2_CENTER_ANGLE) * r;
            node.vx = (node.vx ?? 0) + (targetX - node.x) * alpha * 1.0;
            node.vy = (node.vy ?? 0) + (targetY - node.y) * alpha * 1.0;
          }
        }
      }
    };
    (sectorClamp as any).initialize = initSectorNodes; // sectorNodes 공유
    fg.d3Force("sectorClamp", sectorClamp as any);

    fg.d3ReheatSimulation();
  }, [graphData.nodes, themeNodeId, size.w, size.h, layerInfo]);

  const drawNode = (node: any, ctx: CanvasRenderingContext2D) => {
    // 🎬 entrance animation gate
    const anim = getNodeAnimState(node);
    if (!anim.visible) return;

    const isTheme = node.id === themeNodeId;
    const isFocus = !!effectiveFocusId && node.id === effectiveFocusId;
    const baseR = nodeRadius(node, isTheme);
    const r = isFocus ? baseR + 6 : baseR;

    const label = resolveLabel(node, themeName) || node.id;

    const t = normType(node.type);
    let fill = nodeBaseColor(node, isTheme);

    if (t === "ASSET" && assetColorMode === "return") {
      const rr = getReturnByPeriod(node, period);
      fill = colorFromReturn(rr);
    }

    ctx.save();
    ctx.globalAlpha = anim.opacity;
    if (anim.scale !== 1) {
      ctx.translate(node.x, node.y);
      ctx.scale(anim.scale, anim.scale);
      ctx.translate(-node.x, -node.y);
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
    ctx.fillStyle = fill;
    ctx.fill();

    if (isFocus) {
      // highlight ring
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI, false);
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 노드 원 안은 비움(색상만). 원 바깥 아래에 이름 한 줄만 (truncate 없이 전체).
    // ASSET / THEME 은 15px, BF / Macro / Character 등 작은 노드는 70%(11px).
    const FONT_FAMILY = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    const fontPx = (isTheme || t === "ASSET") ? 15 : 11;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = isFocus ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.92)";
    ctx.font = `${fontPx}px ${FONT_FAMILY}`;
    ctx.fillText(label, node.x, node.y + r + 6);

    ctx.restore();
  };

  const periods: { key: PeriodKey; label: string }[] = [
    { key: "3D", label: "3일" },
    { key: "7D", label: "7일" },
    { key: "1M", label: "1개월" },
    { key: "YTD", label: "YTD" },
    { key: "1Y", label: "1년" },
    { key: "3Y", label: "3년" },
  ];

  const fmtReturn = (v?: number) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
  };

  // ✅ Bloomberg hover helpers
  const fmtNum = (v?: number) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    return v.toLocaleString();
  };

  const fmtDate = (s?: string) => {
    if (!s) return "—";
    return String(s).slice(0, 10);
  };

  const ellipsis = (s?: string, max = 18) => {
    if (!s) return "—";
    const x = String(s);
    return x.length > max ? x.slice(0, max - 1) + "…" : x;
  };

  const getClose = (n: NodeT): number | undefined => {
    const m = n.metrics ?? {};
    return (
      pickNum(m.last_price) ??
      pickNum(m.close) ??
      pickNum((m as any).price) ??
      pickNum((m as any).lastPrice) ??
      pickNum(m["Close"]) ??
      pickNum(m["close"])
    );
  };

  const getValDate = (n: NodeT): string | undefined => {
    const m = n.metrics ?? {};
    const s =
      (typeof m.valuationAsOf === "string" && m.valuationAsOf) ||
      (typeof (m as any).asof === "string" && (m as any).asof) ||
      (typeof (m as any).val_date === "string" && (m as any).val_date) ||
      (typeof (m as any).valuation_date === "string" && (m as any).valuation_date) ||
      (typeof (m as any).valuationDate === "string" && (m as any).valuationDate) ||
      undefined;
    return s;
  };

  const getTicker = (n: NodeT): string | undefined => {
    const m: any = n.metrics ?? {};
    const e: any = (n as any).exposure ?? {};
    return (
      (typeof e.ticker === "string" && e.ticker) ||
      (typeof m.ticker === "string" && m.ticker) ||
      (typeof n.ticker === "string" && n.ticker) ||
      undefined
    );
  };

  const getExchange = (n: NodeT): string | undefined => {
    const m: any = n.metrics ?? {};
    const e: any = (n as any).exposure ?? {};
    return (
      (typeof e.exchange === "string" && e.exchange) ||
      (typeof m.exchange === "string" && m.exchange) ||
      (typeof n.exchange === "string" && n.exchange) ||
      undefined
    );
  };

  const getCountry = (n: NodeT): string | undefined => {
    const m: any = n.metrics ?? {};
    const e: any = (n as any).exposure ?? {};
    return (
      (typeof e.country === "string" && e.country) ||
      (typeof m.country === "string" && m.country) ||
      (typeof n.country === "string" && n.country) ||
      undefined
    );
  };

  const handleSelect = (n: NodeT | null) => onSelectNode?.(n);

  // 호버 박스 일괄 그래프 영역 **우측 상단 고정** (2026-05-19 사용자 결정).
  // 좌측은 영구 테마 설명 패널 영역 — 충돌 방지. kind 매개변수는 stash 호환성용, 무시.
  const tooltipStyle = (_kind: "theme" | "other", W = 290): React.CSSProperties => {
    return { right: 12, top: 12, width: W };
  };

  const hoverType = hoverNode ? normType(hoverNode.type) : "";
  const isAssetHover = hoverType === "ASSET";
  const isThemeHover = hoverType === "THEME";
  const isFieldHover = hoverType === "FIELD";
  const isMacroHover = hoverType === "MACRO" || (hoverNode?.id ?? "").startsWith("M_");
  const isCharacterHover = hoverType === "CHARACTER" || (hoverNode?.id ?? "").startsWith("C_");
  const hoverLabel = hoverNode ? resolveLabel(hoverNode, themeName) : "";

  // ✅ 0~1000 scale, 10-tier (matches themeReturn.ts tempByScore)
  const tempByScore = (s: number) => {
    const v = Math.max(0, Math.min(1000, s));
    if (v >= 900) return { name: "BLAZING", color: "#7a0119" };
    if (v >= 800) return { name: "HOT", color: "#b11226" };
    if (v >= 700) return { name: "WARM+", color: "#d72638" };
    if (v >= 600) return { name: "WARM", color: "#ef476f" };
    if (v >= 500) return { name: "NEUTRAL+", color: "#ff9e5e" };
    if (v >= 400) return { name: "NEUTRAL", color: "#6b7280" };
    if (v >= 300) return { name: "COOL", color: "#4d96ff" };
    if (v >= 200) return { name: "COOL-", color: "#3a68c9" };
    if (v >= 100) return { name: "COLD", color: "#1f3c88" };
    return { name: "FROZEN", color: "#0a1f5c" };
  };

  const hoverLinkLabel = hoverLink?.type?.toString?.() || hoverLink?.label?.toString?.() || "";

  // ─ THEME 카드 (좌측 상단 고정 표시용) — 페이지 진입 시 즉시 보이도록 hover와 무관하게 렌더 ─
  const themeOverallScore =
    themeReturn && (themeReturn as any).ok === true
      ? Number((themeReturn as any).overallScore)
      : NaN;
  const themeTemp = Number.isFinite(themeOverallScore) ? tempByScore(themeOverallScore) : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      {/* ✅ THEME 고정 카드 — fixed (스크롤해도 유지) + 브리핑 진입 시 자동 fade-out (겹침 방지) */}
      <div
        className={`pointer-events-none fixed z-30 rounded-xl border border-white/10 bg-black/80 px-4 py-3 text-xs text-white/90 backdrop-blur transition-opacity duration-300 ${
          briefingVisible ? "opacity-0" : "opacity-100"
        }`}
        style={{ left: 20, top: 80, width: 300 }}
        aria-hidden={briefingVisible}
      >
        <div className="flex items-center gap-2">
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white/80">
            THEME
          </span>
          <div className="text-sm font-bold">{themeName || themeId}</div>
          <span className="text-[10px] text-white/50">{themeId}</span>
        </div>

        <div className="mt-2 space-y-1.5">
          {themeTemp ? (
            <div className="flex items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-extrabold"
                style={{ background: themeTemp.color, color: "#fff" }}
              >
                {themeTemp.name}
              </span>
              <span className="text-sm font-bold text-white">{Math.round(themeOverallScore)}</span>
              <span className="text-white/60">/ 1000</span>
            </div>
          ) : (
            <div className="text-white/60">Barometer 데이터 없음</div>
          )}
          {themeDescription ? (
            <div className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-relaxed text-white/75">
              {themeDescription}
            </div>
          ) : null}
        </div>
      </div>

      {/* 🎯 Full Asset toggle — 숨겨진 자산이 있을 때만 표시 */}
      {assetRankInfo.hiddenAssetCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="absolute bottom-3 right-3 z-30 rounded-lg px-3 py-1.5 text-[11px] font-medium transition hover:brightness-125"
          style={{
            background: "#1A3450",
            color: "#60A5FA",
            border: "1px solid #3B82F6",
          }}
          title={expanded ? "상위 10개만 보기" : "전체 종목 보기"}
        >
          {expanded
            ? "접기 ▲"
            : `전체 종목 보기 (+ ${assetRankInfo.hiddenAssetCount}개) ▼`}
        </button>
      )}

      {/* ✅ Overlay controls (period 버튼만, 필요 시 표시) */}
      {showOverlayControls && showPeriodButtons && (
        <div className="absolute right-3 top-3 z-30 flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
            {periods.map((p) => {
              const active = p.key === period;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onChangePeriod(p.key)}
                  className={[
                    "rounded-lg px-2.5 py-1 text-[11px] transition",
                    active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                  title={`수익률 기간: ${p.label}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ✅ Node tooltip (Bloomberg style) — per-type
            • THEME → 좌측 상단 고정 카드로 별도 표시 (hover 미사용)
            • ASSET / BF / MACRO / CHARACTER → 우측 상단 고정 호버 */}
      {hoverNode && !isThemeHover && (() => {
        const W = isAssetHover ? 290 : 240;
        const typeLabel =
          isAssetHover ? "ASSET"
          : isFieldHover ? "BUSINESS FIELD"
          : isMacroHover ? "MACRO"
          : isCharacterHover ? "CHARACTER"
          : (hoverNode.type ?? "NODE");

        // (logoFallbackColor 제거 — CompanyLogo 미구현)
        return (
          <div
            className="pointer-events-none absolute z-40 rounded-xl border border-white/10 bg-black/80 px-4 py-3 text-xs text-white/90 backdrop-blur"
            style={tooltipStyle("other", W)}
          >
            {/* Title row: TYPE badge + label. ASSET: 같은 줄에 7D return 인라인 표시 */}
            {isAssetHover ? (
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white/80">
                      {typeLabel}
                    </span>
                    {freshInsightIds?.has(hoverNode.id) && (
                      <span
                        className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                        title="24시간 이내 인사이트 갱신"
                      >
                        💡 NEW
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2 truncate">
                    <span className="truncate text-sm font-bold" title={hoverLabel || hoverNode.id}>
                      {hoverLabel || hoverNode.id}
                    </span>
                    <span
                      className="shrink-0 text-[13px] font-semibold"
                      style={{
                        color: (() => {
                          const rv = getReturnByPeriod(hoverNode, period);
                          if (typeof rv !== "number" || !Number.isFinite(rv)) return "#ffffff";
                          return rv > 0 ? "#FF4444" : rv < 0 ? "#4444FF" : "#ffffff";
                        })(),
                      }}
                    >
                      {period} {fmtReturn(getReturnByPeriod(hoverNode, period))}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white/80">
                  {typeLabel}
                </span>
                <div className="text-sm font-bold">{hoverLabel || hoverNode.id}</div>
              </div>
            )}

            {isAssetHover && (
              <>
                {/* 7D return 인라인 이동: 별도 블록 제거 */}
                {/* Close + VAL DATE 사이 줄간격 축소 (divider 제거, mt-2) */}

                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-white/60">Close</div>
                    <div className="text-sm font-semibold">{fmtNum(getClose(hoverNode))}</div>
                  </div>

                  <div>
                    <div className="text-white/60">VAL DATE</div>
                    {(() => {
                      const raw = getValDate(hoverNode);
                      const s = staleLevel(raw);
                      const color = s === 0 ? "" : s === 1 ? "text-amber-300" : "text-red-400";
                      const badge = s === 0 ? null : staleLabel(raw);
                      return (
                        <div className={`text-sm font-semibold ${color}`}>
                          {fmtDate(raw)}
                          {badge ? (
                            <span className="ml-1 text-[10px] font-medium opacity-80">⚠ {badge}</span>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="mt-2 space-y-1 text-white/80">
                  <div>
                    Ticker : <span className="text-white">{ellipsis(getTicker(hoverNode))}</span>
                  </div>
                  <div>
                    거래소/국가 :{" "}
                    <span className="text-white">
                      {ellipsis(getExchange(hoverNode))}/{ellipsis(getCountry(hoverNode))}
                    </span>
                  </div>
                </div>

                {/* 핵심사업 — briefing 표에서 ticker 매칭 */}
                {(() => {
                  const tk = getTicker(hoverNode);
                  const cb = tk ? coreBizMap.get(tk) : undefined;
                  if (!cb) return null;
                  const lines = cb.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean);
                  return (
                    <div className="mt-3 border-t border-white/10 pt-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
                        핵심 사업
                      </div>
                      <div className="mt-1 space-y-0.5 text-[12px] leading-snug text-white/85">
                        {lines.map((s, i) => (
                          <div key={i}>{s}</div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {/* THEME hover는 좌측 상단 고정 카드로 별도 표시되므로 여기서는 미렌더 */}

            {isMacroHover && (
              <div className="mt-2 space-y-1 text-white/80">
                <div>
                  Type :{" "}
                  <span className="text-white">
                    {(hoverNode as any)?.macro_type ?? (hoverNode as any)?.macroType ?? "—"}
                  </span>
                </div>
                <div className="text-white/60">{hoverNode.id}</div>
              </div>
            )}

            {isFieldHover && (
              <div className="mt-2 text-white/60">{hoverNode.id}</div>
            )}

            {isCharacterHover && (
              <div className="mt-2 text-white/60">{hoverNode.id}</div>
            )}
          </div>
        );
      })()}

      {/* Edge tooltip — 노드 호버와 일관성 유지를 위해 우측 상단에 고정.
          ✅ 클릭 디테일 패널(selectedEdge)이 열려 있으면 툴팁은 숨겨 이중 표시 방지 */}
      {hoverLink && hoverLinkLabel && !selectedEdge && (
        <div
          className="pointer-events-none absolute z-40 rounded-lg border border-white/10 bg-black/75 px-3 py-2 text-xs text-white/90"
          style={tooltipStyle("other", 240)}
        >
          <div className="font-semibold">관계</div>
          <div className="mt-1 text-white/80">{hoverLinkLabel}</div>
          {(() => {
            const evs = Array.isArray(hoverLink?.evidence) ? hoverLink.evidence : [];
            return (
              <div className="mt-1 text-[10px] text-white/55">
                {evs.length > 0 ? `📎 출처 ${evs.length}건 · 클릭하여 보기` : "출처 미기록 · 클릭"}
              </div>
            );
          })()}
        </div>
      )}

      {/* ✅ 출처 디테일 패널 — 엣지 클릭 시 (interactive, pointer-events 허용) */}
      {selectedEdge && (
        <div className="absolute left-1/2 top-3 z-50 w-[420px] max-w-[94vw] -translate-x-1/2 rounded-xl border border-white/15 bg-black/90 px-3.5 py-2.5 text-xs text-white/90 shadow-xl">
          {(() => {
            const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const fmtAsOf = (s: any) => {
              if (!s) return "";
              const m = String(s).match(/^(\d{4})[.\-/](\d{1,2})/);
              if (m) return `${m[1]} ${MONTHS[parseInt(m[2], 10) - 1] || m[2]}`;
              return String(s);
            };
            const endName = (x: any) => {
              if (!x) return "";
              if (typeof x === "object") return x.name || x.id || "";
              const n = (nodes as any[])?.find?.((nn) => nn?.id === x);
              return n?.name || x;
            };
            const from = endName(selectedEdge.source);
            const to = endName(selectedEdge.target);
            const evs: string[] = Array.isArray(selectedEdge.evidence) ? selectedEdge.evidence : [];
            const conf = selectedEdge.confidence;
            const STATUS_LABEL: Record<string, string> = {
              verified: "검증됨",
              proposed: "제안(미검수)",
              legacy: "출처 미기록",
            };
            const STATUS_COLOR: Record<string, string> = {
              verified: "#3FB950",
              proposed: "#EF9F27",
              legacy: "#8B949E",
            };
            const st =
              selectedEdge.status && STATUS_LABEL[selectedEdge.status] ? selectedEdge.status : "legacy";
            return (
              <>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">관계 출처</div>
                  <button
                    type="button"
                    onClick={() => setSelectedEdge(null)}
                    className="rounded px-1.5 text-white/60 hover:text-white"
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-1 break-words leading-snug text-white/85">
                  <span className="font-medium">{from}</span>
                  <span className="mx-1 text-white/50">
                    —{(selectedEdge.type || selectedEdge.label || "").toString()}→
                  </span>
                  <span className="font-medium">{to}</span>
                </div>
                {evs.length === 0 ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: STATUS_COLOR[st] + "33", color: STATUS_COLOR[st] }}
                    >
                      {STATUS_LABEL[st]}
                    </span>
                    {typeof conf === "number" && (
                      <span className="text-[11px] text-white/60">신뢰도 {Math.round(conf * 100)}%</span>
                    )}
                    <span className="text-white/45">· 출처 미기록</span>
                  </div>
                ) : (
                  <div className="mt-1.5 space-y-2">
                    {evs.map((eid, i) => {
                      const r = evidenceMap[eid];
                      if (!r)
                        return (
                          <div key={eid} className="text-white/55">
                            근거 {eid} (로딩 중 / 미발견)
                          </div>
                        );
                      const pub = (r.publisher || "").trim();
                      const asof = fmtAsOf(r.as_of || r.published);
                      return (
                        <div
                          key={eid}
                          className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2"
                        >
                          {/* 검증됨 · 신뢰도 · [뉴스] · 관련보도 — 한 줄 */}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {i === 0 && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                style={{ backgroundColor: STATUS_COLOR[st] + "33", color: STATUS_COLOR[st] }}
                              >
                                {STATUS_LABEL[st]}
                              </span>
                            )}
                            {i === 0 && typeof conf === "number" && (
                              <span className="text-[11px] text-white/60">
                                신뢰도 {Math.round(conf * 100)}%
                              </span>
                            )}
                            {r.source_type && (
                              <span className="rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                                {r.source_type}
                              </span>
                            )}
                            {pub && <span className="text-white/80">{pub}</span>}
                          </div>
                          <div className="mt-1 leading-snug text-white/70">“{r.quote}”</div>
                          {/* 마지막 줄: as of 2026 May · 대표 출처 링크 */}
                          {(() => {
                            const q = (r.source_ref || pub || (r.quote || "").slice(0, 60)).trim();
                            const srcUrl = r.url
                              ? r.url
                              : q
                                ? `https://www.google.com/search?q=${encodeURIComponent(q)}`
                                : "";
                            if (!asof && !srcUrl) return null;
                            return (
                              <div className="mt-1 flex items-center gap-2 text-[10px] text-white/45">
                                {asof && <span>as of {asof}</span>}
                                {srcUrl && (
                                  <a
                                    href={srcUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sky-400 hover:underline"
                                  >
                                    {r.url ? "출처 링크 ↗" : "대표 출처 검색 ↗"}
                                  </a>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      <ForceGraph2D
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={4}
        linkColor={(l: any) => {
          const a = getEdgeOpacity(l);
          return `rgba(255,255,255,${(0.45 * a).toFixed(3)})`;
        }}
        linkWidth={1.4}
        linkDirectionalArrowLength={10}
        linkDirectionalArrowRelPos={0.92}
        linkDirectionalArrowColor={(l: any) => {
          const a = getEdgeOpacity(l);
          return `rgba(255,255,255,${(0.8 * a).toFixed(3)})`;
        }}
        linkHoverPrecision={8}
        linkLabel={(l: any) => (l?.type ?? l?.label ?? "").toString()}
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => "replace"}
        onNodeHover={(n: any) => {
          setHoverNode(n ? (n as NodeT) : null);
          if (n) setHoverLink(null);
        }}
        onLinkHover={(l: any) => {
          setHoverLink(l || null);
          if (l) setHoverNode(null);
        }}
        onBackgroundClick={() => {
          setHoverNode(null);
          setHoverLink(null);
          setSelectedEdge(null);
          handleSelect(null);
        }}
        onNodeClick={(n: any) => {
          setSelectedEdge(null);
          handleSelect(n ? (n as NodeT) : null);
        }}
        onLinkClick={(l: any) => setSelectedEdge(l || null)}
        onMouseMove={(ev: any) => {
          const ox = ev?.offsetX;
          const oy = ev?.offsetY;

          if (typeof ox === "number" && typeof oy === "number") {
            setMousePos({ x: ox, y: oy });
            return;
          }

          const rect = wrapRef.current?.getBoundingClientRect();
          const cx = ev?.clientX;
          const cy = ev?.clientY;

          if (rect && typeof cx === "number" && typeof cy === "number") {
            setMousePos({
              x: Math.max(0, Math.min(rect.width, cx - rect.left)),
              y: Math.max(0, Math.min(rect.height, cy - rect.top)),
            });
            return;
          }

          setMousePos({ x: 0, y: 0 });
        }}
        cooldownTicks={120}
        warmupTicks={120}
        d3AlphaDecay={GRAPH_CONFIG.force.alphaDecay}
        d3VelocityDecay={GRAPH_CONFIG.force.velocityDecay}
        linkCurvature={0}
        onNodeDragEnd={(n: any) => {
          // 드래그 끝나면 즉시 고정 → 재튕김 방지
          if (n) {
            n.fx = n.x;
            n.fy = n.y;
          }
        }}
      />
    </div>
  );
}