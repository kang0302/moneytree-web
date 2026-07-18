# sim/data.py
# EODHD(주력)/FMP(보조)에서 일별 raw close fetch + 로컬 parquet 캐시 + 티커 매핑.
# 데이터 규칙(확정): raw(무조정) close만 사용. split 보정·adjusted·배당조정 없음. FX 제외.
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import pandas as pd
import requests

try:
    from dotenv import load_dotenv
    # sim/.env 우선, 없으면 리포 루트 .env.local(KNOW_VEST 키 재사용)
    _here = Path(__file__).resolve().parent
    for _p in (_here / ".env", _here.parent / ".env.local"):
        if _p.exists():
            load_dotenv(_p, override=False)
except Exception:
    pass

EODHD_KEY = os.environ.get("EODHD_API_KEY", "")
FMP_KEY = os.environ.get("FMP_API_KEY", "")

CACHE_DIR = Path(__file__).resolve().parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)


@dataclass(frozen=True)
class Asset:
    key: str            # 내부 키(표시·캐시 파일명)
    label: str          # 표시명
    country: str        # US / KR
    currency: str       # USD / KRW
    eodhd: str          # EODHD 심볼 (예: SPY.US, 069500.KO)
    fmp: Optional[str]  # FMP 심볼 (US만; KR은 None)
    eodhd_alt: Optional[str] = None  # 접미사 fallback (KR .KO↔.KQ)


# 자산 레지스트리 (리포에서 검증된 접미사 재사용 — symbol-search 생략)
ASSETS: dict[str, Asset] = {
    "SPY":    Asset("SPY", "SPY (S&P500 ETF)", "US", "USD", "SPY.US", "SPY"),
    "DIA":    Asset("DIA", "DIA (다우 ETF)", "US", "USD", "DIA.US", "DIA"),
    "QQQ":    Asset("QQQ", "QQQ (나스닥100 ETF)", "US", "USD", "QQQ.US", "QQQ"),
    "KODEX200": Asset("KODEX200", "KODEX 200 (069500)", "KR", "KRW", "069500.KO", None, "069500.KQ"),
    "KOSDAQ150": Asset("KOSDAQ150", "KODEX 코스닥150 (229200)", "KR", "KRW", "229200.KQ", None, "229200.KO"),
}


def _to_df(rows: list[dict]) -> pd.DataFrame:
    """[{date, close}, ...] → DataFrame(index=date, close). raw close만."""
    recs = []
    for r in rows:
        d = r.get("date")
        c = r.get("close")
        if d is None or c is None:
            continue
        try:
            ts = pd.Timestamp(str(d)[:10])
            cv = float(c)
        except (ValueError, TypeError):
            continue
        recs.append((ts, cv))
    if not recs:
        return pd.DataFrame(columns=["close"]).astype(float)
    df = pd.DataFrame(recs, columns=["date", "close"]).drop_duplicates("date")
    return df.set_index("date").sort_index()


def _fetch_eodhd(symbol: str, start: date, end: date) -> pd.DataFrame:
    if not EODHD_KEY:
        raise RuntimeError("EODHD_API_KEY 미설정")
    url = f"https://eodhd.com/api/eod/{symbol}"
    params = {
        "api_token": EODHD_KEY,
        "fmt": "json",
        "period": "d",
        "from": start.isoformat(),
        "to": end.isoformat(),
        "order": "a",
    }
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        return pd.DataFrame(columns=["close"]).astype(float)
    return _to_df(data)  # EODHD 'close' = raw(무조정) 종가


def _fetch_fmp(symbol: str, start: date, end: date) -> pd.DataFrame:
    if not FMP_KEY:
        raise RuntimeError("FMP_API_KEY 미설정")
    url = "https://financialmodelingprep.com/stable/historical-price-eod/full"
    params = {"symbol": symbol, "apikey": FMP_KEY, "from": start.isoformat(), "to": end.isoformat()}
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    # stable API: flat list [{symbol,date,...,close,...}]  /  v3: {"historical":[...]}
    if isinstance(data, dict):
        data = data.get("historical", [])
    if not isinstance(data, list):
        return pd.DataFrame(columns=["close"]).astype(float)
    return _to_df(data)


