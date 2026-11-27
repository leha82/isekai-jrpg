# 08. 기술 구조

## 기술 스택
- HTML5 / CSS3 / Vanilla JavaScript (ES6+). 빌드 도구 없이 여러 `.js` 파일을 `<script>` 순서대로 불러온다 (전역 공유).
- 그래픽: `<canvas>` 2D. 생성한 PNG 시트(타일·캐릭터·몬스터·배경)를 `drawImage` 로 그림 (`imageSmoothingEnabled = false`).
- 사운드: MP3 를 Web Audio `decodeAudioData` 로 디코딩해 재생. BGM 은 `loopStart/loopEnd` 로 끊김 없이 반복.
- 데이터: `data/*.json` (평문, 관리자 페이지에서 편집) · 시나리오: 암호화 스크립트 + Firebase 키 ([11_scenario.md](11_scenario.md))
- 저장: `localStorage` + (선택) Firestore 클라우드 세이브
- 외부 에셋 없음 — 리소스는 `tools/` 생성기로 만든다 ([12_assets.md](12_assets.md)). 예외: Firebase JS SDK 13.4.0 (CDN, ES module) — 로그인·클라우드 세이브에만 쓰며, 못 불러와도 게임은 시작된다.

## 실행 & 디버깅
| 방법 | 명령 |
|---|---|
| VS Code | `F5` (서버 자동 실행 + Edge/Chrome 디버그), `Ctrl+Shift+B` (서버만) |
| 로컬 서버 | `python -m http.server 8000` → http://localhost:8000 (관리자: `/admin.html`) |
| 파일로 열기 | **동작하지 않음** — 데이터·시나리오를 `fetch` 할 수 없고 Firebase 로그인도 불가 |

## 배포 (GitHub Pages) ✅
| 항목 | 내용 |
|---|---|
| 주소 | https://leha82.github.io/isekai-jrpg/ (관리자 `/admin.html`) |
| 방식 | `main` 브랜치 루트 배포 + `.nojekyll`. push 후 1~2분 뒤 반영 |
| 주의 | 저장소 전체가 공개된다. 평문 시나리오(`scenario-src/`)는 `.gitignore` 로 제외 |
| 관리자 커밋 | 관리자 페이지가 GitHub API 로 `data/`·`scenario/` 를 직접 커밋한다 → 로컬 작업 전 `git pull` |

## 파일 구조
```
index.html / admin.html
css/game.css · admin.css
js/config.js            Firebase 설정, MASTER_EMAIL, GitHub 저장소, 폴더, DATA_FILES
js/core/                assets.js (데이터·이미지 로더, 시트 좌표) · state.js (상태·5스탯 계산·장비·파티 순서·리더·레벨업 — 관리자 페이지도 사용) · audio.js (MP3 BGM/SFX, 볼륨·채널별 끄기) · ui.js (토스트·알림/확인 창·대화창·창·이름 입력) · display.js (화면 모드·크기·세로/가로 해상도·가상 패드 위치)
js/ai/ai-client.js      AI 연결 (Claude SDK·Gemini·ChatGPT), AI 연결 메뉴 — [14_ai.md](14_ai.md)
js/scenario/            crypto.js (AES-GCM) · format.js (파서·검사기) · context.js (검사용 데이터 목록) · runtime.js (로드·장면 실행·퀘스트·엔딩)
js/world/world.js       맵 렌더링(카메라·타일 애니메이션)·이동·상호작용·워프·인카운트
js/systems/             hud.js (HUD·메뉴: 파티·가방·장비·스킬·퀘스트·설정) · worldmap.js (지도 탭: 월드 지도·현재 지역) · shop.js · battle.js (전투 로직·피해 공식) · battle-view.js (전투 캔버스 연출·배치) · save.js (슬롯·자동 저장·클라우드 동기화·저장 창·로그인·플레이어 ID)
js/game/                input.js (키보드·단축키·가상 패드) · main.js (부팅·타이틀·새 게임)
js/firebase/game-cloud.js   게임용 Firebase module → window.cloud
js/admin/               admin.js (진입) · core.js (백엔드·공용) · tab-scenario / tab-events / tab-maps / tab-actors / tab-battle / tab-resources / tab-admins
data/                   game · tiles · sprites · characters · monsters · skills · items · battle · audio · assets .json, maps/*.json
assets/                 img/(tiles·characters·monsters.png, bg/, portraits/, icons/) · bgm/*.mp3 · sfx/*.mp3
scenario/               암호화 시나리오 (manifest.json + *.script.enc.json)
scenario-src/           평문 시나리오 원본 (git 제외)
tools/                  gen_assets.py · gen_svg.py · gen_audio.py · gen_maps.py · gen_manifest.py
firestore.rules         Firestore 보안 규칙 원본 (콘솔에 게시해야 적용)
```

