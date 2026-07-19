# sim/app.py
# 투자퍼포먼스 시뮬레이션 — 자산배분 포트폴리오 + 이평선/드로다운 다단계 매도 래더 +
#   인출/적립 백테스트 & 시각화 + 시뮬 기록 저장/불러오기 (Streamlit).
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import data
import engine
import metrics
import store
import stress

st.set_page_config(page_title="투자퍼포먼스 시뮬레이션", layout="wide", page_icon="📈")
FOOTNOTE = "환율 제외 · 각 자산 로컬통화 정규화 · 순수 전략 성과 비교"

# 저장 기록에서 '설정 적용' 시: 위젯 생성 전에 session_state에 값 주입
if "_load_params" in st.session_state:
    _lp = st.session_state.pop("_load_params")
    for _k, _v in (_lp or {}).items():
        if _k in ("w_cstart", "w_cend") and isinstance(_v, str):
            try:
                _v = date.fromisoformat(_v[:10])
            except ValueError:
                continue
        st.session_state[_k] = _v

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
      .stTabs [data-baseweb="tab-list"] { gap: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .stTabs [data-baseweb="tab"] {
        background: rgba(255,255,255,0.03); border-radius: 10px 10px 0 0;
        padding: 8px 16px; color: rgba(229,231,235,0.7);
      }
      .stTabs [aria-selected="true"] {
        background: rgba(129,140,248,0.16); color: #c7d2fe;
        border-bottom: 2px solid #818cf8;
      }
      .stButton > button {
        border-radius: 10px; border: 1px solid rgba(129,140,248,0.5);
        background: linear-gradient(180deg, rgba(129,140,248,0.22), rgba(129,140,248,0.10));
        color: #e0e7ff; font-weight: 700;
      }
      .stButton > button:hover { border-color: #a5b4fc; background: rgba(129,140,248,0.30); }
      [data-testid="stDataFrame"], [data-testid="stExpander"], .stAlert {
        border: 1px solid rgba(255,255,255,0.07); border-radius: 12px;
        background: rgba(255,255,255,0.02);
      }
      [data-baseweb="select"] > div, .stNumberInput input, .stDateInput input {
        background: rgba(255,255,255,0.03) !important; border-radius: 8px !important;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

HOME_URL = "http://localhost:3000"
st.markdown(
    f"""
    <a href="{HOME_URL}" target="_self" style="
      display:inline-flex; align-items:center; gap:6px; text-decoration:none;
      border:1px solid rgba(129,140,248,0.4); background:rgba(129,140,248,0.12);
      color:#c7d2fe; font-weight:600; font-size:13px; padding:6px 14px; border-radius:9px;">
      ← KNOW_VEST 홈으로
    </a>
    """,
    unsafe_allow_html=True,
)

st.title("📈 투자퍼포먼스 시뮬레이션")
st.caption("자산배분 + 이평선/드로다운 다단계 매도 래더 + 인출/적립 백테스트 — " + FOOTNOTE)

# ───────────────────────── 사이드바 파라미터 ─────────────────────────
sb = st.sidebar
sb.header("파라미터")

asset_keys = sb.multiselect("자산", list(data.ASSETS.keys()),
                            default=["SPY", "QQQ", "KODEX200"],
                            format_func=lambda k: data.ASSETS[k].label, key="w_assets")

# ① 자산배분 얼로케이션(포트폴리오 결합)
portfolio_mode = sb.checkbox("🧺 포트폴리오 결합(자산배분)", value=False, key="w_pf",
                             help="켜면 아래 비중으로 자산을 합산한 단일 포트폴리오로 백테스트합니다.")
weights: dict[str, float] = {}
if portfolio_mode and asset_keys:
    sb.markdown("**자산 배분(%) — 합계 100%**")
    default_w = round(100.0 / len(asset_keys), 1)
    raw = {}
    for k in asset_keys:
        raw[k] = sb.number_input(f"  {data.ASSETS[k].label}", value=default_w, step=5.0,
                                 min_value=0.0, max_value=100.0, key=f"w_wt_{k}")
    tot = sum(raw.values())
    if tot <= 0:
        sb.error("비중 합이 0입니다.")
    else:
        weights = {k: v / tot for k, v in raw.items()}
        if abs(tot - 100.0) > 0.05:
            sb.caption(f"⚠️ 합계 {tot:.1f}% → 100%로 정규화하여 적용합니다.")
        else:
            sb.caption(f"합계 {tot:.1f}%")

period_choice = sb.selectbox("기간", ["최근 5년", "커스텀", *stress.PRESETS.keys(), "합성결합(닷컴+GFC)"],
                             key="w_period")
custom_start, custom_end = None, None
if period_choice == "커스텀":
    c1, c2 = sb.columns(2)
    custom_start = c1.date_input("시작", date(2021, 1, 1), key="w_cstart")
    custom_end = c2.date_input("종료", date.today(), key="w_cend")

mode_label = sb.radio("모드", ["원금거치(lump)", "적립(DCA)"], horizontal=True, key="w_mode")
mode = "lump" if mode_label.startswith("원금") else "dca"
if mode == "lump":
    principal = sb.number_input("원금액", value=10_000.0, step=1_000.0, min_value=0.0, key="w_principal")
    monthly = 0.0
else:
    monthly = sb.number_input("월 적립액", value=1_000.0, step=100.0, min_value=0.0, key="w_monthly")
    principal = 0.0

wd_label = sb.selectbox("인출", ["없음", "정액(월 X)", "정률(월 잔고 Y%)"], key="w_wd")
withdraw = {"없음": "none", "정액(월 X)": "fixed", "정률(월 잔고 Y%)": "pct"}[wd_label]
withdraw_amt, withdraw_pct = 0.0, 0.0
if withdraw == "fixed":
    withdraw_amt = sb.number_input("월 인출액", value=500.0, step=100.0, min_value=0.0, key="w_wamt")
elif withdraw == "pct":
    withdraw_pct = sb.number_input("월 인출률 %", value=0.5, step=0.1, min_value=0.0, key="w_wpct") / 100.0

ma_period = int(sb.number_input("이평선 기간(일)", value=200, step=10, min_value=2, key="w_ma"))
exec_next = sb.checkbox("익일 실행(1일 지연 프록시)", value=False, key="w_exec")

sb.markdown("**기본 전략**")
STRAT_LABELS = {"벤치마크(보유/DCA)": "benchmark", "전량매도": "sell_all",
                "매수중지": "stop_buy", "일부매도(X%)": "partial_sell"}
strat_sel = sb.multiselect("비교 전략", list(STRAT_LABELS.keys()),
                           default=["벤치마크(보유/DCA)", "전량매도", "매수중지"], key="w_strats")
partial_pct = sb.number_input("일부매도 X%", value=30.0, step=5.0, min_value=0.0, max_value=100.0,
                              key="w_partial") / 100.0

# ② 다단계 일부매도(래더)
with sb.expander("🪜 다단계 일부매도(래더)"):
    ladder_on = st.checkbox("래더 전략을 비교에 포함", value=False, key="w_ladder_on")
    st.caption("MA 이탈 티어: 종가가 각 이평선 아래로 내려가면 '현재 보유분'의 %를 매도(각 1회, 재진입 시 재장전).")
    ma_tiers_in = []
    for n in range(1, 4):
        cc1, cc2 = st.columns(2)
        d = cc1.number_input(f"MA{n} 이평일수", value=[60, 120, 200][n - 1], step=10, min_value=0,
                             key=f"w_mt{n}_d")
        pctv = cc2.number_input(f"MA{n} 매도%", value=[20.0, 30.0, 40.0][n - 1], step=5.0,
                                min_value=0.0, max_value=100.0, key=f"w_mt{n}_p")
        if d > 0 and pctv > 0:
            ma_tiers_in.append((int(d), pctv / 100.0))
    st.caption("전고점(252일) 대비 하락 티어: -하락%에 도달하면 보유분의 %를 매도(각 1회).")
    dd_tiers_in = []
    for n in range(1, 4):
        cc1, cc2 = st.columns(2)
        thr = cc1.number_input(f"하락{n} 전고점대비 −%", value=[10.0, 20.0, 30.0][n - 1], step=1.0,
                               min_value=0.0, max_value=100.0, key=f"w_dd{n}_t")
        fr = cc2.number_input(f"하락{n} 매도%", value=[20.0, 30.0, 50.0][n - 1], step=5.0,
                              min_value=0.0, max_value=100.0, key=f"w_dd{n}_f")
        if thr > 0 and fr > 0:
            dd_tiers_in.append((thr, fr / 100.0))
    r1, r2 = st.columns(2)
    reentry_ma = int(r1.number_input("재진입 이평(일)", value=200, step=10, min_value=0, key="w_re_ma"))
    reentry_dd = r2.number_input("재진입 −dd% 이내 회복", value=5.0, step=1.0, min_value=0.0, key="w_re_dd")

with sb.expander("비용·배당·현금"):
    drip = st.checkbox("배당 재투자(DRIP)", value=True, key="w_drip")
    sell_tax = st.number_input("매도 거래세 %", value=0.20, step=0.05, min_value=0.0, key="w_stax") / 100.0
    buy_fee = st.number_input("매수 수수료 %", value=0.0, step=0.05, min_value=0.0, key="w_bfee") / 100.0
    mmf_rate = st.number_input("현금 MMF 연이자 %", value=3.0, step=0.5, min_value=0.0, key="w_mmf") / 100.0
    rf = st.number_input("무위험수익률 rf %(Sharpe/Sortino)", value=3.0, step=0.5, min_value=0.0,
                         key="w_rf") / 100.0
    st.markdown("**자산별 연배당율 %**")
    div_by_key = {}
    for k in asset_keys:
        div_by_key[k] = st.number_input(f"  {data.ASSETS[k].label}", value=1.0, step=0.1,
                                        min_value=0.0, key=f"div_{k}") / 100.0

force = sb.checkbox("데이터 강제 새로고침", value=False, key="w_force")
run = sb.button("▶ 백테스트 실행", type="primary")

# ── 저장된 시뮬레이션 불러오기 ──
sb.markdown("---")
sb.markdown("**📚 저장된 시뮬레이션**")
_runs = store.list_runs()
if _runs:
    _opts = {f"{r['name']}  ·  {r['saved_at'][:16]}": r["id"] for r in _runs}
    _sel = sb.selectbox("기록 선택", ["(선택)"] + list(_opts.keys()), key="w_loadsel")
    lc1, lc2 = sb.columns(2)
    if lc1.button("설정 적용", disabled=(_sel == "(선택)")):
        rec = store.load_run(_opts[_sel])
        if rec:
            st.session_state["_load_params"] = rec.get("params", {})
            st.session_state["_recall_id"] = rec["id"]
            st.rerun()
    if lc2.button("삭제", disabled=(_sel == "(선택)")):
        store.delete_run(_opts[_sel])
        st.rerun()
else:
    sb.caption("저장된 기록이 없습니다.")


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
        out.append(engine.StrategyParams(
            name=label, ma_period=ma_period, rule=rule,
            partial_sell_pct=partial_pct if rule == "partial_sell" else 0.0,
            execute_next_open=exec_next,
        ))
    if ladder_on and (ma_tiers_in or dd_tiers_in):
        out.append(engine.StrategyParams(
            name="래더(다단계매도)", ma_period=ma_period, rule="ladder",
            ma_sell_tiers=ma_tiers_in, dd_sell_tiers=dd_tiers_in,
            reentry_ma=(reentry_ma or None), reentry_dd=reentry_dd,
            execute_next_open=exec_next,
        ))
    return out


def current_params() -> dict:
    """재실행용 위젯 값 스냅샷(session_state에서 key로 수집)."""
    keys = ["w_assets", "w_pf", "w_period", "w_cstart", "w_cend", "w_mode", "w_principal",
            "w_monthly", "w_wd", "w_wamt", "w_wpct", "w_ma", "w_exec", "w_strats", "w_partial",
            "w_ladder_on", "w_re_ma", "w_re_dd", "w_drip", "w_stax", "w_bfee", "w_mmf", "w_rf"]
    for k in asset_keys:
        keys += [f"w_wt_{k}", f"div_{k}"]
    for n in range(1, 4):
        keys += [f"w_mt{n}_d", f"w_mt{n}_p", f"w_dd{n}_t", f"w_dd{n}_f"]
    out = {}
    for k in keys:
        if k in st.session_state:
            v = st.session_state[k]
            out[k] = str(v) if isinstance(v, date) else v
    # date 문자열 복원용 표식
    return out


# ───────────────────────── 실행(계산만) ─────────────────────────
# 결과를 session_state["_sim"]에 보관 → 이후 렌더/저장은 run 버튼과 무관하게 동작(버튼-인-버튼 방지).
if run:
    if not asset_keys or (not strat_sel and not ladder_on):
        st.warning("자산과 전략(또는 래더)을 하나 이상 선택하세요.")
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

        if portfolio_mode:
            wt = {k: weights.get(k, 0.0) for k in prices}
            if sum(wt.values()) <= 0:
                st.error("포트폴리오 비중 합이 0입니다.")
                st.stop()
            wsum = sum(wt.values())
            wt = {k: v / wsum for k, v in wt.items()}
            results = {("포트폴리오", sp.name): engine.run_portfolio(prices, wt, sp, fp, cp_by)
                       for sp in strat_list}
            pf_desc = "포트폴리오(" + ", ".join(f"{data.ASSETS[k].label.split(' ')[0]} {wt[k]*100:.0f}%"
                                                for k in prices) + ")"
        else:
            results = engine.run_multi(prices, strat_list, fp, cp_by)
            pf_desc = ""

        rows = []
        for (tk, sname), res in results.items():
            if res.equity is None or len(res.equity) == 0:
                continue
            m = metrics.summarize(res, rf)
            lbl = data.ASSETS[tk].label if tk in data.ASSETS else "포트폴리오(가중)"
            rows.append({"자산": lbl, "전략": sname, "_tk": tk, "_res": res, **m})
        df = pd.DataFrame(rows)
        if df.empty:
            st.error("유효한 결과가 없습니다.")
            st.stop()

        # 3줄 자동요약
        best_ret = df.loc[df["total_return"].idxmax()]
        low_mdd = df.loc[df["mdd"].idxmax()]
        best_sharpe = df.loc[df["sharpe"].idxmax()]
        auto_content = (("포트폴리오 " + pf_desc.split("(", 1)[-1].rstrip(")") if portfolio_mode
                         else f"자산 {len(prices)}종")
                        + f" · 전략 {len(strat_list)}개 · 기간 {period_lbl} · "
                        + ("적립(DCA)" if mode == "dca" else "원금거치")
                        + ("" if withdraw == "none" else f" · 인출 {wd_label}"))
        auto_result = (f"최고수익 {best_ret['자산']}·{best_ret['전략']} {best_ret['total_return']*100:.1f}% "
                       f"(MDD {best_ret['mdd']*100:.1f}%), 최저낙폭 {low_mdd['자산']}·{low_mdd['전략']} "
                       f"MDD {low_mdd['mdd']*100:.1f}%, 최고Sharpe {best_sharpe['전략']} {best_sharpe['sharpe']:.2f}")
        bench = df[df["전략"].str.contains("벤치마크")]
        timing = df[~df["전략"].str.contains("벤치마크")]
        if not bench.empty and not timing.empty:
            b = bench["total_return"].mean() * 100
            t = timing["total_return"].mean() * 100
            auto_insight = (("타이밍/래더가 평균적으로 벤치마크 상회" if t > b else "벤치마크가 평균 상회")
                            + f" (평균 총수익 타이밍 {t:.1f}% vs 벤치 {b:.1f}%); "
                            + "위기구간에선 다단계 매도가 하방(MDD) 방어에 유리한 경향.")
        else:
            auto_insight = "전략 간 수익-낙폭 트레이드오프를 비교해 목표 위험선호에 맞는 조합을 선택."

    st.session_state["_sim"] = {
        "results": results, "df": df, "period_lbl": period_lbl,
        "portfolio_mode": portfolio_mode, "pf_desc": pf_desc,
        "withdraw": withdraw, "wd_label": wd_label, "mode": mode,
        "prices_n": len(prices), "strat_n": len(strat_list),
        "auto": (auto_content, auto_result, auto_insight),
        "params": current_params(),
        "default_title": f"{'PF ' if portfolio_mode else ''}{period_lbl} · {'/'.join(strat_sel)[:30]}",
    }
    st.session_state.pop("_recall_id", None)
    st.session_state.pop("_saved_msg", None)


# ───────────────────────── 렌더 & 저장(run 무관) ─────────────────────────
sim = st.session_state.get("_sim")
if sim:
    results = sim["results"]
    df = sim["df"]
    period_lbl = sim["period_lbl"]
    portfolio_mode = sim["portfolio_mode"]
    wd = sim["withdraw"]

    st.success(f"완료 · 기간: {period_lbl} · "
               + (sim["pf_desc"] if portfolio_mode else f"자산 {sim['prices_n']}")
               + f" × 전략 {sim['strat_n']}")

    t1, t2, t3, t4, t5, t6 = st.tabs(["자산곡선", "위험-수익", "비교표", "인출경로", "시사점", "💾 저장"])

    with t1:
        fig = go.Figure()
        for (tk, sname), res in results.items():
            if res.equity is None or len(res.equity) == 0:
                continue
            nm = data.ASSETS[tk].label if tk in data.ASSETS else "포트폴리오"
            fig.add_trace(go.Scatter(x=res.equity.index, y=res.equity.values,
                                     name=f"{nm} · {sname}", mode="lines"))
        fig.update_layout(height=560, hovermode="x unified", template="plotly_dark",
                          paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                          yaxis_title="평가액(로컬통화 정규화)", legend=dict(orientation="h"))
        st.plotly_chart(fig, use_container_width=True)
        st.caption(FOOTNOTE)

    with t2:
        yopt = st.radio("Y축", ["총수익률", "XIRR"], horizontal=True)
        ycol = "total_return" if yopt == "총수익률" else "xirr"
        fig = go.Figure()
        for sname in df["전략"].unique():
            sub = df[df["전략"] == sname]
            fig.add_trace(go.Scatter(
                x=(-sub["mdd"] * 100), y=sub[ycol] * 100, mode="markers+text",
                text=sub["자산"], textposition="top center", name=sname, marker=dict(size=13)))
        fig.update_layout(height=560, template="plotly_dark",
                          paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                          xaxis_title="MDD (%, 클수록 위험)", yaxis_title=f"{yopt} (%)")
        st.plotly_chart(fig, use_container_width=True)
        st.caption(FOOTNOTE)

    with t3:
        show = df[["자산", "전략", "final_value", "total_withdrawn", "total_return", "xirr", "twr_ann",
                   "volatility", "sharpe", "sortino", "mdd", "trades"]].copy()
        show.columns = ["자산", "전략", "최종평가액", "총인출금액", "총수익률", "XIRR", "TWR(연)",
                        "연변동성", "Sharpe", "Sortino", "MDD", "매매횟수"]
        for c in ["총수익률", "XIRR", "TWR(연)", "연변동성", "MDD"]:
            show[c] = (show[c] * 100).round(1).astype(str) + "%"
        for c in ["Sharpe", "Sortino"]:
            show[c] = show[c].round(2)
        for c in ["최종평가액", "총인출금액"]:
            show[c] = show[c].round(0).map(lambda v: f"{v:,.0f}")
        st.dataframe(show, use_container_width=True, hide_index=True)
        st.caption(FOOTNOTE)
        show_records = show.to_dict("records")

    with t4:
        if wd == "none":
            st.info("인출 모드가 아닙니다. 사이드바에서 '정액/정률' 인출을 선택하세요.")
        else:
            for (tk, sname), res in results.items():
                if res.equity is None or len(res.equity) == 0:
                    continue
                nm = data.ASSETS[tk].label if tk in data.ASSETS else "포트폴리오"
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
                                  title=f"{nm} · {sname} (부족 {res.shortfall_count}회)")
                st.plotly_chart(fig, use_container_width=True)
            st.caption(FOOTNOTE)

    ac, ar, ai = sim["auto"]
    with t5:
        st.markdown(f"- 📊 {ai}")
        st.caption(FOOTNOTE)

    with t6:
        st.markdown("**이 시뮬레이션을 3줄 요약·메모와 함께 저장합니다.**")
        nm_in = st.text_input("제목", value=sim["default_title"], key="save_title")
        c_in = st.text_area("① 내용(설정)", value=ac, height=70, key="save_c")
        r_in = st.text_area("② 결과", value=ar, height=70, key="save_r")
        i_in = st.text_area("③ 시사점", value=ai, height=70, key="save_i")
        note_in = st.text_area("📝 내 메모(노트) — 자유롭게 작성",
                               value="", height=120, key="save_note",
                               placeholder="예) 이 조건은 하락장 방어는 좋은데 상승장 수익을 많이 놓친다. "
                                           "다음엔 재진입 dd를 3%로 좁혀서 비교해볼 것.")
        if st.button("💾 저장하기", key="save_btn"):
            p = store.save_run(
                name=nm_in, params=sim.get("params", {}),
                summary3={"내용": c_in, "결과": r_in, "시사점": i_in},
                metrics_rows=show_records, period_label=period_lbl,
                note=note_in,
            )
            st.session_state["_saved_msg"] = f"저장 완료 → {p.name}"
            st.rerun()
        if st.session_state.get("_saved_msg"):
            st.success(st.session_state["_saved_msg"]
                       + "  ·  사이드바 '📚 저장된 시뮬레이션'에서 불러올 수 있습니다.")

else:
    rid = st.session_state.get("_recall_id")
    rec = store.load_run(rid) if rid else None
    if rec:
        st.info(f"📚 불러온 기록: **{rec['name']}**  ·  {rec['saved_at'][:16]}  "
                "— 사이드바 설정이 이 기록으로 채워졌습니다. **백테스트 실행**을 눌러 재현하세요.")
        s3 = rec.get("summary3", {})
        st.markdown(f"""
> **① 내용** — {s3.get('내용','')}
> **② 결과** — {s3.get('결과','')}
> **③ 시사점** — {s3.get('시사점','')}
""")
        if rec.get("note"):
            st.markdown("**📝 내 메모**")
            st.info(rec["note"])
        if rec.get("metrics_rows"):
            st.markdown("**저장 당시 비교표**")
            st.dataframe(pd.DataFrame(rec["metrics_rows"]), use_container_width=True, hide_index=True)
    else:
        st.info("사이드바에서 파라미터를 설정하고 **백테스트 실행**을 누르세요. "
                "포트폴리오 결합·다단계 매도 래더·기록 저장/불러오기를 지원합니다.")
