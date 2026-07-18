# sim/engine.py
# 순수 백테스트 엔진 — 가격 시계열 + 파라미터 → 일별 equity 시계열. UI 의존 없음.
#
# 데이터 규칙(확정): raw close만 사용(split 보정·adjusted 미사용), 배당은 모델 배당율,
#   FX 제외(로컬통화 정규화). 일별 처리 순서는 아래 run_backtest 참고.
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

import numpy as np
import pandas as pd

TRADING_DAYS = 252


@dataclass
class StrategyParams:
    name: str = "benchmark"
    ma_period: int = 200
    rule: Literal["benchmark", "sell_all", "stop_buy", "partial_sell", "dd_breaker"] = "benchmark"
    partial_sell_pct: float = 0.0          # 일부매도 X% (0~1)
    dd_A: Optional[float] = None           # 전고점(252일) 대비 -A% 트리거 (%, 예: 20)
    dd_B: float = 0.0                      # 트리거 시 보유분 B% 매도 (%, 예: 50)
    dd_reload_C: Optional[float] = None    # -C%까지 회복 시 재장전 (%, 예: 10)
    execute_next_open: bool = False        # close-only 데이터 → 1일 지연 실행 프록시


@dataclass
class FlowParams:
    mode: Literal["lump", "dca"] = "lump"
    principal: float = 10_000.0            # lump 원금
    monthly_contrib: float = 0.0           # dca 월 적립액
    withdraw: Literal["none", "fixed", "pct"] = "none"
    withdraw_amt: float = 0.0              # 정액(월)
    withdraw_pct: float = 0.0              # 정률(월 잔고 비율, 0~1)


@dataclass
class CostParams:
    div_yield: float = 0.0                 # 연배당율(0~1)
    drip: bool = True                      # True=재투자, False=현금수취
    sell_tax: float = 0.002                # 매도 거래세(0~1)
    buy_fee: float = 0.0                   # 매수 수수료(0~1)
    mmf_rate: float = 0.0                  # 현금 MMF 연이자(0~1)


@dataclass
class BacktestResult:
    equity: pd.Series                      # 일별 평가액
    cash: pd.Series
    shares: pd.Series
    ext_flow: pd.Series                    # 일별 순 외부현금흐름(+납입 −인출)
    cashflows: list                        # [(Timestamp, amount)] XIRR용 (투자=−, 회수=+)
    total_contrib: float = 0.0
    total_withdrawn: float = 0.0
    depletion_date: Optional[pd.Timestamp] = None
    shortfall_count: int = 0
    trades: int = 0


def _first_trading_days(idx: pd.DatetimeIndex) -> set:
    """각 (연,월)의 첫 거래일 Timestamp 집합."""
    ser = pd.Series(range(len(idx)), index=idx)
    firsts = ser.groupby([idx.year, idx.month]).idxmin()
    return {pd.Timestamp(t) for t in firsts.values}


