# sim/metrics.py
# 성과 지표 — XIRR(money-weighted), TWR(time-weighted), Sharpe/Sortino, MDD, 변동성,
#            인출 고갈시점/부족횟수. engine.BacktestResult 기반.
from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

TRADING_DAYS = 252


def xirr(cashflows: list[tuple], guess: float = 0.1) -> float:
    """
    money-weighted 수익률(연율). cashflows: [(date, amount)] 투자=−, 회수=+.
    이분법으로 NPV=0 해를 찾음.
    """
    if not cashflows or len(cashflows) < 2:
        return float("nan")
    t0 = min(pd.Timestamp(d) for d, _ in cashflows)
    yrs = [(pd.Timestamp(d) - t0).days / 365.0 for d, _ in cashflows]
    amts = [float(a) for _, a in cashflows]

    def npv(rate: float) -> float:
        return sum(a / (1.0 + rate) ** y for a, y in zip(amts, yrs))

    lo, hi = -0.9999, 10.0
    flo, fhi = npv(lo), npv(hi)
    if not np.isfinite(flo) or not np.isfinite(fhi) or flo * fhi > 0:
        return float("nan")
    for _ in range(200):
        mid = (lo + hi) / 2.0
        fmid = npv(mid)
        if abs(fmid) < 1e-7:
            return mid
        if flo * fmid < 0:
            hi = mid
        else:
            lo, flo = mid, fmid
    return (lo + hi) / 2.0


def twr_daily_returns(equity: pd.Series, ext_flow: pd.Series) -> pd.Series:
    """
    외부 현금흐름을 제외한 일별 수익률.
    r_t = equity_t / (equity_{t-1} + ext_flow_t) − 1   (유입을 기초에 반영)
    """
    eq = equity.values.astype(float)
    fl = ext_flow.reindex(equity.index).fillna(0.0).values.astype(float)
    r = np.full(len(eq), np.nan)
    for t in range(1, len(eq)):
        base = eq[t - 1] + fl[t]
        if base > 0:
            r[t] = eq[t] / base - 1.0
    return pd.Series(r, index=equity.index).dropna()


def twr(daily_r: pd.Series) -> float:
    """누적 TWR(총수익률)."""
    if daily_r.empty:
        return float("nan")
    return float(np.prod(1.0 + daily_r.values) - 1.0)


def twr_annualized(daily_r: pd.Series) -> float:
    if daily_r.empty:
        return float("nan")
    total = np.prod(1.0 + daily_r.values)
    n = len(daily_r)
    if n <= 0 or total <= 0:
        return float("nan")
    return float(total ** (TRADING_DAYS / n) - 1.0)


def volatility(daily_r: pd.Series) -> float:
    if len(daily_r) < 2:
        return float("nan")
    return float(daily_r.std(ddof=1) * np.sqrt(TRADING_DAYS))


def sharpe(daily_r: pd.Series, rf: float = 0.0) -> float:
    if len(daily_r) < 2:
        return float("nan")
    sd = daily_r.std(ddof=1)
    if sd == 0:
        return float("nan")
    rf_d = rf / TRADING_DAYS
    return float((daily_r.mean() - rf_d) / sd * np.sqrt(TRADING_DAYS))


def sortino(daily_r: pd.Series, rf: float = 0.0) -> float:
    if len(daily_r) < 2:
        return float("nan")
    rf_d = rf / TRADING_DAYS
    excess = daily_r - rf_d
    downside = excess[excess < 0]
    if len(downside) == 0:
        return float("inf")
    dd = np.sqrt(np.mean(downside.values ** 2))
    if dd == 0:
        return float("nan")
    return float(excess.mean() / dd * np.sqrt(TRADING_DAYS))


def mdd(equity: pd.Series) -> float:
    """최대낙폭(음수)."""
    if equity.empty:
        return float("nan")
    roll = equity.cummax()
    dd = equity / roll - 1.0
    return float(dd.min())


def summarize(result, rf: float = 0.0) -> dict:
    """BacktestResult → 지표 dict."""
    eq = result.equity
    daily_r = twr_daily_returns(eq, result.ext_flow)
    final_value = float(eq.iloc[-1]) if len(eq) else float("nan")
    invested = result.total_contrib if result.total_contrib > 0 else float("nan")
    total_return = (final_value / invested - 1.0) if invested and invested > 0 else float("nan")
    return {
        "final_value": final_value,
        "total_contrib": result.total_contrib,
        "total_withdrawn": result.total_withdrawn,
        "total_return": total_return,          # 총납입 대비
        "xirr": xirr(result.cashflows),
        "twr": twr(daily_r),
        "twr_ann": twr_annualized(daily_r),
        "volatility": volatility(daily_r),
        "sharpe": sharpe(daily_r, rf),
        "sortino": sortino(daily_r, rf),
        "mdd": mdd(eq),
        "depletion_date": result.depletion_date,
        "shortfall_count": result.shortfall_count,
        "trades": result.trades,
    }
