# 투자퍼포먼스 시뮬레이션 (ETF 이평선 타이밍 + 인출/적립 백테스트)

로컬 Streamlit 앱. KNOW_VEST 홈의 **📈 투자퍼포먼스 시뮬레이션** 버튼(`http://localhost:8501`)이 이 앱을 엽니다.

## 구조
| 파일 | 책임 |
|---|---|
| `data.py` | EODHD(주력)/FMP(보조) raw close fetch + parquet 캐시 + 티커매핑 |
| `engine.py` | 순수 백테스트 엔진(UI 무의존) |
| `metrics.py` | XIRR·TWR·Sharpe·Sortino·MDD·변동성·인출고갈 |
| `stress.py` | 위기 프리셋(닷컴/GFC) + 합성결합/합성위기 |
| `app.py` | Streamlit UI |
| `tests/` | pytest sanity |

## 데이터 규칙(확정)
- **raw close만** 사용 (adjusted·split 보정 없음)
- 배당 = 사용자 입력 **모델 배당율**(DRIP/현금수취)
- **FX 완전 제외** · 각 자산 로컬통화 정규화 · 순수 전략 성과 비교

## 실행
```bash
cd sim
python -m pip install -r requirements.txt
# 키: sim/.env 또는 리포 루트 .env.local (EODHD_API_KEY, FMP_API_KEY) 재사용
python data.py            # 5개 자산 심볼·데이터 검증
python -m pytest tests/   # 엔진 sanity
streamlit run app.py      # → http://localhost:8501
```

## 자산
SPY·DIA·QQQ (EODHD `.US` / FMP), KODEX200=069500 (`.KO`), 코스닥150=229200 (`.KQ`)

## 검증
- 엔진: 무비용 DCA가 폐형식 `Σ 납입×(최종가/납입일가)`와 소수점 일치
- 체크포인트(SPY DCA, 2021-03~2026-03, 월$1k, div1%·tax0.2%·mmf3%) → 약 $88.7k (raw close 기준)