def run_backtest(
    prices: pd.Series,
    sp: StrategyParams,
    fp: FlowParams,
    cp: CostParams,
) -> BacktestResult:
    """
    일별 처리 순서(정확히 이 순서):
      1) 배당 반영(DRIP면 shares↑, 현금수취면 cash↑)
      2) 현금 MMF 이자
      3) 적립일 납입 / 인출일 인출(현금 먼저, 부족분 주식 매도−거래세, 고갈 추적)
      4) 시그널 리밸런싱(종가 ≥ MA → risk-on)
      5) DD 브레이커 판정/실행
      6) equity 기록
    매도에만 거래세, 매수는 buy_fee. DD 브레이커가 hold 중이면 4)의 재매수는 보류.
    """
    prices = prices.dropna().astype(float)
    idx = prices.index
    n = len(idx)
    if n == 0:
        empty = pd.Series(dtype=float)
        return BacktestResult(empty, empty, empty, empty, [])

    ma = prices.rolling(sp.ma_period).mean()
    high252 = prices.rolling(TRADING_DAYS, min_periods=1).max()

    # 시그널: 종가 ≥ MA (MA 미형성 구간은 risk-on 기본)
    risk_on = (prices >= ma) | ma.isna()
    if sp.execute_next_open:
        sig = risk_on.shift(1)
        sig.iloc[0] = risk_on.iloc[0]
        sig = sig.astype(bool)
    else:
        sig = risk_on.astype(bool)

    contrib_days = {idx[0]} if fp.mode == "lump" else _first_trading_days(idx)
    contrib_amt = fp.principal if fp.mode == "lump" else fp.monthly_contrib
    withdraw_days = (_first_trading_days(idx) - {idx[0]}) if fp.withdraw != "none" else set()

    d_div = (1.0 + cp.div_yield) ** (1.0 / TRADING_DAYS) - 1.0
    d_mmf = (1.0 + cp.mmf_rate) ** (1.0 / TRADING_DAYS) - 1.0

    shares = 0.0
    cash = 0.0
    dd_triggered = False
    prev_sig: Optional[bool] = None

    eq_arr = np.empty(n)
    cash_arr = np.empty(n)
    sh_arr = np.empty(n)
    flow_arr = np.zeros(n)

    cashflows: list = []
    total_contrib = 0.0
    total_withdrawn = 0.0
    depletion_date: Optional[pd.Timestamp] = None
    shortfall_count = 0
    trades = 0

    def invest_all(price: float):
        nonlocal shares, cash, trades
        if cash > 0:
            shares += cash * (1.0 - cp.buy_fee) / price
            cash = 0.0
            trades += 1

    def sell_all(price: float):
        nonlocal shares, cash, trades
        if shares > 0:
            cash += shares * price * (1.0 - cp.sell_tax)
            shares = 0.0
            trades += 1

    def sell_fraction(price: float, frac: float):
        nonlocal shares, cash, trades
        if shares > 0 and frac > 0:
            qty = shares * frac
            cash += qty * price * (1.0 - cp.sell_tax)
            shares -= qty
            trades += 1

    for i in range(n):
        dt = idx[i]
        price = prices.iloc[i]
        ext = 0.0

        # 1) 배당
        if shares > 0 and d_div != 0.0:
            if cp.drip:
                shares *= (1.0 + d_div)
            else:
                cash += shares * price * d_div

        # 2) MMF 이자
        if cash > 0 and d_mmf != 0.0:
            cash *= (1.0 + d_mmf)

        # 3) 납입 / 인출
        if dt in contrib_days and contrib_amt > 0:
            cash += contrib_amt
            total_contrib += contrib_amt
            ext += contrib_amt
            cashflows.append((dt, -contrib_amt))

        if dt in withdraw_days:
            equity_now = shares * price + cash
            amt = fp.withdraw_amt if fp.withdraw == "fixed" else equity_now * fp.withdraw_pct
            if amt > 0:
                if cash >= amt:
                    cash -= amt
                    funded = amt
                else:
                    funded = cash  # 남은 현금 전부
                    need = amt - cash
                    cash = 0.0
                    gross_needed = need / (1.0 - cp.sell_tax)  # 세후 need 확보에 필요한 매도액
                    val = shares * price
                    if val >= gross_needed:
                        shares -= gross_needed / price
                        funded += need
                    else:
                        funded += val * (1.0 - cp.sell_tax)
                        shares = 0.0
                        shortfall_count += 1
                        if depletion_date is None:
                            depletion_date = dt
                total_withdrawn += funded
                ext -= funded
                cashflows.append((dt, funded))

        # 4) 시그널 리밸런싱 (DD hold 중이면 재매수 보류)
        s = bool(sig.iloc[i])
        if sp.rule in ("benchmark", "dd_breaker"):
            if not dd_triggered:
                invest_all(price)
        elif sp.rule == "sell_all":
            if s:
                if not dd_triggered:
                    invest_all(price)
            else:
                sell_all(price)
        elif sp.rule == "stop_buy":
            if s and not dd_triggered:
                invest_all(price)
        elif sp.rule == "partial_sell":
            if prev_sig is True and not s:          # risk-off 이벤트
                sell_fraction(price, sp.partial_sell_pct)
            if s and not dd_triggered:
                invest_all(price)

        # 5) DD 브레이커 (이평선룰과 독립적으로 발동)
        if sp.dd_A is not None:
            dd = price / high252.iloc[i] - 1.0
            if not dd_triggered and dd <= -sp.dd_A / 100.0:
                sell_fraction(price, sp.dd_B / 100.0)
                dd_triggered = True
            elif dd_triggered and sp.dd_reload_C is not None and dd >= -sp.dd_reload_C / 100.0:
                invest_all(price)
                dd_triggered = False

        # 6) equity 기록
        eq_arr[i] = shares * price + cash
        cash_arr[i] = cash
        sh_arr[i] = shares
        flow_arr[i] = ext
        prev_sig = s

    # 최종 청산 현금흐름(XIRR)
    if eq_arr[n - 1] != 0:
        cashflows.append((idx[n - 1], float(eq_arr[n - 1])))

    return BacktestResult(
        equity=pd.Series(eq_arr, index=idx),
        cash=pd.Series(cash_arr, index=idx),
        shares=pd.Series(sh_arr, index=idx),
        ext_flow=pd.Series(flow_arr, index=idx),
        cashflows=cashflows,
        total_contrib=total_contrib,
        total_withdrawn=total_withdrawn,
        depletion_date=depletion_date,
        shortfall_count=shortfall_count,
        trades=trades,
    )


def run_multi(
    prices: dict[str, pd.Series],
    strategies: list[StrategyParams],
    fp: FlowParams,
    cp_by_ticker: dict[str, CostParams],
) -> dict[tuple[str, str], BacktestResult]:
    """자산 × 전략 매트릭스 백테스트."""
    out: dict[tuple[str, str], BacktestResult] = {}
    for ticker, px in prices.items():
        cp = cp_by_ticker.get(ticker, CostParams())
        for sp in strategies:
            out[(ticker, sp.name)] = run_backtest(px, sp, fp, cp)
    return out
