# Moneytree Web — Status

## 📅 마지막 업데이트
2026-06-17

## ✅ 완료된 작업 (이번 세션, 시간 역순)
- **T_448 신규 테마 "궤도컴퓨트/우주데이터센터" (2026-06-17)** — 자산 10·BF 10·MACRO 7·CHARACTER 4 (노드 32 / 엣지 41). **자산** 기존 6 (A_118 로켓랩·A_055 엔비디아·A_050 알파벳·A_426 플래닛랩스·A_425 AST스페이스모바일·A_539 OCI홀딩스) + **신규 4** A_2351 레드와이어(RDW)·A_2352 스타클라우드(비)·A_2353 액시엄스페이스(비)·A_2354 NTT스페이스컴퍼스(9432). **신규 MACRO 4** M_1049 AI전력병목·M_1050 발사비용하락·M_1051 우주정책규제·M_1052 비중국공급망에너지안보. **신규 BF 6** BF_576 재사용발사체·BF_577 위성플랫폼제조·BF_578 우주용전력태양광어레이·BF_579 열관리방열·BF_580 광통신링크레이저·BF_581 우주태양광소재. **신규 CHARACTER 4** C_760~C_763 (THEME→CHR HAS_TRAIT). **관계**: 10 THEMED_AS(ASSET) + 4 HAS_TRAIT + 7 IMPACTS + 10 THEMED_AS(BF) + 10 명시 relations(INVESTS·PARTNERS·OPERATES). 브리핑카드 10행(전부 링크형식) + 이벤트DB 7행 포함. theme.csv 는 stale auto-build 라 skip, index.json canonical 갱신. import_MT main push + FIX SYNC(auto-merge-main-to-fix) success → fix 브랜치 반영 확인.
- **투자 인사이트 자동화 Level 1+2 (2026-06-09)** — Claude 리서치 → 저장 → push 전체 자동화 구축.
  - **Level 1**: `.claude/commands/insight.md` 슬래시 명령 (`/insight T_286 [컨텍스트]`). Claude Code 로컬에서 컨텍스트 수집 → frontmatter 포함 markdown 작성 → import_MT push. moneytree-web `6bcce19`.
  - **Level 2**: `import_MT/.github/workflows/generate-insight.yml` workflow_dispatch + `scripts/generate_insight.py` (urllib only, no deps). inputs: target_id / extra_context / model (sonnet/opus/haiku). Anthropic API 직접 호출. 필요 secret: `ANTHROPIC_API_KEY`. import_MT `2a0ac87f`.
  - **사용법**: 로컬 → `/insight T_xxx`. 원격(모바일·외출) → GitHub Actions UI 에서 workflow 수동 실행.
  - 메모리 `project_insights_workflow.md` 에 자동화 섹션 추가.
