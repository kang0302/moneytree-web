"use client";

import React, { useEffect, useMemo, useState } from "react";
import { loadSearchIndex, searchByKeyword, SearchIndexV3 } from "@/lib/searchIndex";

type Tab = "ASSET" | "THEME" | "BUSINESS_FIELD" | "MACRO";

const TYPE_LABEL: Record<Tab, string> = {
  ASSET: "ASSET",
  THEME: "THEME",
  BUSINESS_FIELD: "BF",
  MACRO: "MACRO",
};

const TYPE_COLOR: Record<Tab, string> = {
  ASSET: "#22d3ee",
  THEME: "#f59e0b",
  BUSINESS_FIELD: "#a78bfa",
  MACRO: "#34d399",
};

export default function SearchBar({
  indexUrl, // 🔸 들어와도 무시(안전 고정)
  onGoTheme,
  onGoThemeFocus,
}: {
  indexUrl: string;
  onGoTheme: (themeId: string) => void;
  onGoThemeFocus?: (themeId: string, focusId: string) => void;
}) {
  const [idx, setIdx] = useState<SearchIndexV3 | null>(null);
  const [kw, setKw] = useState("");
  const [tab, setTab] = useState<Tab>("ASSET");
  const [open, setOpen] = useState(false);

  // ✅ Next.js에서는 URL에 /public 이 절대 붙지 않는다.
  // ✅ indexUrl이 어떤 값이 오든, 실제 서빙되는 경로(/data/...)로 고정해서 404를 원천 차단.
  const safeIndexUrl = useMemo(() => {
    // 캐시 버스트(개발 중 파일 갱신 강제 반영)
    return `/data/search/search_index.json?v=${Date.now()}`;
  }, []);

  useEffect(() => {
    loadSearchIndex(safeIndexUrl)
      .then(setIdx)
      .catch((e) => {
        console.error("[SearchBar] loadSearchIndex failed:", e);
        setIdx(null);
      });
  }, [safeIndexUrl]);

  const result = useMemo(() => {
    if (!idx) return { assets: [], themes: [], businessFields: [], macros: [] };
    return searchByKeyword(idx, kw);
  }, [idx, kw]);

  const list =
    tab === "ASSET"
      ? result.assets
      : tab === "THEME"
      ? result.themes
      : tab === "BUSINESS_FIELD"
      ? result.businessFields
      : result.macros;

  const TypeBadge = ({ t }: { t: Tab }) => (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.4,
        color: "#0a0a0a",
        background: TYPE_COLOR[t],
        marginRight: 8,
        verticalAlign: "middle",
      }}
    >
      {TYPE_LABEL[t]}
    </span>
  );

  const renderRow = (item: any) => {
    if (tab === "THEME") {
      return (
        <button
          key={item.id}
          onClick={() => {
            setOpen(false);
            onGoTheme(item.id);
          }}
          style={rowBtnStyle}
        >
          <div style={{ fontWeight: 700 }}>
            <TypeBadge t="THEME" />
            {item.name}
          </div>
          <div style={subStyle}>
            {item.id} · assets {item.assets?.length ?? 0} · bfs {item.businessFields?.length ?? 0} · macros{" "}
            {item.macros?.length ?? 0}
          </div>
        </button>
      );
    }

    const themeIds: string[] = item.themes ?? [];
    const clickable = themeIds.length > 0;

    return (
      <div key={item.id} style={rowDivStyle}>
        <button
          type="button"
          onClick={() => {
            const ids = item.themes ?? [];
            if (!ids.length) return;
            const tid = String(ids[0]).trim();
            if (!tid) return;

            if (tab === "ASSET" && onGoThemeFocus) onGoThemeFocus(tid, item.id);
            else onGoTheme(tid);

            setOpen(false);
          }}
          style={{ ...nameBtnStyle, cursor: clickable ? "pointer" : "default" }}
          title={
            tab === "ASSET"
              ? "첫 번째 연결 테마로 이동 (focus)"
              : themeIds.length > 0
              ? "첫 번째 연결 테마로 이동"
              : undefined
          }
        >
          <div style={{ fontWeight: 700 }}>
            <TypeBadge t={tab} />
            {item.name}
          </div>
        </button>

        {tab === "ASSET" ? (
          <div style={subStyle}>
            {(item.ticker || "-").toString()} | {(item.exchange || "-").toString()} ({(item.country || "-").toString()})
            · {item.id}
          </div>
        ) : tab === "BUSINESS_FIELD" ? (
          <div style={subStyle}>
            {item.id} · themes {themeIds.length} · assets {item.assets?.length ?? 0}
          </div>
        ) : (
          <div style={subStyle}>
            {item.id} · type {(item.macro_type || "-").toString()} · themes {themeIds.length} · assets{" "}
            {item.assets?.length ?? 0}
          </div>
        )}

        {themeIds.length > 0 && (
          <div style={chipWrapStyle}>
            {themeIds.slice(0, 10).map((t: string) => (
              <button
                key={t}
                onClick={() => {
                  setOpen(false);
                  if (tab === "ASSET" && onGoThemeFocus) onGoThemeFocus(t, item.id);
                  else onGoTheme(t);
                }}
                style={chipBtnStyle}
                title={t}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={wrapStyle}>
      <div style={topRowStyle}>
        <input
          value={kw}
          onChange={(e) => {
            setKw(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search (자산/티커/테마/산업/매크로/캐릭터)"
          style={inputStyle}
        />

        <div style={tabRowStyle}>
          <button type="button" onClick={() => setTab("ASSET")} style={tab === "ASSET" ? tabOnStyle : tabOffStyle}>
            ASSET
          </button>
          <button type="button" onClick={() => setTab("THEME")} style={tab === "THEME" ? tabOnStyle : tabOffStyle}>
            THEME
          </button>
          <button
            type="button"
            onClick={() => setTab("BUSINESS_FIELD")}
            style={tab === "BUSINESS_FIELD" ? tabOnStyle : tabOffStyle}
          >
            BF
          </button>
          <button type="button" onClick={() => setTab("MACRO")} style={tab === "MACRO" ? tabOnStyle : tabOffStyle}>
            MACRO
          </button>
        </div>
      </div>

      {open && kw.trim().length > 0 && (
        <div style={panelStyle}>
          {list.length === 0 ? <div style={emptyStyle}>No results</div> : <div style={listWrapStyle}>{list.map(renderRow)}</div>}
        </div>
      )}
    </div>
  );
}

/* styles */
const wrapStyle: React.CSSProperties = { position: "relative", width: "100%" };
const topRowStyle: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", width: "100%" };
const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 36,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(0,0,0,0.25)",
  color: "#fff",
  padding: "0 12px",
  outline: "none",
};
const tabRowStyle: React.CSSProperties = { display: "flex", gap: 6, alignItems: "center" };
const tabBaseStyle: React.CSSProperties = {
  height: 30,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  padding: "0 10px",
  fontSize: 12,
  cursor: "pointer",
};
const tabOnStyle: React.CSSProperties = { ...tabBaseStyle, background: "rgba(255,255,255,0.18)", color: "#fff" };
const tabOffStyle: React.CSSProperties = { ...tabBaseStyle, background: "rgba(0,0,0,0.18)", color: "rgba(255,255,255,0.75)" };
const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 44,
  left: 0,
  right: 0,
  zIndex: 50,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(20,20,20,0.92)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
  overflow: "hidden",
};
const listWrapStyle: React.CSSProperties = { maxHeight: 420, overflowY: "auto" };
const emptyStyle: React.CSSProperties = { padding: 14, color: "rgba(255,255,255,0.65)", fontSize: 13 };
const rowBtnStyle: React.CSSProperties = { width: "100%", textAlign: "left", padding: "10px 12px", border: "none", background: "transparent", color: "#fff", cursor: "pointer" };
const rowDivStyle: React.CSSProperties = { padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#fff" };
const nameBtnStyle: React.CSSProperties = { width: "100%", textAlign: "left", border: "none", background: "transparent", padding: 0, color: "#fff" };
const subStyle: React.CSSProperties = { marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.65)" };
const chipWrapStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 };
const chipBtnStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.10)",
  color: "rgba(255,255,255,0.85)",
  fontSize: 11,
  padding: "3px 8px",
  cursor: "pointer",
};
