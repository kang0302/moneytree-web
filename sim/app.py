# sim/app.py
# 투자퍼포먼스 시뮬레이션 — ETF 이평선 타이밍 + 인출/적립 백테스트 & 시각화 (Streamlit).
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import data
import engine
import metrics
import stress

st.set_page_config(page_title="투자퍼포먼스 시뮬레이션", layout="wide", page_icon="📈")
FOOTNOTE = "환율 제외 · 각 자산 로컬통화 정규화 · 순수 전략 성과 비교"

# ── 고급 다크 테마(그라디언트 배경 + 정제 스타일) ──
st.markdown(
    """
    <style>
      .stApp {
        background:
          radial-gradient(1100px 620px at 12% -8%, rgba(99,102,241,0.14) 0%, rgba(10,10,11,0) 55%),
          radial-gradient(900px 560px at 100% 0%, rgba(56,189,248,0.08) 0%, rgba(10,10,11,0) 50%),
          #08080a;
        background-attachment: fixed;
      }
      [data-testid="stHeader"] { background: transparent; }
      [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #101016 0%, #0b0b0f 100%);
        border-right: 1px solid rgba(255,255,255,0.06);
      }
      .block-container { padding-top: 2.2rem; max-width: 1500px; }
      h1 {
        font-weight: 800; letter-spacing: -0.02em;
        background: linear-gradient(90deg, #e5e7eb 0%, #a5b4fc 60%, #38bdf8 100%);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      }
      /* 탭 */
      .stTabs [data-baseweb="tab-list"] { gap: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .stTabs [data-baseweb="tab"] {
        background: rgba(255,255,255,0.03); border-radius: 10px 10px 0 0;
        padding: 8px 16px; color: rgba(229,231,235,0.7);
      }
      .stTabs [aria-selected="true"] {
        background: rgba(129,140,248,0.16); color: #c7d2fe;
        border-bottom: 2px solid #818cf8;
      }
      /* 버튼 */
      .stButton > button {
        border-radius: 10px; border: 1px solid rgba(129,140,248,0.5);
        background: linear-gradient(180deg, rgba(129,140,248,0.22), rgba(129,140,248,0.10));
        color: #e0e7ff; font-weight: 700;
      }
      .stButton > button:hover { border-color: #a5b4fc; background: rgba(129,140,248,0.30); }
      /* 카드형 요소 */
      [data-testid="stDataFrame"], [data-testid="stExpander"], .stAlert {
        border: 1px solid rgba(255,255,255,0.07); border-radius: 12px;
        background: rgba(255,255,255,0.02);
      }
      /* 입력요소 살짝 부드럽게 */
      [data-baseweb="select"] > div, .stNumberInput input, .stDateInput input {
        background: rgba(255,255,255,0.03) !important; border-radius: 8px !important;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

st.title("📈 투자퍼포먼스 시뮬레이션")
st.caption("ETF 이평선 타이밍 + 인출/적립 백테스트 — " + FOOTNOTE)

# ───────────────────────── 사이드바 파라미터 ─────────────────────────
sb = st.sidebar
sb.header("파라미터")

asset_keys = sb.multiselect("자산", list(data.ASSETS.keys()),
                            default=["SPY", "QQQ", "KODEX200"],
                            format_func=lambda k: data.ASSETS[k].label)

period_choice = sb.selectbox("기간", ["최근 5년", "커스텀", *stress.PRESETS.keys(), "합성결합(닷컴+GFC)"])
custom_start, custom_end = None, None
if period_choice == "커스텀":
    c1, c2 = sb.columns(2)
    custom_start = c1.date_input("시작", date(2021, 1, 1))
    custom_end = c2.date_input("종료", date.today())

mode_label = sb.radio("모드", ["원금거치(lump)", "적립(DCA)"], horizontal=True)
mode = "lump" if mode_label.startswith("원금") else "dca"
if mode == "lump":
    principal = sb.number_input("원금액", value=10_000.0, step=1_000.0, min_value=0.0)
    monthly = 0.0
else:
    monthly = sb.number_input("월 적립액", value=1_000.0, step=100.0, min_value=0.0)
    principal = 0.0

wd_label = sb.selectbox("인출", ["없음", "정액(월 X)", "정률(월 잔고 Y%)"])
withdraw = {"없음": "none", "정액(월 X)": "fixed", "정률(월 잔고 Y%)": "pct"}[wd_label]
withdraw_amt, withdraw_pct = 0.0, 0.0
if withdraw == "fixed":
    withdraw_amt = sb.number_input("월 인출액", value=500.0, step=100.0, min_value=0.0)
elif withdraw == "pct":
    withdraw_pct = sb.number_input("월 인출률 %", value=0.5, step=0.1, min_value=0.0) / 100.0

ma_period = int(sb.number_input("이평선 기간(일)", value=200, step=10, min_value=2))
exec_next = sb.checkbox("익일 실행(1일 지연 프록시)", value=False)

sb.markdown("**전략**")
STRAT_LABELS = {"벤치마크(보유/DCA)": "benchmark", "전량매도": "sell_all",
                "매수중지": "stop_buy", "일부매도(X%)": "partial_sell"}
strat_sel = sb.multiselect("비교 전략", list(STRAT_LABELS.keys()),
                           default=["벤치마크(보유/DCA)", "전량매도", "매수중지"])
partial_pct = sb.number_input("일부매도 X%", value=30.0, step=5.0, min_value=0.0, max_value=100.0) / 100.0

with sb.expander("DD 브레이커(전고점 대비) — 모든 전략에 추가"):
    dd_on = st.checkbox("사용", value=False)
    dd_A = st.number_input("전고점 대비 −A% 트리거", value=20.0, step=1.0) if dd_on else None
    dd_B = st.number_input("보유분 B% 매도", value=50.0, step=5.0) if dd_on else 0.0
    dd_C = st.number_input("−C%까지 회복 시 재장전", value=10.0, step=1.0) if dd_on else None

with sb.expander("비용·배당·현금"):
    drip = st.checkbox("배당 재투자(DRIP)", value=True)
    sell_tax = st.number_input("매도 거래세 %", value=0.20, step=0.05, min_value=0.0) / 100.0
    buy_fee = st.number_input("매수 수수료 %", value=0.0, step=0.05, min_value=0.0) / 100.0
    mmf_rate = st.number_input("현금 MMF 연이자 %", value=3.0, step=0.5, min_value=0.0) / 100.0
    rf = st.number_input("무위험수익률 rf %(Sharpe/Sortino)", value=3.0, step=0.5, min_value=0.0) / 100.0
    st.markdown("**자산별 연배당율 %**")
    div_by_key = {}
    for k in asset_keys:
        div_by_key[k] = st.number_input(f"  {data.ASSETS[k].label}", value=1.0, step=0.1,
                                        min_value=0.0, key=f"div_{k}") / 100.0

force = sb.checkbox("데이터 강제 새로고침", value=False)
run = sb.button("▶ 백테스트 실행", type="primary")


# ───────────────────────── 가격 로딩 ─────────────────────────
def resolve_prices() -> tuple[dict, str]:
    if not asset_keys:
        return {}, ""
    if period_choice == "최근 5년":
        s, e = stress.recent_5y()
        return data.get_many(asset_keys, s, e, force), f"{s}~{e}"
    if period_choice == "커스텀":
        return data.get_many(asset_keys, custom_start, custom_end, force), f"{custom_start}~{custom_end}"
    if period_choice in stress.PRESETS:
        s, e = stress.PRESETS[period_choice]
        return data.get_many(asset_keys, s, e, force), f"{s}~{e}"
    # 합성결합(닷컴+GFC)
    out = {}
    for k in asset_keys:
        segs = []
        for (s, e) in stress.PRESETS.values():
            try:
                px = data.get_prices(k, s, e, force)
                if len(px) > 5:
                    segs.append(px)
            except Exception:
                pass
        if segs:
            out[k] = stress.stitch_returns(segs)
    return out, "합성결합(닷컴+GFC, 수익률 이어붙이기)"


def build_strategies() -> list:
    out = []
    for label in strat_sel:
        rule = STRAT_LABELS[label]
        sp = engine.StrategyParams(
            name=label, ma_period=ma_period, rule=rule,
            partial_sell_pct=partial_pct if rule == "partial_sell" else 0.0,
            dd_A=dd_A if dd_on else None, dd_B=dd_B if dd_on else 0.0,
            dd_reload_C=dd_C if dd_on else None, execute_next_open=exec_next,
        )
        out.append(sp)
    return out


if run:
    if not asset_keys or not strat_sel:
        st.warning("자산과 전략을 하나 이상 선택하세요.")
        st.stop()
    with st.spinner("데이터 로딩·백테스트 중…"):
        prices, period_lbl = resolve_prices()
        prices = {k: v for k, v in prices.items() if v is not None and len(v) > ma_period}
        if not prices:
            st.error("선택 기간에 유효한 데이터가 있는 자산이 없습니다(이평선 기간보다 데이터가 짧을 수 있음).")
            st.stop()
        fp = engine.FlowParams(mode=mode, principal=principal, monthly_contrib=monthly,
                               withdraw=withdraw, withdraw_amt=withdraw_amt, withdraw_pct=withdraw_pct)
        cp_by = {k: engine.CostParams(div_yield=div_by_key.get(k, 0.0), drip=drip,
                                      sell_tax=sell_tax, buy_fee=buy_fee, mmf_rate=mmf_rate)
                 for k in prices}
        strat_list = build_strategies()
        results = engine.run_multi(prices, strat_list, fp, cp_by)
        rows = []
        for (tk, sname), res in results.items():
            m = metrics.summarize(res, rf)
            rows.append({"자산": data.ASSETS[tk].label, "전략": sname, "_tk": tk, "_res": res, **m})
        df = pd.DataFrame(rows)

    st.success(f"완료 · 기간: {period_lbl} · 자산 {len(prices)} × 전략 {len(strat_list)}")

    t1, t2, t3, t4, t5 = st.tabs(["자산곡선", "위험-수익", "비교표", "인출경로", "시사점"])

    # ① 자산곡선 오버레이
    with t1:
        fig = go.Figure()
        for (tk, sname), res in results.items():
            if tk in prices:
                fig.add_trace(go.Scatter(x=res.equity.index, y=res.equity.values,
                                         name=f"{data.ASSETS[tk].label} · {sname}", mode="lines"))
        fig.update_layout(height=560, hovermode="x unified", template="plotly_dark",
                          paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                          yaxis_title="평가액(로컬통화 정규화)", legend=dict(orientation="h"))
        st.plotly_chart(fig, use_container_width=True)
        st.caption(FOOTNOTE)

    # ② 위험-수익 산점도
    with t2:
        yopt = st.radio("Y축", ["총수익률", "XIRR"], horizontal=True)
        ycol = "total_return" if yopt == "총수익률" else "xirr"
        fig = go.Figure()
        for sname in df["전략"].unique():
            sub = df[df["전략"] == sname]
            fig.add_trace(go.Scatter(
                x=(-sub["mdd"] * 100), y=sub[ycol] * 100, mode="markers+text",
                text=sub["자산"], textposition="top center", name=sname,
                marker=dict(size=13)))
        fig.update_layout(height=560, template="plotly_dark",
                          paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                          xaxis_title="MDD (%, 클수록 위험)", yaxis_title=f"{yopt} (%)")
        st.plotly_chart(fig, use_container_width=True)
        st.caption(FOOTNOTE)

    # ③ 비교표
    with t3:
        show = df[["자산", "전략", "final_value", "total_return", "xirr", "twr_ann",
                   "volatility", "sharpe", "sortino", "mdd", "trades"]].copy()
        show.columns = ["자산", "전략", "최종평가액", "총수익률", "XIRR", "TWR(연)",
                        "연변동성", "Sharpe", "Sortino", "MDD", "매매횟수"]
        for c in ["총수익률", "XIRR", "TWR(연)", "연변동성", "MDD"]:
            show[c] = (show[c] * 100).round(1).astype(str) + "%"
        for c in ["Sharpe", "Sortino"]:
            show[c] = show[c].round(2)
        show["최종평가액"] = show["최종평가액"].round(0).map(lambda v: f"{v:,.0f}")
        st.dataframe(show, use_container_width=True, hide_index=True)
        st.caption(FOOTNOTE)

    # ④ 인출경로 (인출모드 전용)
    with t4:
        if withdraw == "none":
            st.info("인출 모드가 아닙니다. 사이드바에서 '정액/정률' 인출을 선택하세요.")
        else:
            for (tk, sname), res in results.items():
                cumw = (-res.ext_flow.clip(upper=0)).cumsum()
                fig = go.Figure()
                fig.add_trace(go.Scatter(x=res.equity.index, y=res.equity.values, name="잔고", mode="lines"))
                fig.add_trace(go.Scatter(x=cumw.index, y=cumw.values, name="누적 인출", mode="lines",
                                         line=dict(dash="dot")))
                if res.depletion_date is not None:
                    fig.add_vline(x=res.depletion_date, line_color="#ef4444", line_dash="dash",
                                  annotation_text="고갈")
                fig.update_layout(height=340, template="plotly_dark",
                                  paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                                  title=f"{data.ASSETS[tk].label} · {sname} "
                                        f"(부족 {res.shortfall_count}회)")
                st.plotly_chart(fig, use_container_width=True)
            st.caption(FOOTNOTE)

    # ⑤ 시사점 자동요약
    with t5:
        best_ret = df.loc[df["total_return"].idxmax()]
        low_mdd = df.loc[df["mdd"].idxmax()]  # mdd는 음수 → 최대값이 최소 낙폭
        best_sharpe = df.loc[df["sharpe"].idxmax()]
        st.markdown(f"""
- 🥇 **최고 수익**: {best_ret['자산']} · {best_ret['전략']} — 총수익률 **{best_ret['total_return']*100:.1f}%**, MDD {best_ret['mdd']*100:.1f}%
- 🛡️ **최저 낙폭**: {low_mdd['자산']} · {low_mdd['전략']} — MDD **{low_mdd['mdd']*100:.1f}%**, 총수익률 {low_mdd['total_return']*100:.1f}%
- ⚖️ **최고 Sharpe**: {best_sharpe['자산']} · {best_sharpe['전략']} — Sharpe **{best_sharpe['sharpe']:.2f}**, 총수익률 {best_sharpe['total_return']*100:.1f}%
""")
        bench = df[df["전략"].str.contains("벤치마크")]
        timing = df[~df["전략"].str.contains("벤치마크")]
        if not bench.empty and not timing.empty:
            b = bench["total_return"].mean() * 100
            t = timing["total_return"].mean() * 100
            verdict = "타이밍 전략이 평균적으로 벤치마크를 상회" if t > b else "벤치마크가 평균적으로 타이밍 전략을 상회"
            st.markdown(f"- 📊 **타이밍 vs 벤치마크**: {verdict} (평균 총수익률 타이밍 {t:.1f}% vs 벤치마크 {b:.1f}%). "
                        f"위기 프리셋에서는 하방 방어(낮은 MDD)로 타이밍이 유리한 경향.")
        st.caption(FOOTNOTE)
else:
    st.info("사이드바에서 파라미터를 설정하고 **백테스트 실행**을 누르세요.")