- **T_276 신규 테마 "K반도체전공정증착장비" (2026-05-30)** — 주성엔지니어링 중심. **3 THEMED_AS** (장비 3사: A_908 주성·A_907 원익IPS·A_945 유진테크) + **4 자산 2궤도** (테마 직접 미연결, A_088 삼성전자·A_217 SK하이닉스·A_1571 CXMT·A_952 어플라이드머티리얼즈) + **17 엣지** (3 THEMED_AS + 5 IMPACTS + 3 OPERATES + 3 SUPPLIES + 1 COMPETES + 2 HAS_TRAIT). **신규 자산 0** (주성 A_908 이미 SSOT 등록). **신규 BF 3**: BF_494 반도체증착장비ALD_ALG·BF_495 태양광전공정장비·BF_496 디스플레이전공정장비. **신규 CHARACTER 2**: C_223 국내증착기술원조·C_224 글로벌점유율4위. **2궤도 패턴 (신규 시도)**: 주성→SK하이닉스·CXMT SUPPLIES / 원익IPS→삼성전자 SUPPLIES / 주성→AMAT COMPETES — 모두 테마 직접 미연결. import_MT 1c3f979 + moneytree-web 2e43e27.
- **T_275 신규 테마 "K-반도체IP설계및디자인하우스" (2026-05-30)** — 7 자산 THEMED_AS (IP licensing 3: A_1737 칩스앤미디어·A_1738 오픈엣지테크놀로지·A_1739 퀄리타스반도체 / Design house 4: A_1740 에이디테크놀로지·A_1359 가온칩스·A_1360 에이직랜드·A_1741 코아시아) + 2 BF OPERATES (BF_017 표준아키텍처 ← IP 3 / BF_043 FPGA·커스텀로직 ← Design house 4) + 5 macro IMPACTS (M_030 미국대중국수출규제·M_141 중국반도체자립·M_051 AI수요확대·M_161 AI반도체수요증가·M_105 반도체). **신규 자산 5** (가온칩스/에이직랜드는 사용자 신규 표기였으나 이미 SSOT 등록 → 기존 ID 재사용). import_MT c648c28 + moneytree-web a6886ab.
- **T_217 K-팹리스반도체 보강 (2026-05-30)** — 5 KOSDAQ 자산 + 5 BF 추가, 모두 신규. **자산** A_1732 라온텍(418420)·A_1733 자람테크놀로지(389020)·A_1734 픽셀플러스(087600)·A_1735 티엘아이(062860)·A_1736 아이앤씨(052860). **BF** BF_489 마이크로디스플레이·BF_490 네트워크PON_SoC·BF_491 CMOS이미지센서·BF_492 디스플레이전력관리·BF_493 방송통신SoC. 엣지 10 (5 THEMED_AS + 5 OPERATES 1:1). import_MT fb3c047 + moneytree-web d55c3a5.
- **T_265 보강: KKR INVESTS 삼성SDS (2026-05-30)** — A_547 KKR (기존 SSOT) 노드 추가 + INVESTS edge (A_547→A_791 삼성SDS). **2궤도 구조** (테마 직접 미연결, 1궤도 자산 삼성SDS 에만 연결). 신규 자산 0개. import_MT dfb20f1 + moneytree-web 67896ea.
- **T_274 신규 테마 "글로벌클라우드DBMS" (2026-05-29)** — 6 자산 THEMED_AS (기존 4: A_211 아마존·A_895 오라클·A_040 몽고DB·A_274 스노우플레이크 + 신규 2: A_1730 카우치베이스(비)·A_1731 테라데이터) + **3 IMPACTS** (M_224 클라우드확산·M_055 AI확산·M_280 비정형데이터확산 신규) + **6 HAS_TRAIT** (C_217~C_222 자산별 차별화 포지셔닝). 사용자 명세 정정: A_AMZN placeholder → A_211 / M_034·M_053 라벨 오기 (실제 LLM확산·데이터센터) → 의도대로 M_224·M_280 사용. **(비) 접미사 컨벤션 ✓ 확인** (SSOT PRIVATE 82개 중 79개 동일 패턴). import_MT f4406d5 + moneytree-web 96fe1b2.
- **T_273 신규 테마 "SK그룹주" Phase 1 (2026-05-29)** — 12 자산 THEMED_AS (기존 7: A_214 SKT·A_217 SK하이닉스·A_949 SK스퀘어·A_901 SKC·A_103 SK이노베이션·A_1027 SKIET·A_1328 SK가스 + 신규 5: A_1725 SK바이오사이언스·A_1726 SK바이오팜·A_1727 SK(주)·A_1728 SK디스커버리·A_1729 SK에코플랜트(비)) + **5 OPERATES** (SKC→BF_319 반도체유리기판·SKIET→BF_447 분리막·SK이노베이션→BF_064 CDMO·SK바이오사이언스→BF_488 백신**신규**·SK바이오팜→BF_063 신약개발플랫폼) + **4 IMPACTS** (M_055 AI확산·M_161 AI반도체수요증가·M_020 EV보급확대·M_185 수소친환경전환). **사용자 명세 정정**: SKIET (A_1027)·SK가스 (A_1328) 은 신규 표기였으나 이미 SSOT 등록 / "M_161=EV확대" 라벨 오기 (실제 AI반도체수요증가 — 의미상 SK그룹 적합) / KIWOOM-M SK그룹펀드 EXPOSED_TO 는 실재 ETF 확인 필요로 Phase 1 제외. **Phase 2 보류**: ① 4 기존 테마 보강 (T_133·T_093·T_168·T_184 — [추론·그래프외] 태그 다수) + ② SK바이오헬스케어밸류체인 (T_274 후보). import_MT fde0d02 + moneytree-web 2ea02ae.
- **T_272 신규 테마 "미국은행주" (2026-05-28)** — 11 자산 THEMED_AS (대형은행 5: JPM·BAC·C·USB·WFC / 투자은행 2: GS·MS / 지방중소형 4: TFC·KEY·PNC·HBAN) + **EXPOSED_TO 1** (A_632 XLF Financial Select Sector SPDR → T_272) + **OPERATES 11** (자산→BF 버킷 3종) + **M_072 금리인상 IMPACTS 1**. **신규 자산 7**: A_1718 US뱅코프(USB)·A_1719 웰스파고은행(WFC)·A_1720 트루이스트파이낸셜(TFC)·A_1721 키코프(KEY)·A_1722 PNC파이낸셜서비스(PNC)·A_1723 헌팅턴뱅크셰어스(HBAN)·A_1724 모건스탠리(MS). **신규 BF 3**: BF_485 대형은행·BF_486 투자은행·BF_487 지방중소형은행. **사용자 명세 정정**: XLE(에너지 ETF, A_503)→XLF(금융 ETF, A_632) 자명한 오기로 변경 / "T_067⟷자산 confidence 수정" section 은 T_272 typo + 데이터모델상 confidence 필드 없어 무시. import_MT 248edaf + moneytree-web 786ed7d.
- **T_271 신규 테마 "글로벌모빌리티플랫폼" (2026-05-28)** — 7 자산 (모두 기존 ID 재사용: A_1321 우버·A_1715 리프트·A_1450 디디추싱·A_369 그랩·A_368 고투·A_1716 올라(비)·A_1717 카카오모빌리티(비)) + 4 macro IMPACTS (M_246 자율주행확산·M_277 지역정부규제리스크·M_278 레거시모빌리티와갈등 신규·M_279 수입원다각화 신규). **신규 자산 0개** (사용자 명세상 5 신규였으나 모두 SSOT 에 이미 등록되어 있어 기존 ID 사용). **A_1450 정정**: ko "디디"→"디디추싱" + en "디디"→"Didi Global" (T_083.json node name 동기). 미사용 BF_484 라이드헤일링플랫폼 동봉 (T_271 에서 OPERATES 연결 안 함, 추후 사용 대비). import_MT 9c4e373 + moneytree-web 382d615.
- **T_258 ~ T_270 (2026-05-26 ~ 2026-05-28)** — import_MT 에 누적 commit 되었으나 STATUS.md 미반영. 백필 필요. 누적 SSOT 추가분 중 T_271 외 식별: M_268~M_277 (10 macros), A_1716·A_1717 (실제는 T_271 자산), BF_484 (T_271 미사용).
- **T_257 신규 테마 "글로벌HBM메모리밸류체인" (2026-05-25)** — 11 자산 + BF_466 HBM신사업 신규 + M_212 AI데이터센터확대 + 16 엣지. **관계 다양화 ★**: THEMED_AS 6 (삼성·SK·마이크론·화웨이·CXMT·Nanya) / EXPOSED_TO 1 (PLUS HBM ETF→T_257) / **IN_ETF 4 (2궤도)** (ETF→램리서치·어플라이드·테라다인·한미반도체) / OPERATES BF 2 / SUPPLIES BF+자산 2 (CXMT→화웨이 HBM 공급) / IMPACTS 1. 자산 신규 3 (A_1650 Nanya·A_1651 Teradyne·A_1652 PLUS HBM ETF) + A_1571 CXMT 메타 정정 (PRIVATE). **cross-add**: T_025 글로벌메모리HW 에 Nanya, T_032 중국AI반도체 에 CXMT·PLUS ETF.
- **briefing ticker 정규식 확장 (2026-05-25)** — `ThemeBriefing.tsx` 의 `extractTickerFromCell` 정규식에 `(?:\s+[A-Z]+)*` 추가하여 `(008370 KOSPI)`·`(NVDA US)`·`(ADDYY OTC US)` 등 거래소·국가 표기가 붙은 패턴도 ticker 추출 가능. **영향 briefing 12개** (T_002·T_004·T_088·T_090·T_113·T_193·T_247·T_248·T_250·T_251·T_253·T_255·T_256) 의 KR 자산·일부 US 자산 수익률 6컬럼 자동 부착 정상화. (T_193 의 비표준 종목명은 이전 commit 에서 표준 형식으로 별도 정정 완료.)
- **홈 화면: 6 국가 박스 section 추가 (2026-05-25)** — 검색창과 Today's Pulse(WARM/COLD Top5) 사이에 신규 section. 한국·미국·일본·중국·유럽·글로벌 6 박스, 국기 emoji + 국가명 + 테마/자산 갯수 placeholder("—"). 클릭 → 국가별 분석 페이지 TBD (disabled). 갯수는 추후 테마 정리 후 채움.
- **T_256 fix (2026-05-25)** — A_687 LG생활건강 THEMED_AS 추가 + 빙그레(A_187) → BF_465 바나나맛우유(신규 BF) OPERATES. **제품 단위 BF 첫 도입** (BF_465 바나나맛우유 — 기존 BF 는 사업분야 차원이었으나 이번엔 제품 단위, 데이터모델상 결 다름).
- **T_256 신규 테마 "K-주류음료" (2026-05-25)** — 8 자산 (신규 6 A_1644~A_1649 하이트진로·국순당·한국알콜산업·무학·제주맥주·나라셀러 + 기존 2 A_187 빙그레·A_1397 롯데칠성음료) + 5 macro (신규 3 M_265 계절성·M_266 빅이벤트·M_267 주류세인상 + 기존 2 M_144·M_046). **궤도 구조 명시 적용**: 한국알콜산업(A_1646)이 2궤도로 THEMED_AS 없이 4 자산(롯데칠성·하이트진로·국순당·무학)에 SUPPLIES (주정 공급). **M_046 한글명 곡물가상승→곡물가인상 정정** (SSOT + T_046 노드 동기). T_019⟷A_187 confidence 변경은 데이터모델에 confidence 필드 없어 무시.
- **T_255 fix: macro 4개로 재구성 (2026-05-24)** — M_264 비료가상승 신규 + T_255 macro 재배선 (M_099 곡물수급악화 유지, M_075 기후변화·M_084 중동전쟁 기존 활용, M_264 비료가상승 신규 추가, 기존 M_046·M_002·M_048 제거).
- **T_255 신규 테마 "글로벌 농산물/곡물 인플레 수혜" (2026-05-24)** — 15 자산 (신규 8 A_1636~A_1643 DBA·TAGS·CORN·WEAT·SOYB·CTVA·ADM·VEGI + 기존 8 A_375·A_376·A_377·A_378·A_380·A_381·A_382·A_1447 NTR) THEMED_AS + 신규 2 BF (BF_463 농작물ETF·BF_464 농업일반ETF) OPERATES + 기존 4 macro IMPACTS. **T_081 비료 테마에 NTR cross-add** (자산 1개를 2 테마에 THEMED_AS). 사용자 의도 T_246 였으나 기존 일본자동차OEM 사용 중이라 T_255 로 등록.
- **T_254 fix #2: BF 4 제거 (2026-05-24)** — BF_171·BF_062·BF_064·BF_173 노드 + 관련 OPERATES 엣지 T_254 에서 제거 (SSOT 자체는 유지). 노드 20→16, 엣지 28→15.
- **T_254 fix #1: 1궤도 구조 적용 (2026-05-24)** — Moderna·BioNTech 만 T_254 에 직접 THEMED_AS 유지, 8 빅파마/협업사 THEMED_AS 해제 → PARTNERS 관계로만 1궤도 자산에 연결 (2궤도). **BAROMETER #12 (궤도 가중치) 의도와 일치하는 데이터 구조** — 향후 #12 구현 시 검증 케이스로 활용 가능.
- **T_254 신규 테마 "글로벌mRNA플랫폼" (2026-05-24)** — 10 자산 (신규 4 `A_1632` 모더나·`A_1633` BioNTech·`A_1634` Roche·`A_1635` Genentech(비) + 기존 6 Regeneron·Vertex·Pfizer·AstraZeneca·Merck·Sanofi) THEMED_AS + character 신규 2 (`C_203` 범용 Moderna A→C·`C_204` 항암특화 BioNTech A→C, typo "함양→항암" 정정) + 기존 4 BF (RNA치료제·항암제·CDMO·ADC) OPERATES + 기존 3 macro IMPACTS + **PARTNERS 8개** (Moderna-{Merck/AZN/Regeneron/Vertex}, BioNTech-{Pfizer/Roche/Sanofi/Genentech}). **짚어둔 cleanup 사안**: A_1315·A_1316·A_1318 한글명 영문 그대로 (사노피·아스트라제네카·머크).
- **T_253 fix (2026-05-24)** — M_190(비만약) MACRO 제거 + A_1218 Hims&Hers → BF_460 탈모치료제개발 OPERATES 해제 + A_244 일라이릴리 → BF_460 OPERATES 신규.
- **SSOT cleanup: A_1216 일라이릴리 deprecate (2026-05-24)** — A_244 (Eli Lilly and Company LLY) 정본 + A_1216 (Eli Lilly LLY) 동일 회사 2 ID 중복 → A_1216 row 삭제 + T_213.json 의 A_1216 참조를 A_244 로 치환 (1 node + 4 edges/links).
- **T_253 신규 테마 "글로벌바이오 : 남성탈모치료제" (2026-05-24)** — 5 자산 (신규 2 A_1630 Cosmo Pharmaceuticals·A_1631 현대약품 + 기존 3 A_244 일라이릴리·A_1214 화이자·A_1218 Hims&Hers) THEMED_AS + 신규 3 BF (BF_460 탈모치료제개발·BF_461 DTC플랫폼·BF_462 한국시장유통) OPERATES + 기존 3 macro (M_191·M_157·M_190) IMPACTS + A_1630→A_1631 PARTNERS.
- **T_252 후속 #2 (2026-05-24)** — T_252 에서 BF_196·BF_197 노드 제거 (dangling) + character 신규 2 (`C_201` SMR대비조기상업화가능·`C_202` 미국서부지역에집중) + **BF_458 지열발전 → C_201/C_202 HAS_TRAIT** (BF→C HAS_TRAIT 새 패턴 첫 도입, 사업분야 차원 trait).
- **T_252 후속 #1 (2026-05-24)** — meta.description 추가, BF 재배선 (Fervo·Ormat→신규 BF_458 지열발전, Fermi→신규 BF_459 AIDC에너지통합인프라REITs, 기존 BF 연결 해제), Ormat→Alphabet(A_050) SUPPLIES 신규 (Google 150MW 지열 PPA) + A_050 Alphabet 노드 T_252 에 추가.
- **T_252 신규 테마 "AlwaysOn에너지(지열,SMR등)" (2026-05-24)** — 6 자산 (신규 3 A_1627 Fervo·A_1628 Ormat·A_1629 Fermi + IPO 처리 1 A_164 X-Energy(비)→엑스에너지 XE NASDAQ STOCK + 기존 2 A_168 NuScale·A_170 Oklo) THEMED_AS + 5 macro IMPACTS. **사용자 의도 T_242 였으나 T_242 가 이미 미국방산관련주 사용 중이라 T_252 로 변경.**
- **T_251 신규 테마 "K-사모펀드(PE)포트폴리오기업" (2026-05-24)** — 8 자산 (신규 6 `A_1621`~`A_1626` 남양유업·한샘·하나투어·에이블씨앤씨·오스템임플란트·커넥트웨이브 + 기존 2 `A_921` 클래시스·`A_1510` 제이시스메디칼) THEMED_AS + 기존 4 macro IMPACTS (M_005·M_173·M_145·M_057) + 기존 C_122 고배당 HAS_TRAIT. BF 의도적 제외 (사용자 지시).
- **T_090 augmentation (2026-05-24)** — A_699 ALMN(LSE GB) → A_068 ALUM(USCF Aluminum Strategy Fund, NYSEARCA US) 자산 **교체** + 5 KR 자산 신규 (`A_1616` 알루코·`A_1617` TCC스틸·`A_1618` DI동일·`A_1619` 삼양패키징·`A_1620` 세명전기) THEMED_AS.
- **fix 브랜치 sync 수동 트리거** (2026-05-24) — 11 commit stale 이던 `kang0302/import_MT` 의 `fix/theme-json-conflicts` 브랜치를 사용자가 GitHub Actions UI 에서 `auto-merge-main-to-fix.yml` 수동 dispatch → main 과 sync 완료 (delta 0).
- **T_250 신규 테마 "글로벌통화가치상승베팅ETF"** — 12 자산 (10 신규 + 기존 UUP·BZF) + 1 신규 macro (`M_263` 통화가치변동) + 1 신규 character (`C_200` 통화가치추종) + 기존 5 macro IMPACTS.
- **T_249 신규 테마 "글로벌금융데이터플랫폼"** — 7 자산 (모닝스타·MSCI·팩트셋·S&P글로벌·LSEG·무디스 + 블룸버그(비)) + 3 신규 macro (`M_260`~`M_262`) + 2 신규 character (`C_198` 고PER·`C_199` 가격결정력) + 기존 1 macro (M_055 AI확산) + 기존 1 character (C_189 안정적).
- **T_248 신규 테마 "K-항공주"** — 6 자산 (`A_1593`~`A_1598`) + `C_197` 지배구조이슈민감 신규 character (한진칼·호반건설 자산 단위 trait — **A→C HAS_TRAIT 첫 도입**) + 3 기존 macro (M_003·M_037·M_178) IMPACTS + 호반건설→한진칼 INVESTS.
- **SSOT cleanup** — `A_1455` 롯데쇼핑 중복 제거 (T_140 참조를 A_1398 로 치환) + `A_1144` 한글명 "신라호텔"→"호텔신라" 정정 (T_170·T_233 node name 동기).
- **T_247 신규 테마 "K-백화점/하이엔드 유통"** — 5 자산 (신세계·현대백화점·롯데쇼핑·호텔신라·신세계인터내셔날) + `M_258`·`M_259` 신규 macro + `BF_081` OPERATES.
- **T_113 augmentation** — 에스오에스랩(`A_288`) THEMED_AS + K-자율주행대표주(`C_196`) HAS_TRAIT.
- **PYKRX cron 차단** — `import_MT/.github/workflows/update-return-kr.yml` schedule 제거. EODHD 결과를 5분 뒤 PYKRX 가 덮어쓰는 사고 즉시 차단. dispatch 만 유지 (비상 fallback).
- **EODHD fill 점검 routine** — `trig_017YbkhbhEFx1BEDRELG4dYR`, 2026-05-25T09:00:00Z (월요일 KST 18:00) 1회 자동 실행 예약.
- **누적 테마 257개** (T_001 ~ T_257). 신규 자산 누적 61개 (A_1592~A_1652 중 신규 분 + A_164 IPO row 수정 + A_1571 CXMT 메타 정정, A_1216·A_1455 cleanup 제외). **새 관계 타입 도입**: `EXPOSED_TO` (자산→테마), `IN_ETF` (ETF→구성자산, 2궤도 표현).