### 스크립트 로드 순서 (`index.html`)
`config → core/assets → core/state → core/audio → core/ui → core/display → ai/ai-client → scenario/crypto → format → context → runtime → world/world → systems/hud → worldmap → shop → battle-view → battle → save → game/input → game/main → (module) firebase/game-cloud`
- `admin.html`: `config → core/assets → core/state → scenario/crypto → format → context → (module) admin/admin` (능력치 미리보기에 `state.js` 사용)
- 일반 스크립트끼리 전역을 공유한다. 최상위에서 바로 실행되는 코드가 쓰는 것만 앞에 있으면 된다.
- 파일을 추가하면 `index.html`(관리자에서도 쓰면 `admin.html`)과 이 표를 갱신한다.

### 부팅 흐름
1. `main.js boot()` → `applyDisplay()` → `loadGameData()` (data JSON 9개 + 맵 12개 + 이미지) → 진행률 표시
2. `loadScenario()` → 암호 파일 + 복호화 키(Firestore REST 로 `scriptKeys/{keyId}` 공개 읽기 — SDK 불필요) → 복호화 → `parseAll` + `validate(buildScenarioContext())`
3. 타이틀 활성화 (`title` 배경음). 실패하면 원인과 '다시 시도'.

### 게임 루프
- **그리기:** `requestAnimationFrame` (`renderLoop`, `bvLoop`) — 화면에 보일 때만.
- **진행:** 이동·페이드·전투 연출은 `setTimeout` 으로 끝을 보장한다. 탭이 숨겨져 rAF 가 멈춰도 게임 진행이 멈추지 않는다.
- 이동: 한 칸 165ms 보간, 걷기 프레임 교차, 키를 누르고 있으면 연속 이동. 카메라는 주인공 중심(맵 경계에서 고정).

## 상태 머신 (`gameState`)
`LOADING → TITLE → WORLD ⇄ DIALOG / MODAL / BATTLE → ENDING` (+ 어느 상태에서든 `SYSTEM`)
| 값 | 의미 | 입력 |
|---|---|---|
| `TITLE` | 타이틀 | 버튼 |
| `WORLD` | 필드 | 이동·조사·단축키 |
| `DIALOG` | 대화창 | Space/Enter/클릭 (타자 중이면 한 번에 표시) |
| `MODAL` | 메뉴·상점·저장·설정·AI 창. 열기 전 상태를 `Modal.prev` 에 기억했다가 닫을 때 되돌린다 (타이틀에서 연 설정 창 → TITLE) | 버튼, Esc, 같은 단축키로 닫기 |
| `SYSTEM` | 알림·확인 창(`uiConfirm` 등). 닫히면 직전 상태로 | ←→, Enter/Space, Esc |
| `BATTLE` | 전투 | 커맨드 버튼·숫자키 |
| `ENDING` | 엔딩 | 재시작 버튼 |

## Firebase
| Firestore 경로 | 읽기 | 쓰기 | 용도 |
|---|---|---|---|
| `saves/{uid}/slots/{auto\|1..5}` | 본인 | 본인 (슬롯 id·키 제한) | 클라우드 세이브 슬롯 |
| `saves/{uid}` | 본인 | 본인 (키 제한) | 슬롯 도입 전 단일 세이브 (읽어서 자동 저장 슬롯으로 옮김) |
| `players/{uid}` | 본인·관리자 | 본인 (키 제한, `playerId` 형식 검사·변경 불가) | 플레이어 ID |
| `scriptKeys/{keyId}` | 누구나 | 생성·삭제: 관리자 | 시나리오 복호화 키 |
| `admin/{doc}` | 관리자 | 관리자 | GitHub 토큰 (`admin/github`) |
| `config/admins` | 관리자 | 최고 관리자 | 관리자 이메일 목록 |
관리자 = 최고 관리자(`MASTER_EMAIL`) 또는 `config/admins.emails` 에 있는 계정 ([10_firebase_setup.md](10_firebase_setup.md)).

