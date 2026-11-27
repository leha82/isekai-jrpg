# 쐐기의 이방인 (isekai-jrpg)

빌드 도구 없는 HTML5 JRPG. 코드는 `js/` 아래 역할별 파일, 게임 데이터(맵·캐릭터·몬스터·스킬·아이템·전투 수치)는 `data/*.json`,
대화·이벤트·스토리는 **암호화된 시나리오 스크립트**, 그래픽·음원은 `tools/` 생성기로 만든 `assets/` 로 관리한다.

## 기획 문서
`docs/` 폴더에서 주제별로 관리한다. 작업 전에 관련 문서를 먼저 읽는다.
- `docs/README.md` — 문서 목록과 운영 규칙
- 컨셉 01, 세계관·맵 02, 스토리 03, 캐릭터 04, 전투 05, 몬스터 06, 시스템(HUD·퀘스트·성장·상점·세이브) 07, 기술 구조 08, 로드맵 09, Firebase 10, 시나리오 스크립트 11, 리소스 생성 12, 관리자 모드 13
- `docs/reference/` — 원본 통합 기획서. 수정하지 않는다.
- `docs/` 는 GitHub 에 공개된다. **대사 원문은 docs 에 쓰지 않는다** (시나리오 스크립트에만).

## 요구사항 처리 절차 (모든 요청에 적용)

사용자의 요청이나 요구사항은 **문서와 코드(또는 시나리오)를 한 묶음으로** 처리한다. 한쪽만 고친 채로 끝내지 않는다.

0. **동기화:** 작업 전에 `git pull` 한다. 관리자 페이지가 GitHub 에 직접 커밋하기 때문이다.
1. **분석:** 요청을 기능 단위로 나누고, 각 기능이 아래 매핑표의 어느 문서·어느 파일에 해당하는지 판단한다. 한 요청이 여러 곳에 걸칠 수 있다.
2. **현황 파악:** 해당 docs 문서와 관련 코드(`js/...`)·시나리오(`scenario-src/...`)를 읽는다. 기존 설정과 충돌하면 어떻게 맞출지 정하고, 사용자 결정이 필요하면 먼저 묻는다.
3. **구현:** 코드는 `js/`, 대사·이벤트·목표는 `scenario-src/*.script` 를 수정한다.
4. **문서 갱신:** 해당 docs 문서의 설명, 표, 수치를 **실제 값으로** 고치고 상태 표기(✅/🔲/💡)를 바꾼다.
5. **로드맵:** `docs/09_roadmap.md`의 "구현 현황"에 날짜와 함께 기록한다.
6. **검증:** 헤드리스 Edge 로 실행해 JS 오류가 없는지, 바뀐 기능이 동작하는지 확인한다. 시나리오를 고쳤으면 `ScenarioFormat.parseAll` + `validate` 로 오류 0건을 확인한다.
7. **보고:** 수정한 코드·시나리오·문서 목록을 알린다. 시나리오를 고쳤다면 "관리자 페이지 → 📁 폴더 가져오기 → 🔒 암호화 저장" 을 해야 게임에 반영된다고 안내한다.

아이디어나 기획만 요청하고 구현하라는 말이 없으면 문서에 🔲/💡로 기록만 하고, 구현할지 묻는다.

### 요구사항 → 문서 매핑

| 요구사항 유형 | 갱신할 문서 | 주로 고칠 파일 |
|---|---|---|
| 게임 방향, 톤, 조작키, 디자인 원칙 | `01_concept.md` | — |
| 맵·타일·지역·출구·인카운트 | `02_world.md` (+ 몬스터면 `06`) | `data/maps/*.json`, `data/game.json`, `tools/gen_maps.py`(처음 생성만) |
| 스토리, 대사, 이벤트, 퀘스트, 엔딩 | `03_story.md` (줄거리·구조만), `11` | `scenario-src/*.script` |
| 캐릭터·NPC, 능력치, 성장치, 스킬 배정 | `04_characters.md` (+ 성장 곡선이면 `07`) | `data/characters.json` |
| 전투 흐름, 스킬, 공식, 연출 | `05_battle.md` (+ 스킬표가 있는 `04`) | `data/skills.json`, `data/battle.json`, `js/systems/battle*.js` |
| 몬스터·보스, 행동, 전리품, 출현 | `06_monsters.md` (+ 출현 맵이면 `02`) | `data/monsters.json`, `data/maps/*.json` |
| HUD·메뉴·퀘스트·경험치·상점·아이템·세이브 | `07_systems.md` | `js/systems/hud.js`, `shop.js`, `save.js`, `data/items.json` |
| 코드 구조, 상태 머신, 렌더링, 배포 | `08_tech.md` | `js/core/*`, `js/world/*`, `index.html` |
| Firebase 설정, 로그인, 보안 규칙, 관리자 권한 | `10_firebase_setup.md` (+ `07`, `08`, `13`) | `firestore.rules`, `js/config.js` |
| 시나리오 문법·명령 추가, 암호화 | `11_scenario.md` | `js/scenario/*` |
| 그래픽·사운드 리소스 | `12_assets.md` | `tools/gen_assets.py`, `gen_svg.py`, `gen_audio.py` → 실행 후 `tools/gen_manifest.py` |
| 관리자 페이지 메뉴 | `13_admin.md` | `admin.html`, `js/admin/*` |
| 할 일, 우선순위, 완료 기록 | `09_roadmap.md` (모든 구현 후 항상) | — |
| 위 어디에도 맞지 않는 새 주제 | `docs/14_xxx.md` 를 새로 만들고 `docs/README.md` 목록에 추가 | — |