## 🔧 현재 진행중
- 없음 (다음 작업 대기).

## 🧹 미정리 drift (2026-05-28 관측)
- **moneytree-web public/data/theme/ 200+ M T_*.json** — 오래된 metrics (2026-05-17~20) 가 working tree 에 남아있음. sync-themes-from-import-mt workflow (KST 16:10 daily) 가 import_MT/main raw 에서 재다운로드하면 자연 정리됨. 별도 cleanup commit 또는 workflow 수동 dispatch 로 처리 가능.
- **moneytree-web public/data/theme/ untracked 23개** (T_232·234~242·258~270 등) — 신규 테마 mirror 가 워킹트리에만 있고 git 미커밋. T_271 commit 에서는 의도적으로 제외 (scope 분리). 일괄 mirror commit 필요.
- **T_258 ~ T_270 STATUS.md 미반영** — 13개 테마가 import_MT/main 에 commit 되었으나 STATUS.md 백필 안 됨. 다음 세션에서 정리 권장.

## ⚠️ 이슈 / 블로커
- **PYKRX vs EODHD 최종 결정 PARKED** (2026-05-23). 월요일 routine 결과 확인 후 PYKRX 완전 purge 여부 결정. 메모리: [project_pykrx_purge_parked.md](C:/Users/jungwoo.kang/.claude/projects/c--Users-jungwoo-kang-moneytree-web/memory/project_pykrx_purge_parked.md).
- **신규 자산 metrics 모두 null** — 이번 세션 신규 자산들 (T_113 의 신규 0 + T_247 의 신규 1 + T_248 의 신규 6 + T_249 의 신규 7 + T_250 의 신규 10 + T_090 의 신규 5 + T_251 의 신규 6 = **총 35 자산**) 의 close/marketCap/returns 가 null. 다음 cron 에서 자동 채워질 예정:
  - KR (KOSPI·KOSDAQ·KRX): `update-close-kr.yml` 07:05 UTC daily (EODHD)
  - US: `update_fmp_return_freeze.yml` / `update_fmp_valuation_freeze.yml`
  - 비상장 (PRIVATE) 4종 (호반건설·블룸버그 등): cron 영구 null.
