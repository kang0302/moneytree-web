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
    yahoo: Optional[str] = None      # Yahoo Finance 심볼 (EODHD/FMP 미커버 거래소, 예: 도쿄 2638.T)


# 자산 레지스트리 (리포에서 검증된 접미사 재사용 — symbol-search 생략)
ASSETS: dict[str, Asset] = {
    "SPY":    Asset("SPY", "SPY (S&P500 ETF)", "US", "USD", "SPY.US", "SPY"),
    "DIA":    Asset("DIA", "DIA (다우 ETF)", "US", "USD", "DIA.US", "DIA"),
    "QQQ":    Asset("QQQ", "QQQ (나스닥100 ETF)", "US", "USD", "QQQ.US", "QQQ"),
    "IWM":    Asset("IWM", "IWM (러셀2000 ETF)", "US", "USD", "IWM.US", "IWM"),
    "KODEX200": Asset("KODEX200", "KODEX 200 (069500)", "KR", "KRW", "069500.KO", None, "069500.KQ"),
    "KOSDAQ150": Asset("KOSDAQ150", "KODEX 코스닥150 (229200)", "KR", "KRW", "229200.KQ", None, "229200.KO"),
    "KODEX200_TWCC": Asset("KODEX200_TWCC", "KODEX 200타겟위클리커버드콜 (498400)", "KR", "KRW",
                           "498400.KO", None, "498400.KQ"),
    "KODEX_USSEMI": Asset("KODEX_USSEMI", "KODEX 미국반도체 (390390)", "KR", "KRW",
                          "390390.KO", None, "390390.KQ"),
    "ACE_USSEMI_TDCC": Asset("ACE_USSEMI_TDCC", "ACE 미국반도체데일리타겟커버드콜(합성) (480040)", "KR", "KRW",
                             "480040.KO", None, "480040.KQ"),
    "EWJ":    Asset("EWJ", "EWJ (일본 MSCI ETF)", "US", "USD", "EWJ.US", "EWJ"),
    "MCHI":   Asset("MCHI", "MCHI (중국 MSCI ETF)", "US", "USD", "MCHI.US", "MCHI"),
    "EEM":    Asset("EEM", "EEM (신흥국 MSCI ETF)", "US", "USD", "EEM.US", "EEM"),
    "VTI":    Asset("VTI", "VTI (미국 전체주식 ETF)", "US", "USD", "VTI.US", "VTI"),
    "VT":     Asset("VT", "VT (전세계 주식 ETF)", "US", "USD", "VT.US", "VT"),
    "VGK":    Asset("VGK", "VGK (유럽 FTSE ETF)", "US", "USD", "VGK.US", "VGK"),
    "TIGER_ESTOXX50": Asset("TIGER_ESTOXX50", "TIGER 유로스탁스50(합성 H) (195930)", "KR", "KRW",
                            "195930.KO", None, "195930.KQ"),
    "KODEX_WTI": Asset("KODEX_WTI", "KODEX WTI원유선물(H) (261220)", "KR", "KRW",
                       "261220.KO", None, "261220.KQ"),
    "GLD":    Asset("GLD", "GLD (금 ETF)", "US", "USD", "GLD.US", "GLD"),
    "SLV":    Asset("SLV", "SLV (은 ETF)", "US", "USD", "SLV.US", "SLV"),
    "COPX":   Asset("COPX", "COPX (구리광산 ETF)", "US", "USD", "COPX.US", "COPX"),
    "IBIT":   Asset("IBIT", "IBIT (비트코인 현물 ETF)", "US", "USD", "IBIT.US", "IBIT"),
    "UUP":    Asset("UUP", "UUP (달러인덱스 ETF)", "US", "USD", "UUP.US", "UUP"),
    "BIL":    Asset("BIL", "BIL (1-3M 미국채 ETF)", "US", "USD", "BIL.US", "BIL"),
    "IEF":    Asset("IEF", "IEF (7-10Y 미국채 ETF)", "US", "USD", "IEF.US", "IEF"),
    "TLT":    Asset("TLT", "TLT (20Y+ 미국채 ETF)", "US", "USD", "TLT.US", "TLT"),
    "TIGER_2NDBAT_TOP10": Asset("TIGER_2NDBAT_TOP10", "TIGER 2차전지TOP10 (364980)", "KR", "KRW",
                                "364980.KO", None, "364980.KQ"),
    "KODEX_ROBOT": Asset("KODEX_ROBOT", "KODEX 로봇액티브 (445290)", "KR", "KRW",
                         "445290.KO", None, "445290.KQ"),
    "KODEX_SEMI": Asset("KODEX_SEMI", "KODEX 반도체 (091160)", "KR", "KRW",
                        "091160.KO", None, "091160.KQ"),
    "PLUS_KDEF": Asset("PLUS_KDEF", "PLUS K방산 (449450)", "KR", "KRW",
                       "449450.KO", None, "449450.KQ"),
    "HANARO_NUCLEAR": Asset("HANARO_NUCLEAR", "HANARO 원자력iSelect (434730)", "KR", "KRW",
                            "434730.KO", None, "434730.KQ"),
    "SOL_SHIP_TOP3": Asset("SOL_SHIP_TOP3", "SOL 조선TOP3플러스 (466920)", "KR", "KRW",
                           "466920.KO", None, "466920.KQ"),
    "HANARO_KBEAUTY": Asset("HANARO_KBEAUTY", "HANARO K-뷰티 (479850)", "KR", "KRW",
                            "479850.KO", None, "479850.KQ"),
    "HANARO_KFOOD": Asset("HANARO_KFOOD", "HANARO Fn K-푸드 (438900)", "KR", "KRW",
                          "438900.KO", None, "438900.KQ"),
    "ACE_KPOP": Asset("ACE_KPOP", "ACE KPOP포커스 (475050)", "KR", "KRW",
                      "475050.KO", None, "475050.KQ"),
    "TIGER_KGAME": Asset("TIGER_KGAME", "TIGER K게임 (300610)", "KR", "KRW",
                         "300610.KO", None, "300610.KQ"),
    "TIGER_INTERNET_TOP10": Asset("TIGER_INTERNET_TOP10", "TIGER 인터넷TOP10 (365000)", "KR", "KRW",
                                  "365000.KO", None, "365000.KQ"),
    "KODEX_WEBTOON_DRAMA": Asset("KODEX_WEBTOON_DRAMA", "KODEX Fn웹툰&드라마 (395150)", "KR", "KRW",
                                 "395150.KO", None, "395150.KQ"),
    "TIGER_USPHLX_SEMI": Asset("TIGER_USPHLX_SEMI", "TIGER 미국필라델피아반도체나스닥 (381180)", "KR", "KRW",
                               "381180.KO", None, "381180.KQ"),
    "TIGER_CN_SEMI": Asset("TIGER_CN_SEMI", "TIGER 차이나반도체FACTSET (396520)", "KR", "KRW",
                           "396520.KO", None, "396520.KQ"),
    "TIGER_JP_SEMI": Asset("TIGER_JP_SEMI", "TIGER 일본반도체FACTSET (465660)", "KR", "KRW",
                           "465660.KO", None, "465660.KQ"),
    "TIGER_CN_HUMANOID": Asset("TIGER_CN_HUMANOID", "TIGER 차이나휴머노이드로봇 (0053L0)", "KR", "KRW",
                               "0053L0.KO", None),
    "PLUS_GLOBAL_HUMANOID": Asset("PLUS_GLOBAL_HUMANOID", "PLUS 글로벌휴머노이드로봇액티브 (0035T0)", "KR", "KRW",
                                  "0035T0.KO", None),
    "GLOBALX_JP_ROBOTAI": Asset("GLOBALX_JP_ROBOTAI", "Global X 일본 로보틱스&AI (2638.T)", "JP", "JPY",
                                "", None, None, "2638.T"),
    "TIGER_KR_HUMANOID": Asset("TIGER_KR_HUMANOID", "TIGER 코리아휴머노이드로봇산업 (0148J0)", "KR", "KRW",
                               "0148J0.KO", None),
    "RISE_US_HUMANOID": Asset("RISE_US_HUMANOID", "RISE 미국휴머노이드로봇 (0036R0)", "KR", "KRW",
                              "0036R0.KO", None),
    "ITA": Asset("ITA", "ITA (미국 항공우주·방산 ETF)", "US", "USD", "ITA.US", "ITA"),
    "IGV": Asset("IGV", "IGV (미국 소프트웨어 ETF)", "US", "USD", "IGV.US", "IGV"),
    "SKYY": Asset("SKYY", "SKYY (클라우드컴퓨팅 ETF)", "US", "USD", "SKYY.US", "SKYY"),
    "QTUM": Asset("QTUM", "QTUM (양자컴퓨팅·AI ETF)", "US", "USD", "QTUM.US", "QTUM"),
    "BUG": Asset("BUG", "BUG (사이버보안 ETF)", "US", "USD", "BUG.US", "BUG"),
    "HANARO_EU_DEFENSE": Asset("HANARO_EU_DEFENSE", "HANARO 유럽방산 (0082F0)", "KR", "KRW",
                               "0082F0.KO", None),
    "PLUS_GLOBAL_DEFENSE": Asset("PLUS_GLOBAL_DEFENSE", "PLUS 글로벌방산 (496770)", "KR", "KRW",
                                 "496770.KO", None),
    "TIGER_RENEWABLE": Asset("TIGER_RENEWABLE", "TIGER Fn신재생에너지 (377990)", "KR", "KRW",
                             "377990.KO", None),
    "SOL_CHINA_SOLAR": Asset("SOL_CHINA_SOLAR", "SOL 차이나태양광CSI(합성) (413220)", "KR", "KRW",
                             "413220.KO", None),
    "ICLN": Asset("ICLN", "ICLN (글로벌 클린에너지 ETF)", "US", "USD", "ICLN.US", "ICLN"),
    "TIGER_CN_BIOTECH": Asset("TIGER_CN_BIOTECH", "TIGER 차이나바이오테크SOLACTIVE (371470)", "KR", "KRW",
                              "371470.KO", None),
    "TIGER_HEALTHCARE": Asset("TIGER_HEALTHCARE", "TIGER 헬스케어 (143860)", "KR", "KRW",
                              "143860.KO", None),
    "XLV": Asset("XLV", "XLV (미국 헬스케어 ETF)", "US", "USD", "XLV.US", "XLV"),
    "ISHARES_EU_HEALTH": Asset("ISHARES_EU_HEALTH", "iShares STOXX Europe 600 Health Care (EXV4)", "DE", "EUR",
                               "EXV4.XETRA", None),
    "TIGER_GLOBAL_HEALTH": Asset("TIGER_GLOBAL_HEALTH", "TIGER S&P 글로벌헬스케어(합성) (248270)", "KR", "KRW",
                                 "248270.KO", None),
    "KODEX_AUTO": Asset("KODEX_AUTO", "KODEX 자동차 (091180)", "KR", "KRW", "091180.KO", None),
    "KODEX_ENERGYCHEM": Asset("KODEX_ENERGYCHEM", "KODEX 200에너지화학 (117460)", "KR", "KRW", "117460.KO", None),
    "KODEX_TRANSPORT": Asset("KODEX_TRANSPORT", "KODEX 운송 (140710)", "KR", "KRW", "140710.KO", None),
    "KODEX_CONSTRUCTION": Asset("KODEX_CONSTRUCTION", "KODEX 건설 (117700)", "KR", "KRW", "117700.KO", None),
    "SOXX":   Asset("SOXX", "SOXX (필라델피아반도체 ETF)", "US", "USD", "SOXX.US", "SOXX"),
    "LIT":    Asset("LIT", "LIT (리튬·배터리 ETF)", "US", "USD", "LIT.US", "LIT"),
    "ROBO":   Asset("ROBO", "ROBO (로봇·자동화 ETF)", "US", "USD", "ROBO.US", "ROBO"),
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


def _fetch_yahoo(symbol: str, start: date, end: date) -> pd.DataFrame:
    """Yahoo Finance 차트 API — EODHD/FMP가 커버 못하는 거래소(도쿄 등)용."""
    import time
    p1 = int(time.mktime(start.timetuple()))
    p2 = int(time.mktime(end.timetuple())) + 86400
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"period1": p1, "period2": p2, "interval": "1d"}
    resp = requests.get(url, params=params, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    data = resp.json()
    try:
        res = data["chart"]["result"][0]
        ts = res["timestamp"]
        closes = res["indicators"]["quote"][0]["close"]
    except (KeyError, TypeError, IndexError):
        return pd.DataFrame(columns=["close"]).astype(float)
    rows = []
    for t, c in zip(ts, closes):
        if c is None:
            continue
        rows.append({"date": datetime.fromtimestamp(t).date().isoformat(), "close": c})
    return _to_df(rows)


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
    if a.eodhd:
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
    # 4) Yahoo fallback (도쿄 등 EODHD/FMP 미커버 거래소)
    if a.yahoo:
        try:
            df = _fetch_yahoo(a.yahoo, start, end)
            if not df.empty:
                return df
        except Exception as e:
            errs.append(f"Yahoo {a.yahoo}: {e}")
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
