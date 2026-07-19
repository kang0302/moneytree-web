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
    rule: Literal["benchmark", "sell_all", "stop_buy", "partial_sell", "dd_breaker", "ladder"] = "benchmark"
    partial_sell_pct: float = 0.0          # 일부매도 X% (0~1)
    dd_A: Optional[float] = None           # 전고점(252일) 대비 -A% 트리거 (%, 예: 20)
    dd_B: float = 0.0                      # 트리거 시 보유분 B% 매도 (%, 예: 50)
    dd_reload_C: Optional[float] = None    # -C%까지 회복 시 재장전 (%, 예: 10)
    execute_next_open: bool = False        # close-only 데이터 → 1일 지연 실행 프록시
    # ── 다단계 일부매도 래더(rule="ladder") ──
    # MA 이탈 티어: 종가가 각 MA(일수) 아래로 이탈 시 '현재 보유분'의 frac(0~1)을 매도(각 티어 1회, 재진입 시 재장전).
    ma_sell_tiers: list = field(default_factory=list)   # [(ma_days:int, frac:float), ...]
    # 전고점(252일) 대비 하락 티어: -pct% 도달 시 현재 보유분의 frac 매도(각 티어 1회).
    dd_sell_tiers: list = field(default_factory=list)    # [(dd_pct:float, frac:float), ...]
    reentry_ma: Optional[int] = None       # 재진입 이평(일). 종가≥이 MA & dd 회복 시 현금 전액 재투자·티어 재장전
    reentry_dd: float = 5.0                # 재진입 dd 임계(전고점 대비 -reentry_dd% 이내 회복)


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

    # 래더용 사전계산
    ma_tier_series = [(int(p), float(f), prices.rolling(int(p)).mean()) for (p, f) in sp.ma_sell_tiers]
    reentry_ma_series = prices.rolling(int(sp.reentry_ma)).mean() if sp.reentry_ma else None
    tier_fired_ma = [False] * len(ma_tier_series)
    tier_fired_dd = [False] * len(sp.dd_sell_tiers)
    derisked = False

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
        elif sp.rule == "ladder":
            dd_now = price / high252.iloc[i] - 1.0
            # 재진입: 종가 ≥ 재진입MA & dd 회복 → 현금 전액 재투자 + 티어 재장전
            if derisked:
                reentry_ok = dd_now >= -sp.reentry_dd / 100.0
                if reentry_ma_series is not None:
                    m = reentry_ma_series.iloc[i]
                    reentry_ok = reentry_ok and (pd.isna(m) or price >= m)
                if reentry_ok:
                    invest_all(price)
                    derisked = False
                    tier_fired_ma = [False] * len(ma_tier_series)
                    tier_fired_dd = [False] * len(sp.dd_sell_tiers)
            # 건강 구간: 유휴 현금(적립분 등) 투자
            if not derisked:
                invest_all(price)
            # MA 이탈 티어 매도(각 1회)
            for t, (_p, frac, mser) in enumerate(ma_tier_series):
                mv = mser.iloc[i]
                if not tier_fired_ma[t] and pd.notna(mv) and price < mv:
                    sell_fraction(price, frac)
                    tier_fired_ma[t] = True
                    derisked = True
            # 전고점 하락 티어 매도(각 1회)
            for t, (thr, frac) in enumerate(sp.dd_sell_tiers):
                if not tier_fired_dd[t] and dd_now <= -float(thr) / 100.0:
                    sell_fraction(price, float(frac))
                    tier_fired_dd[t] = True
                    derisked = True

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


def run_portfolio(
    prices: dict[str, pd.Series],
    weights: dict[str, float],
    sp: StrategyParams,
    fp: FlowParams,
    cp_by_ticker: dict[str, CostParams],
) -> BacktestResult:
    """
    자산배분 포트폴리오 백테스트: 각 자산 슬리브를 비중(weight)만큼의 원금·적립·인출로 독립 실행한 뒤
    공통 거래일에 정렬해 합산한다(동일 전략 적용). weights 합은 호출 전에 1.0로 정규화 권장.
      - 각 슬리브 flow = 전체 flow × weight (정률 인출률은 슬리브별 동일 적용 → 합산 시 전체 정률과 근사)
      - equity/ext_flow 합산, cashflows 병합(XIRR), 납입·인출·매매 합산.
    """
    # 공통 거래일(교집합)로 가격 정렬 → 모든 슬리브가 동일 index·flow 타이밍
    common: Optional[pd.DatetimeIndex] = None
    for px in prices.values():
        idx = px.dropna().index
        common = idx if common is None else common.intersection(idx)
    if common is None or len(common) == 0:
        empty = pd.Series(dtype=float)
        return BacktestResult(empty, empty, empty, empty, [])
    common = common.sort_values()

    eq_sum: Optional[pd.Series] = None
    flow_sum: Optional[pd.Series] = None
    cashflows: list = []
    total_contrib = total_withdrawn = 0.0
    trades = shortfall = 0
    depletion: Optional[pd.Timestamp] = None

    for k, px in prices.items():
        w = float(weights.get(k, 0.0))
        if w <= 0:
            continue
        pxa = px.reindex(common).dropna()
        if len(pxa) == 0:
            continue
        fp_k = FlowParams(
            mode=fp.mode, principal=fp.principal * w, monthly_contrib=fp.monthly_contrib * w,
            withdraw=fp.withdraw, withdraw_amt=fp.withdraw_amt * w, withdraw_pct=fp.withdraw_pct,
        )
        res = run_backtest(pxa, sp, fp_k, cp_by_ticker.get(k, CostParams()))
        eqk = res.equity.reindex(common).ffill().fillna(0.0)
        flk = res.ext_flow.reindex(common).fillna(0.0)
        eq_sum = eqk if eq_sum is None else eq_sum.add(eqk, fill_value=0.0)
        flow_sum = flk if flow_sum is None else flow_sum.add(flk, fill_value=0.0)
        cashflows += res.cashflows
        total_contrib += res.total_contrib
        total_withdrawn += res.total_withdrawn
        trades += res.trades
        shortfall += res.shortfall_count
        if res.depletion_date is not None:
            depletion = res.depletion_date if depletion is None else min(depletion, res.depletion_date)

    if eq_sum is None:
        empty = pd.Series(dtype=float)
        return BacktestResult(empty, empty, empty, empty, [])

    zero = pd.Series(0.0, index=common)
    return BacktestResult(
        equity=eq_sum, cash=zero, shares=zero, ext_flow=flow_sum, cashflows=cashflows,
        total_contrib=total_contrib, total_withdrawn=total_withdrawn,
        depletion_date=depletion, shortfall_count=shortfall, trades=trades,
    )