## 세이브 데이터 (version 3, 슬롯마다 한 개)
```json
{ "version": 3, "savedAt": "...",
  "player": { "name": "유진", "map": "lucen", "x": 16, "y": 20, "dir": "up", "lv": 5, "exp": 12, "nextExp": 87, "gold": 340,
              "weaponLv": 2, "armorLv": 1, "storyFlag": 2, "quests": { "main_forest": "done", "side_herb": "done", "main_north": "active" }, "vars": { "chest_forest": 1 },
              "focusQuest": "main_north", "visited": ["meadow", "hazel", "forest_road"] },
  "inventory": { "potion": 3, "hi_potion": 0, "ether": 2, "leather_armor": 1, ... },
  "party": [ { "id": "hero", "hp": 110, "mp": 40, "unlocked": true, "equip": { "weapon": "steel_sword", "armor": "cloth_armor", "accessory": "" } }, ... ] }
```
- 최대 HP·MP·공격·마력·방어·치명타율·회피율과 5스탯은 저장하지 않는다. 불러올 때 레벨·성장치·장비·대장간 강화로 다시 계산한다 (`calcMemberStats`). 그래서 밸런스를 바꾸면 기존 세이브에도 바로 반영된다.
- version 2 세이브는 장비를 캐릭터 기본 장비로 채우고 HP/MP 를 새 최대치 안으로 맞춰 읽는다.
- 퀘스트·변수는 `player` 안에 넣어, Firestore 규칙의 최상위 키 제한(`version, savedAt, player, inventory, party`)을 바꾸지 않았다.
- version 1 은 `migrateSave()` 가 변환한다.
- `party` 배열 순서가 파티 순서다. 첫 번째 합류 멤버가 리더(맵을 걷는 캐릭터).
- 같은 구조를 이 기기 `localStorage["wedge_save_{slot}"]` 와 Firestore `saves/{uid}/slots/{slot}` 에 저장한다 ([07_systems.md](07_systems.md#세이브--불러오기-)).

## 화면 모드·크기 (`js/core/display.js`)
- 내부 해상도: 가로 화면 640×480, 세로 모드 480×640 (+테두리 4px). 세로 모드로 바꾸면 `world-canvas` 480×640, `battle-canvas` 480×360 으로 **캔버스 크기 자체를 바꾸고** (`applyOrientation`), 맵 칸 크기(`View.ts` = 긴 변 640 ÷ 칸 수)와 전투 배치(`bvRelayout`)를 다시 계산한다.
- `#game-container` 에 `transform: scale(s)` 를 건다. `s` = 선택한 배율과 "창에 맞는 최대 배율" 중 작은 값 (PC 창 2배, 전체화면 4배까지). 창에 맞는 배율은 화면 아래 요소(PC 가상 패드·안내문·광고 자리)의 실제 높이를 빼고 계산한다.
- 크기를 고를 때 지금 창보다 크면 `uiAlert` 후 `fit` 으로 바꾼다 (`setDisplaySize`).
- 화면 모드는 `body` 클래스로 바꾼다: `layout-pc`, `layout-mobile-portrait`, `layout-mobile-landscape`, `portrait`, `pad-hidden`, `is-fullscreen`, `st-world`(필드 상태 — 모바일 패드 표시용, 120ms 간격으로 `gameState` 확인).
- 가상 패드는 PC 모드면 `#game-wrapper` 다음(화면 아래), 모바일 모드면 `#game-wrapper` 안(필드 위에 겹침)으로 옮긴다 (`placePad`).

## 알려진 주의점
- 버튼이 포커스를 가지면 Space 가 두 번 처리되므로 `mousedown` 기본 동작을 막는다.
- 게임 UI 함수는 `onclick="..."` 로 전역 호출한다 (일반 `<script>` 를 쓰는 이유).
- 관리자 페이지가 GitHub 에 직접 커밋하므로, 로컬 작업 전에 `git pull` 한다.
