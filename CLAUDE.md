# 아르카디아 연대기 (isekai-jrpg)

빌드 도구·외부 의존성이 없는 단일 파일 HTML5 JRPG. 모든 코드는 `index.html` 한 파일에 있다.

## 기획 문서
`docs/` 폴더에서 주제별로 관리한다. 작업 전에 관련 문서를 먼저 읽는다.
- `docs/README.md` — 문서 목록과 운영 규칙
- 컨셉 01, 세계관·맵 02, 스토리 03, 캐릭터 04, 전투 05, 몬스터 06, 시스템(성장·상점·세이브) 07, 기술 구조 08, 로드맵 09
- `docs/reference/` — 원본 통합 기획서. 수정하지 않는다.

## 요구사항 처리 절차 (모든 요청에 적용)

사용자의 요청이나 요구사항은 **문서와 코드를 한 묶음으로** 처리한다. 코드만 고치거나 문서만 고친 채로 끝내지 않는다.

1. **분석:** 요청을 기능 단위로 나누고, 각 기능이 아래 매핑표의 어느 문서에 해당하는지 판단한다. 한 요청이 여러 문서에 걸칠 수 있다.
2. **현황 파악:** 해당 docs 문서와 `index.html`의 관련 코드를 읽는다. 이미 있는 설정과 충돌하면(예: 스토리 설정, 밸런스 수치) 어떻게 맞출지 정하고, 사용자 결정이 필요하면 먼저 묻는다.
3. **구현:** `index.html`을 수정한다.
4. **문서 갱신:** 해당 docs 문서의 설명, 표, 수치를 **실제 코드 값으로** 고치고 상태 표기(✅/🔲/💡)를 바꾼다.
5. **로드맵:** `docs/09_roadmap.md`의 "구현 현황"에 날짜와 함께 기록한다. 계획 항목이었다면 상태를 바꾼다.
6. **검증:** 브라우저(헤드리스 Edge 등)로 실행해 JS 오류가 없는지, 바뀐 기능이 동작하는지 확인한다.
7. **보고:** 수정한 코드 내용과 갱신한 문서 목록을 함께 알린다.

아이디어나 기획만 요청하고 구현하라는 말이 없으면 문서에 🔲/💡로 기록만 하고, 구현할지 묻는다.

### 요구사항 → 문서 매핑

| 요구사항 유형 | 갱신할 문서 |
|---|---|
| 게임 방향, 톤, 조작키, 디자인 원칙 | `01_concept.md` |
| 맵·타일·지역·거점 추가/변경, 인카운트 확률 | `02_world.md` (+ 몬스터면 `06`) |
| 스토리, 대사, 이벤트, `storyFlag`, 엔딩 | `03_story.md` |
| 캐릭터·NPC 추가, 기본 능력치, 레벨업 성장치 | `04_characters.md` (+ 성장 곡선이면 `07`) |
| 전투 흐름, 스킬, 커맨드, 데미지 공식, 상태이상 | `05_battle.md` (+ 스킬 요약표가 있는 `04`) |
| 몬스터·보스 추가, 능력치, 보상, 출현 풀 | `06_monsters.md` (+ 출현 지역이면 `02`) |
| 경험치, 골드, 상점, 아이템, 인벤토리, 세이브 | `07_systems.md` |
| 코드 구조, 상태 머신, 세이브 포맷, 그래픽·사운드, 배포, 반응형 | `08_tech.md` |
| 할 일, 우선순위, 완료 기록 | `09_roadmap.md` (모든 구현 후 항상) |
| Firebase 콘솔 설정, 로그인·클라우드 세이브 연동, 보안 규칙 | `10_firebase_setup.md` (+ 세이브 사양은 `07`, 구조는 `08`) |
| 위 어디에도 맞지 않는 새 주제 | `docs/10_xxx.md`를 새로 만들고 `docs/README.md` 목록에 추가 |

- 같은 수치가 여러 문서에 나오면(예: 스킬 MP는 `04`와 `05`) 모두 맞춰서 고친다.
- `docs/reference/`의 원본 기획서는 수정하지 않는다.
- 새 섹션을 만들거나 섹션 번호가 바뀌면 이 파일의 "index.html 구조"와 `08_tech.md`의 코드 구조 표를 갱신한다.

## 실행
- `python -m http.server 8000` 후 http://localhost:8000 (VS Code: `Ctrl+Shift+B` 또는 F5)
- `index.html`을 브라우저로 직접 열어도 동작한다.

## index.html 구조 (`<script>` 내 섹션 번호)
1. Web Audio 사운드 엔진 — `playTone`, `SFX`, `setBGM`
2. 도트 스프라이트 — `PALETTE`, `SPRITES`
3. 월드맵 — `WORLD_MAP` 20x15, `LOCATIONS`
4. 상태 — `gameState`, `player`, `party`
5. 렌더링 — `drawSprite`, `renderWorld`, `updateHUD`
6. 상점/인벤토리 — `openTownShop`, `openInventory`
7. 스토리 — `startDialog`, `checkTileEvent`, `player.storyFlag`
8. 턴제 전투 — `startBattle`, `nextAllyTurn`, `execSkill`, `enemyTurn`
9. 입력 — `movePlayer`, `handleActionKey`, keydown
10. 세이브/불러오기 — `SAVE_KEY`, `saveGame(isAuto, toCloud)`, `readSave`, `applySaveData`, `showToast`
11. 클라우드 세이브 — `latestSave`, `cloudSave`, `syncOnLogin`, `onCloudAuthChanged`, `toggleLogin`
12. 반응형 스케일링 — `fitGameToScreen`
13. Firebase SDK — 맨 아래 `<script type="module">`, `firebaseConfig`, `window.cloud`

- 세이브 최상위 키를 바꾸면 `firestore.rules`도 수정하고, 콘솔에 다시 게시해야 한다고 사용자에게 알린다.
- 클라우드 저장(`saveGame(..., true)`)은 수동 저장과 스토리 진행 시점에만 쓴다. Firestore 무료 쓰기 한도 때문이다.

## 규칙
- UI 텍스트·주석은 한국어.
- `party` 멤버의 능력치 필드를 추가하면 `PARTY_SAVE_FIELDS`에도 추가한다.
- 세이브 구조를 호환되지 않게 바꾸면 `SAVE_VERSION`을 올린다.