- **fix 브랜치 sync lag** — 앱이 `import_MT/fix/theme-json-conflicts` 에서 fetch 하는데 일별 auto-merge cron 이 KST 08:30. 변경이 즉시 그래프에 반영 안 됨. 해결: **사용자가 GitHub Actions UI 에서 `auto-merge-main-to-fix.yml` 수동 dispatch** (2026-05-24 검증 완료).
- **moneytree-web 의 mirror sync 누적** — `public/` 디렉토리가 `import_MT` 의 통째 mirror 인데 origin/main 의 일부 SSOT (예: character_ssot 가 origin/main 에서 C_060 까지만, working tree 는 C_200 까지) 가 stale. 매 commit 마다 묶여서 정리 중. 더 큰 sync 사고 발견 시 별도 cleanup commit.
- **HAS_TRAIT 패턴 확장 (2026-05-23·24)** — 기존엔 T→C 만. T_248 에서 **A→C** 첫 도입 (한진칼·호반건설 → C_197), T_252 에서 **BF→C** 첫 도입 (BF_458 지열발전 → C_201·C_202). 세 패턴 공존, 데이터모델 문서화·UI 일관성 검토 필요.

## 📌 다음 할 일
- **2026-05-25 (월) routine 결과 확인** → PYKRX 완전 purge 결정 (project_pykrx_purge_parked.md 의 2단계).
- 신규 35 자산 metrics 다음 cron 자동 fill 검증 (월요일).
- 시스템 구성·화면 아이디어 작업 (랜딩 디자인·서비스 IA·바로미터 개선 등) 재개.
- **BAROMETER 개선 #12 신규 등극 (2026-05-24)** — 궤도(orbit) 가중치: 1궤도 THEMED_AS 자산 > 2궤도 SUPPLIES·INVESTS·PARTNERS 자산. 현 EW 의 변두리 자산 희석 문제 해결. #1·#2 와 동급 1순위로 격상. 상세: [project_barometer_improvements.md](C:/Users/jungwoo.kang/.claude/projects/c--Users-jungwoo-kang-moneytree-web/memory/project_barometer_improvements.md) #12.
- 추후 테마 추가 작업 (T_252 이상).
- A→C HAS_TRAIT 패턴 데이터모델 문서화.

