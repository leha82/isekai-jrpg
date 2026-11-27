# 09. 개발 로드맵

## 구현 현황

### ✅ 완료
- 월드맵 이동 (키보드 + 가상 패드), 타일별 인카운트
- 3인 파티 턴제 전투, 캐릭터별 스킬
- 스토리 진행 flag 0~3, 동료 합류 이벤트, 보스전, 엔딩
- 상점·여관·무기/방어구 강화, 인벤토리
- 8비트 BGM·효과음 (Web Audio)
- **[2026-11-27] 원본 기획서의 다음 마일스톤 반영**
  - localStorage 세이브/불러오기 (`arcadia_isekai_jrpg_save_v1`), 타이틀 이어하기, 자동 저장, 저장 토스트
  - AudioContext 예외 처리 (생성 실패, suspended 상태)
  - 반응형 스케일링 (640x480 내부 해상도 유지)
  - 유진 `힐` 스킬, 전투 중 에테르 사용
  - 왕가의 명검 이벤트 (가렌 합류 시 무기 Lv +1)
  - 엔딩 시 `storyFlag = 3`
  - 버그 수정: 엔딩 오버레이 뒤에서 이동이 되던 문제, Space 이중 입력, 상점 제목이 바뀌던 문제, `alert()` 팝업을 게임 내 대화창·토스트로 교체

- **[2026-11-27] 클라우드 세이브**
  - Firebase Google 로그인(선택) + Firestore `saves/{uid}` 저장, 최근 `savedAt` 우선 불러오기
  - 로그인 직후 이 기기 세이브 업로드, SDK 로드 실패 시 로컬 전용으로 동작
  - `firestore.rules` 보안 규칙 파일 추가

- **[2026-11-27] 코드 구조화 + 암호화 시나리오 스크립트 + 관리자 페이지**
  - 단일 `index.html` → `css/`, `js/{data,core,scenario,systems,game,firebase,admin}` 로 분리
  - 대화·맵 이벤트·목표·타이틀/엔딩 문구를 시나리오 스크립트(`.script`)로 이전 — 전용 문법·파서·검사기
  - GitHub 에는 AES-256-GCM 암호화본(`scenario/`)만, 평문(`scenario-src/`)은 git 제외
  - 복호화 키는 Firebase `scriptKeys`, 관리자 저장 시마다 새 키로 교체 (최근 3개 보관)
  - `admin.html`: 마스터 계정 전용 편집기 (검사, 가져오기/내보내기, 암호화 저장 → GitHub 커밋)
  - 적 데이터에 id 부여 (`ENEMIES`), 인카운트 표(`ENCOUNTERS`), `startBattle(enemyId, isBoss, winScene)`
  - `docs/03_story.md` 에서 대사 원문 제거 (공개 문서이므로)

## 다음 마일스톤 후보 (우선순위 순)

| # | 항목 | 관련 문서 | 상태 |
|---|---|---|---|
| 1 | GitHub Pages 배포 설정 (main 브랜치 배포 + `.nojekyll`) | [08_tech.md](08_tech.md#배포-github-pages-) | ✅ 2026-11-27 |
| 2 | 보스 2페이즈 + 중간 보스(흑기사 대장) | [05_battle.md](05_battle.md), [06_monsters.md](06_monsters.md) | 🔲 |
| 3 | 독 등 상태이상, 적 속성 약점 | [05_battle.md](05_battle.md) | 🔲 |
| 4 | 드워프 산맥 지역 + 드워프 장인 NPC | [02_world.md](02_world.md), [04_characters.md](04_characters.md) | 🔲 |
| 5 | 세이브 슬롯 다중화 | [07_systems.md](07_systems.md) | 🔲 |
| 5-1 | 기기 간 세이브 이동: Google 로그인 클라우드 세이브(B안 채택) | [07_systems.md](07_systems.md#클라우드-세이브--로그인-) | ✅ 2026-11-27 |
| 5-2 | Firebase 프로젝트 콘솔 설정 (프로젝트 `isekai-jrpg`) | [10_firebase_setup.md](10_firebase_setup.md) | ✅ 2026-11-27 (배포 사이트 로그인·클라우드 저장 확인) |
| 5-3 | 세이브 코드 내보내기/가져오기 (오프라인 백업) | [07_systems.md](07_systems.md) | 💡 |
| 6 | 맵 스크롤 (20x15보다 큰 월드) | [02_world.md](02_world.md) | 💡 |
| 7 | 코드 분리 (`js/`, `css/`) + 시나리오 스크립트 | [08_tech.md](08_tech.md), [11_scenario.md](11_scenario.md) | ✅ 2026-11-27 |
| 7-1 | 새 보안 규칙 게시 + GitHub 토큰 설정 + 첫 시나리오 업로드 (사용자 진행) | [10_firebase_setup.md](10_firebase_setup.md), [11_scenario.md](11_scenario.md) | 🔲 |
| 8 | 상점 품목·가격, 적 능력치도 스크립트로 이전 | [11_scenario.md](11_scenario.md) | 💡 |

## 원본 기획서와 현재 구현의 차이

| 항목 | 기획서 | 구현 | 결정 |
|---|---|---|---|
| 모달 상태명 | `SHOP_INV` | `MODAL` | 구현 유지 |
| 전투 커맨드 | 유진 선택 시 동료 자동 연계 | 멤버별 직접 선택 | 구현 유지 |
| 세이브 구조 | 주인공 스탯만 저장 + 동료 합류 여부 | 멤버별 전체 능력치 저장 | 구현 유지 |
| 유진 기본 능력치 | HP60 ATK14 MATK20 | HP55 ATK12 MATK18 | 구현 유지 (밸런스 조정 시 재검토) |
| 시작 골드 | 50 G | 60 G | 구현 유지 |
