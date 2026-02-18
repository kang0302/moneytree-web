import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      }}
    >
      {/* 상단 메뉴 */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #e5e7eb",
          paddingBottom: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ fontWeight: 800, letterSpacing: -0.2 }}>MoneyTree</div>

        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/" style={linkStyle}>
            Home
          </Link>
          <Link href="/themes" style={linkStyle}>
            All Themes
          </Link>
          <Link href="/graph" style={linkStyle}>
            Graph Explorer
          </Link>
        </nav>
      </header>

      {/* 메인 */}
      <section style={{ maxWidth: 840 }}>
        <h1 style={{ fontSize: 32, margin: "0 0 10px", letterSpacing: -0.5 }}>
          MoneyTree Home
        </h1>

        <p style={{ margin: "0 0 18px", color: "#4b5563", lineHeight: 1.6 }}>
          투자 인사이트를 <b>테마</b>와 <b>그래프</b>로 탐색하는 하이브리드 웹서비스.
          <br />
          오늘은 라우팅(페이지 뼈대)부터 고정합니다.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/themes" style={buttonStyle}>
            All Themes 보기 →
          </Link>
          <Link href="/graph" style={buttonStyle}>
            Graph Explorer →
          </Link>
        </div>

        <div
          style={{
            marginTop: 24,
            padding: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <h3 style={{ margin: 0 }}>오늘의 상태</h3>
          <ul style={{ margin: "10px 0 0", color: "#374151", lineHeight: 1.7 }}>
            <li>홈(/) 페이지 ✅</li>
            <li>테마(/themes) 페이지 ✅</li>
            <li>그래프(/graph) 페이지 ✅</li>
          </ul>
        </div>
      </section>
    </main>
  );
}

const linkStyle: React.CSSProperties = {
  textDecoration: "none",
  color: "#111827",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "white",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111827",
  color: "white",
  fontWeight: 700,
  fontSize: 14,
};