## 🏗️ 기술 스택
- **앱**: Next.js (`kang0302/moneytree-web`) — Vercel 배포.
- **데이터 파이프라인**: Python 배치 (`kang0302/import_MT`) — GitHub Actions cron 으로 freeze 생성.
- **데이터 소스 라우팅**: US→FMP / 그 외→EODHD / fallback YAHOO. SSOT 모듈 `src/lib/sourceRouter.ts` + `import_MT/scripts/source_router.py` (일치 필수).
- **그래프 라이브러리**: 자체 구현 (sector-based radial 4 layer, forceRadial+forceY).
- **데이터 저장**: GitHub raw — `import_MT/main` canonical, `moneytree-web/public/data/` 가 mirror, 앱 fetch 는 `import_MT/fix/theme-json-conflicts` (env `NEXT_PUBLIC_THEME_BRANCH`).
- **브랜치 정책**: 데이터 업데이터는 main 에 push, 앱은 fix 브랜치에서 fetch, 일별 auto-merge workflow (KST 08:30) 가 sync. 즉시 sync 필요 시 manual dispatch.
- **Cloud routine**: claude.ai Code Routines (`schedule` 스킬로 생성·관리).

## 🔗 외부 리소스
- moneytree-web repo: https://github.com/kang0302/moneytree-web
- import_MT repo: https://github.com/kang0302/import_MT
- import_MT Actions (auto-merge dispatch): https://github.com/kang0302/import_MT/actions/workflows/auto-merge-main-to-fix.yml
- Routines 페이지: https://claude.ai/code/routines
