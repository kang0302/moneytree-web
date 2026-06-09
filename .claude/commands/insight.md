---
description: 테마/자산 ID에 대한 투자 인사이트를 리서치하고 import_MT/data/insights/{ID}.md 로 저장 + push
---

# /insight — 투자 인사이트 자동 생성

사용자 입력: `$ARGUMENTS` (예: `T_286` 또는 `T_286 SoCAMM 지연 시 메모리 영향 중심으로`)

## 실행 순서

1. **입력 파싱**: 첫 토큰이 `T_xxx` 또는 `A_xxx` 형식인지 확인. 나머지는 추가 컨텍스트.

2. **ID 존재 확인** (필수):
   - `T_xxx` → `import_MT/data/theme/{ID}.json` 존재 확인
   - `A_xxx` → `import_MT/data/ssot/asset_ssot.csv` 에서 해당 row 확인
   - 없으면 사용자에게 보고하고 중단

3. **컨텍스트 수집**:
   - 테마: theme JSON (nodes·edges 핵심) + briefing 파일 (있으면) + 최근 git log 5개
   - 자산: SSOT row + 해당 자산이 포함된 테마 리스트 + 최근 가격 metrics (있으면)
   - 사용자 추가 컨텍스트도 포함

4. **인사이트 작성**:
   - 다음 frontmatter 필수:
     ```yaml
     ---
     title: 한 줄 요약 제목
     updated_at: YYYY-MM-DD  # 오늘 날짜 (절대값)
     tags: [관련, 키워드, 3-5개]
     ---
     ```
   - 본문 구조 권장:
     - `## 핵심 포인트` — 3-5 항목
     - `## 상세 분석` — 본문
     - `## 결론` — 매수/관망/매도 명확히
   - 길이: 300-800자 (간결하되 actionable)

5. **저장**: `import_MT/data/insights/{ID}.md` 에 Write

6. **git push** (import_MT 만):
   ```bash
   cd import_MT
   git pull --rebase origin main
   git add data/insights/{ID}.md
   git commit -m "docs(insights): {ID} {title} 작성"
   git push origin main
   ```

7. **사용자 보고**:
   - 파일 경로 + commit hash
   - 5분 후 `/graph/{theme_id}` 페이지에서 NEW 배지 + 카드 확인 안내
   - 자산 인사이트면 해당 자산이 포함된 모든 테마에 자동 표시됨을 안내

## 주의 사항

- **mirror sync 불필요** — moneytree-web 미러 안 함 (GitHub raw 직접 fetch)
- **fix sync 불필요** — auto-merge-main-to-fix workflow 트리거 안 함
- **search rebuild 불필요** — insights 는 search index 에 포함 안 됨
- `updated_at` 절대 오늘 날짜 (사용자가 "어제·내일" 같은 상대 표현해도 절대 날짜로 변환)
- frontmatter 누락 → NEW 배지 안 뜨고 표시는 됨. 작성 시 반드시 포함.

## 예시 호출

- `/insight T_286` → T_286 일반 분석
- `/insight A_217` → SK하이닉스 (A_217) 분석
- `/insight T_080 GPU당 CPU 수요 증가 시나리오 중심으로 분석` → 컨텍스트 가이드 포함

## 메모리 참조

- [[insights-workflow]] — 전체 시스템 정의
- [[briefing-note-principles]] — 브리핑과 인사이트는 별개. 인사이트는 자유 형식.
