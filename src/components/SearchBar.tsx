"use client";

import React, { useEffect, useMemo, useState } from "react";
import { loadSearchIndex, searchByKeyword, SearchIndexV3 } from "@/lib/searchIndex";

type Tab = "ASSET" | "THEME" | "BUSINESS_FIELD" | "MACRO";

export default function SearchBar({
  indexUrl,
  onGoTheme,
}: {
  indexUrl: string;
  onGoTheme: (themeId: string) => void;
}) {
  const [idx, setIdx] = useState<SearchIndexV3 | null>(null);
  const [kw, setKw] = useState("");
  const [tab, setTab] = useState<Tab>("ASSET");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadSearchIndex(indexUrl)
      .then(setIdx)
      .catch((e) => {
        console.error(e);
        setIdx(null);
      });
  }, [indexUrl]);

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

  const renderRow = (item: any) => {
    // THEME: 바로 이동
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
          <div style={{ fontWeight: 700 }}>{item.name}</div>
          <div style={subStyle}>
            {item.id} · assets {item.assets?.length ?? 0} · bfs {item.businessFields?.length ?? 0} · macros{" "}
            {item.macros?.length ?? 0}
          </div>
        </button>
      );
    }

    // ASSET / BF / MACRO: 연결된 테마 칩으로 점프
    const themeIds: string[] =
      tab === "ASSET" ? item.themes ?? [] : tab === "BUSINESS_FIELD" ? item.themes ?? [] : item.themes ?? [];

    return (
      <div key={item.id} style={rowDivStyle}>
        <div style={{ fontWeight: 700 }}>{item.name}</div>

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
                  onGoTheme(t);
                }}
                style={chipStyle}
                title="테마로 이동"
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
    <div style={{ position: "relative", width: "100%", maxWidth: 520 }}>
      <input
        value={kw}
        onChange={(e) => {
          setKw(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // 클릭 이벤트가 먼저 발생하도록 약간 지연
          setTimeout(() => setOpen(false), 150);
        }}
        placeholder={idx ? "자산/테마/사업분야/매크로 검색" : "검색 인덱스 로딩중..."}
        style={inputStyle}
      />

      {open && kw.trim() && (
        <div style={panelStyle}>
          <div style={tabBarStyle}>
            <button type="button" onMouseDown={() => setTab("ASSET")} style={tab === "ASSET" ? tabOn : tabOff}>
              자산
            </button>
            <button type="button" onMouseDown={() => setTab("THEME")} style={tab === "THEME" ? tabOn : tabOff}>
              테마
            </button>
            <button
              type="button"
              onMouseDown={() => setTab("BUSINESS_FIELD")}
              style={tab === "BUSINESS_FIELD" ? tabOn : tabOff}
            >
              사업분야
            </button>
            <button type="button" onMouseDown={() => setTab("MACRO")} style={tab === "MACRO" ? tabOn : tabOff}>
              매크로
            </button>
          </div>

          <div style={{ maxHeight: 380, overflow: "auto" }}>
            {list.length === 0 ? <div style={emptyStyle}>검색 결과 없음</div> : list.map(renderRow)}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 38,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  padding: "0 12px",
  outline: "none",
  background: "rgba(255,255,255,0.95)",
};

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 44,
  left: 0,
  right: 0,
  zIndex: 50,
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 12,
  boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
  overflow: "hidden",
};

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  padding: 8,
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

const tabOn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "rgba(0,0,0,0.06)",
  fontWeight: 800,
  cursor: "pointer",
};

const tabOff: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "transparent",
  fontWeight: 700,
  opacity: 0.85,
  cursor: "pointer",
};

const rowBtnStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: 12,
  border: "none",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  background: "transparent",
  cursor: "pointer",
};

const rowDivStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: 12,
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  background: "transparent",
};

const subStyle: React.CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  opacity: 0.7,
};

const chipWrapStyle: React.CSSProperties = {
  marginTop: 8,
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const chipStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.14)",
  background: "rgba(0,0,0,0.04)",
  cursor: "pointer",
};

const emptyStyle: React.CSSProperties = {
  padding: 12,
  opacity: 0.7,
};
