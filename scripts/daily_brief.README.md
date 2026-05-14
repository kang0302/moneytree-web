# Daily Brief Generator

매일 아침 4개 소스를 자동으로 fetch → SSOT 테마 인덱스 컨텍스트 주입 → Anthropic API로
**테마 매핑 분석** MD 생성 → repo commit.

## 소스
1. **Bloomberg Technology** (YouTube) — 최신 영상 transcript
2. **CNBC's Closing Bell** (YouTube) — 최신 영상 transcript
3. **한국경제 증권** (RSS) — top 10 articles
4. **한경 컨센서스** (HTML) — latest 5 analyst reports

## 출력
- `public/data/daily_briefs/YYYY-MM-DD.md` (KST 기준 날짜)
- 구조:
  1. 오늘의 핫 테마 TOP 5 (T_xxx 매핑 + 신호 강도 + 트리거 소스 + 근거)
  2. 신규 테마 후보 (SSOT 인덱스에 없는 시그널)
  3. 기존 테마 보강 후보 (T_xxx에 추가할 자산/관계)
  4. 소스별 핵심 요약 (Bloomberg / CNBC / 한경 10건 / 컨센서스 5건)

## 스케줄
- **GitHub Actions cron**: `0 0 * * *` UTC = 매일 KST 09:00
- US 마감 + Closing Bell + Bloomberg Tech 방영 후, 한국 시장 개장 전 시점

## 셋업 (1회만)

### 1. Anthropic API key를 GitHub Secrets에 등록
```
GitHub repo → Settings → Secrets and variables → Actions → New repository secret
Name:  ANTHROPIC_API_KEY
Value: sk-ant-...
```

### 2. 의존성 설치 (로컬 테스트용)
```bash
npm install
```

`package.json`의 devDependencies에 이미 다음이 포함되어 있음:
- `@anthropic-ai/sdk`
- `cheerio`
- `fast-xml-parser`
- `youtube-transcript`

CI는 `npm install --no-save`로 워크플로우에서 직접 설치 (production 번들에 영향 없음).

## 로컬 실행
```bash
ANTHROPIC_API_KEY=sk-ant-... npm run brief:daily
```
출력은 `public/data/daily_briefs/YYYY-MM-DD.md` 에 생성됨.

## 수동 트리거 (GitHub UI)
```
GitHub repo → Actions → "Daily Brief Generator" → Run workflow
```

## 모델
`claude-sonnet-4-6` (Studio V2와 동일)

## 주의
- YouTube transcript는 자동 자막 의존 — 공개 자막이 없는 영상은 title/description만 활용
- 한경 컨센서스는 HTML 파싱이라 사이트 레이아웃 변경 시 selector 재조정 필요
- 토큰 폭주 방지: transcript 30,000자 hard limit