- 같은 수치가 여러 문서에 나오면(예: 스킬 MP는 `04`와 `05`) 모두 맞춰서 고친다.
- 파일을 추가·삭제하면 `index.html`(관리자에서도 쓰면 `admin.html`)의 `<script>` 목록과 `08_tech.md` 의 파일 구조를 갱신한다.
- 시나리오 명령을 추가하면 `js/scenario/format.js`(파싱·검사·`COMMAND_HELP`), `js/scenario/runtime.js`(실행), `11_scenario.md` 를 함께 고친다.
- 데이터 JSON 구조를 바꾸면 게임(`js/`)과 관리자 탭(`js/admin/tab-*.js`)을 함께 고친다. 새 데이터 파일은 `js/config.js` 의 `DATA_FILES` 에 추가한다.
- 타일은 `tools/gen_assets.py` 목록 **끝에만** 추가한다 (인덱스가 맵 데이터 값). `gen_maps.py` 재실행은 관리자가 편집한 맵을 덮어쓰므로 하지 않는다.

## 실행
- VS Code `F5` (서버 자동 실행) 또는 `python -m http.server 8000` → http://localhost:8000 , 관리자 `/admin.html`
- **파일로 직접 열면 동작하지 않는다** (시나리오 fetch·Firebase 로그인 불가).
- 배포: `main` push → https://leha82.github.io/isekai-jrpg/ (관리자 `/admin.html`)

## 시나리오 스크립트 (중요)
- 평문 원본: `scenario-src/*.script` — **`.gitignore` 로 제외. 절대 커밋하지 않는다.** 커밋 전에 `git status` 에 `scenario-src` 가 없는지 확인한다.
- 암호화본: `scenario/*.script.enc.json` + `manifest.json` — **관리자 페이지만 만든다.** 직접 만들거나 고치지 않는다 (키는 Firebase 에 있고 마스터만 등록 가능).
- 관리자 페이지에서 고친 내용은 로컬 `scenario-src` 에 자동 반영되지 않는다. 사용자에게 "📤 전체 내보내기 → scenario-src 에 덮어쓰기" 를 요청한 뒤 작업한다.
- 테스트는 임시 키로 `ScenarioCrypto` 를 써서 메모리에서 암호화·복호화한다 (scratchpad 하네스). 실제 키는 건드리지 않는다.
- 게임 코드 변경과 시나리오 변경이 서로 맞물려 있어(새 맵·명령 등) 관리자 업로드를 기다릴 수 없을 때만, 사용자 동의를 받고 현재 라이브 키(공개 읽기)로 `scenario/` 를 암호화해 함께 커밋한다. 이 경우 키가 교체되지 않으므로 관리자 페이지에서 한 번 저장해 키를 바꾸라고 안내한다.

## 규칙
- UI 텍스트·주석은 한국어.
- `party` 멤버의 능력치 필드를 추가하면 `PARTY_SAVE_FIELDS`(`js/systems/save.js`)에도 추가한다.
- 세이브 구조를 호환되지 않게 바꾸면 `SAVE_VERSION`을 올린다. 세이브 최상위 키를 바꾸면 `firestore.rules` 도 고치고 콘솔 재게시를 안내한다.
- 클라우드 저장(`saveGame(..., true)`, 시나리오 `> save`)은 수동 저장과 스토리 진행 시점에만 쓴다. Firestore 무료 쓰기 한도 때문이다.
- 최고 관리자 계정은 `js/config.js` 의 `MASTER_EMAIL` 과 `firestore.rules` 의 `isMaster()` 두 곳에 있다. 바꿀 때는 둘 다 바꾼다. 다른 관리자는 관리자 페이지 '관리자 지정'(Firestore `config/admins`).
- 게임 진행(이동·페이드·전투 연출)은 타이머로 끝을 보장하고, rAF 는 그리기만 한다. 새 연출도 이 원칙을 지킨다.
