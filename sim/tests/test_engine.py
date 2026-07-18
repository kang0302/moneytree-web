# sim/tests/test_engine.py
# 엔진 sanity 테스트 — 인출0·거래비용0·배당0 → buy&hold 정확 일치, DCA 전략 무효화 → 벤치마크 일치,
#                    인출 고갈 추적.
import os
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import StrategyParams, FlowParams, CostParams, run_backtest  # noqa: E402
import metrics  # noqa: E402


def _prices(n=800, start="2020-01-01", drift=0.0004, seed=7, kind="gbm"):
    idx = pd.bdate_range(start=start, periods=n)
    if kind == "flat":
        return pd.Series(100.0, index=idx)
    if kind == "up":  # 단조 증가 → 항상 MA 위
        return pd.Series(100.0 * (1.0 + drift) ** np.arange(n), index=idx)
    rng = np.random.default_rng(seed)
    rets = rng.normal(drift, 0.01, n)
    return pd.Series(100.0 * np.cumprod(1.0 + rets), index=idx)


def test_buyhold_exact_when_no_costs():
    """인출0·비용0·배당0·타이밍없음(benchmark) → 단순 buy&hold와 정확 일치."""
    px = _prices(kind="gbm")
    res = run_backtest(
        px,
        StrategyParams(rule="benchmark", ma_period=200),
        FlowParams(mode="lump", principal=10_000.0, withdraw="none"),
        CostParams(div_yield=0.0, sell_tax=0.0, buy_fee=0.0, mmf_rate=0.0),
    )
    exp = 10_000.0 * px / px.iloc[0]
    assert np.allclose(res.equity.values, exp.values, rtol=1e-9, atol=1e-6)
    assert res.trades == 1  # 최초 매수 1회뿐, 이후 무거래


def test_dca_benchmark_equals_sum_of_grown_contributions():
    """DCA benchmark → 각 납입액이 납입일 가격으로 매수돼 최종가로 성장한 합."""
    px = _prices(kind="gbm")
    c = 1_000.0
    res = run_backtest(
        px,
        StrategyParams(rule="benchmark"),
        FlowParams(mode="dca", monthly_contrib=c, withdraw="none"),
        CostParams(sell_tax=0.0, buy_fee=0.0, div_yield=0.0, mmf_rate=0.0),
    )
    # 첫 거래일(월별)에 납입
    from engine import _first_trading_days
    days = sorted(_first_trading_days(px.index))
    exp = sum(c * px.iloc[-1] / px.loc[d] for d in days)
    assert res.equity.iloc[-1] == pytest.approx(exp, rel=1e-9)
    assert res.total_contrib == pytest.approx(c * len(days))


def test_strategy_nullified_equals_benchmark_when_always_riskon():
    """가격이 항상 MA 위(단조 증가)면 sell_all/stop_buy가 benchmark와 동일 경로."""
    px = _prices(kind="up", drift=0.0006)
    fp = FlowParams(mode="dca", monthly_contrib=1_000.0, withdraw="none")
    cp = CostParams(sell_tax=0.0, buy_fee=0.0, div_yield=0.0, mmf_rate=0.0)
    bench = run_backtest(px, StrategyParams(rule="benchmark", ma_period=60), fp, cp)
    sell = run_backtest(px, StrategyParams(rule="sell_all", ma_period=60), fp, cp)
    stop = run_backtest(px, StrategyParams(rule="stop_buy", ma_period=60), fp, cp)
    assert np.allclose(bench.equity.values, sell.equity.values, rtol=1e-9, atol=1e-6)
    assert np.allclose(bench.equity.values, stop.equity.values, rtol=1e-9, atol=1e-6)


def test_withdrawal_depletion_tracked():
    """고정 인출이 잔고를 초과하면 고갈시점·부족횟수 기록."""
    px = _prices(kind="flat")
    res = run_backtest(
        px,
        StrategyParams(rule="benchmark"),
        FlowParams(mode="lump", principal=1_000.0, withdraw="fixed", withdraw_amt=500.0),
        CostParams(sell_tax=0.0, buy_fee=0.0, div_yield=0.0, mmf_rate=0.0),
    )
    assert res.depletion_date is not None
    assert res.shortfall_count >= 1
    assert res.equity.iloc[-1] == pytest.approx(0.0, abs=1e-6)


def test_total_contrib_identical_across_strategies():
    """전략이 달라도 총납입은 동일(현금흐름 스케줄이 FlowParams로 고정)."""
    px = _prices(kind="gbm")
    fp = FlowParams(mode="dca", monthly_contrib=500.0)
    cp = CostParams()
    a = run_backtest(px, StrategyParams(rule="benchmark"), fp, cp)
    b = run_backtest(px, StrategyParams(rule="sell_all", ma_period=120), fp, cp)
    assert a.total_contrib == pytest.approx(b.total_contrib)


def test_mmf_interest_grows_idle_cash():
    """단조 하락 구간 → sell_all이 끝까지 현금 보유. MMF>0이면 최종 평가액이 더 큼."""
    idx = pd.bdate_range("2020-01-01", periods=400)
    px = pd.Series(100.0 * np.linspace(1.0, 0.6, 400), index=idx)  # 끝까지 하락 → 현금 유지
    sp = StrategyParams(rule="sell_all", ma_period=50)
    fp = FlowParams(mode="lump", principal=10_000.0)
    with_mmf = run_backtest(px, sp, fp, CostParams(sell_tax=0.0, buy_fee=0.0, mmf_rate=0.05))
    no_mmf = run_backtest(px, sp, fp, CostParams(sell_tax=0.0, buy_fee=0.0, mmf_rate=0.0))
    assert with_mmf.cash.iloc[-1] > 0                      # 끝까지 현금 보유
    assert with_mmf.equity.iloc[-1] > no_mmf.equity.iloc[-1]  # 이자 누적분만큼 큼


def test_metrics_sane():
    px = _prices(kind="gbm")
    res = run_backtest(px, StrategyParams(rule="benchmark"),
                       FlowParams(mode="lump", principal=10_000.0),
                       CostParams(sell_tax=0.0, buy_fee=0.0))
    m = metrics.summarize(res, rf=0.0)
    assert np.isfinite(m["mdd"]) and m["mdd"] <= 0.0
    assert np.isfinite(m["twr"])
    assert m["final_value"] > 0