def _cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.parquet"


def _load_cache(key: str) -> Optional[pd.DataFrame]:
    p = _cache_path(key)
    if not p.exists():
        return None
    try:
        return pd.read_parquet(p)
    except Exception:
        return None


def _save_cache(key: str, df: pd.DataFrame) -> None:
    try:
        df.to_parquet(_cache_path(key))
    except Exception:
        pass


def _fetch_asset(a: Asset, start: date, end: date) -> pd.DataFrame:
    """EODHD 우선 → (US) FMP fallback → (KR) 접미사 alt fallback."""
    errs = []
    # 1) EODHD 주력
    try:
        df = _fetch_eodhd(a.eodhd, start, end)
        if not df.empty:
            return df
    except Exception as e:
        errs.append(f"EODHD {a.eodhd}: {e}")
    # 2) KR 접미사 fallback (.KO↔.KQ)
    if a.eodhd_alt:
        try:
            df = _fetch_eodhd(a.eodhd_alt, start, end)
            if not df.empty:
                return df
        except Exception as e:
            errs.append(f"EODHD {a.eodhd_alt}: {e}")
    # 3) US FMP fallback
    if a.fmp:
        try:
            df = _fetch_fmp(a.fmp, start, end)
            if not df.empty:
                return df
        except Exception as e:
            errs.append(f"FMP {a.fmp}: {e}")
    raise RuntimeError(f"{a.key} fetch 실패: " + " | ".join(errs))


def get_prices(
    key: str,
    start: date,
    end: date,
    force_refresh: bool = False,
) -> pd.Series:
    """
    자산 raw close 시계열(pd.Series, index=date). 캐시 우선, 부족·강제 시 재fetch.
    """
    if key not in ASSETS:
        raise KeyError(f"미등록 자산 키: {key}")
    a = ASSETS[key]
    start = pd.Timestamp(start).date() if not isinstance(start, date) else start
    end = pd.Timestamp(end).date() if not isinstance(end, date) else end

    cache = None if force_refresh else _load_cache(key)
    if cache is not None and not cache.empty:
        cmin, cmax = cache.index.min().date(), cache.index.max().date()
        if cmin <= start and cmax >= end:
            sl = cache.loc[str(start):str(end), "close"]
            if not sl.empty:
                return sl.astype(float)

    fetched = _fetch_asset(a, start, end)
    # 캐시 병합(union)
    if cache is not None and not cache.empty:
        merged = pd.concat([cache, fetched])
        merged = merged[~merged.index.duplicated(keep="last")].sort_index()
    else:
        merged = fetched
    _save_cache(key, merged)
    return merged.loc[str(start):str(end), "close"].astype(float)


def get_many(keys: list[str], start: date, end: date, force_refresh: bool = False) -> dict[str, pd.Series]:
    return {k: get_prices(k, start, end, force_refresh) for k in keys}


def verify_assets(sample_start: date = date(2024, 1, 1), sample_end: date = date(2024, 3, 1)) -> None:
    """5개 자산이 실제로 데이터를 반환하는지 소량 검증(콘솔 출력)."""
    print(f"EODHD_KEY set: {bool(EODHD_KEY)} | FMP_KEY set: {bool(FMP_KEY)}")
    for key, a in ASSETS.items():
        try:
            s = get_prices(key, sample_start, sample_end, force_refresh=True)
            if s.empty:
                print(f"  ❌ {key:10s} {a.label}: 데이터 없음")
            else:
                print(f"  ✅ {key:10s} {a.label}: {len(s)}일 "
                      f"[{s.index.min().date()}~{s.index.max().date()}] "
                      f"first={s.iloc[0]:.2f} last={s.iloc[-1]:.2f}")
        except Exception as e:
            print(f"  ❌ {key:10s} {a.label}: {e}")


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    verify_assets()
