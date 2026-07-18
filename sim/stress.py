# sim/stress.py
# 과거 위기 프리셋 + 합성(결합) 위기 생성.
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

# 과거 위기 구간 프리셋 (start, end)
PRESETS: dict[str, tuple[date, date]] = {
    "닷컴버블 2000–2005": (date(2000, 1, 1), date(2005, 12, 31)),
    "GFC 2007–2012": (date(2007, 1, 1), date(2012, 12, 31)),
}


def recent_5y(today: date | None = None) -> tuple[date, date]:
    end = today or date.today()
    start = end - timedelta(days=365 * 5)
    return start, end


def stitch_returns(series_list: list[pd.Series]) -> pd.Series:
    """
    여러 가격 구간을 '수익률 이어붙이기'로 하나의 연속 정규화 시계열로 결합(합성결합).
    각 구간의 일별 수익률을 연쇄 → 시작 100 기준 연속 곡선. 인덱스는 영업일 재생성.
    """
    series_list = [s.dropna().astype(float) for s in series_list if s is not None and len(s) > 1]
    if not series_list:
        return pd.Series(dtype=float)
    rets = []
    for s in series_list:
        rets.append(s.pct_change().dropna().values)
    all_rets = np.concatenate(rets) if rets else np.array([])
    prices = 100.0 * np.cumprod(np.concatenate([[1.0], 1.0 + all_rets]))
    idx = pd.bdate_range("2000-01-03", periods=len(prices))
    return pd.Series(prices, index=idx)


def synthetic_shock(
    n_days: int = 756,
    pre_drift: float = 0.0004,
    crash_pct: float = 0.45,
    crash_len: int = 60,
    recover_len: int = 250,
    seed: int = 11,
) -> pd.Series:
    """
    합성 위기 가격 경로: 완만 상승 → crash_len일 동안 −crash_pct 급락 → recover_len일 회복.
    노이즈 포함. 시작 100 기준.
    """
    rng = np.random.default_rng(seed)
    pre = max(0, n_days - crash_len - recover_len)
    r = np.concatenate([
        rng.normal(pre_drift, 0.008, pre),
        rng.normal(np.log(1 - crash_pct) / max(1, crash_len), 0.02, crash_len),
        rng.normal(-np.log(1 - crash_pct) / max(1, recover_len) * 0.9, 0.012, recover_len),
    ])
    prices = 100.0 * np.cumprod(1.0 + r)
    idx = pd.bdate_range("2000-01-03", periods=len(prices))
    return pd.Series(prices, index=idx)
