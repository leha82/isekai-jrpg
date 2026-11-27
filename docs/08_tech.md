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
js/core/                assets.js (데이터·이미지 로더, 시트 좌표) · state.js (상태·파티·레벨업·장비) · audio.js (MP3 BGM/SFX) · ui.js (토스트·대화창·창·이름 입력·스케일링)
js/scenario/            crypto.js (AES-GCM) · format.js (파서·검사기) · context.js (검사용 데이터 목록) · runtime.js (로드·장면 실행·퀘스트·엔딩)
js/world/world.js       맵 렌더링(카메라·타일 애니메이션)·이동·상호작용·워프·인카운트
js/systems/             hud.js (HUD·메뉴) · shop.js · battle.js (전투 로직) · battle-view.js (전투 캔버스 연출) · save.js
js/game/                input.js (키보드·가상 패드) · main.js (부팅·타이틀·새 게임)
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
`config → core/assets → core/state → core/audio → core/ui → scenario/crypto → format → context → runtime → world/world → systems/hud → shop → battle-view → battle → save → game/input → game/main → (module) firebase/game-cloud`
- 일반 스크립트끼리 전역을 공유한다. 최상위에서 바로 실행되는 코드가 쓰는 것만 앞에 있으면 된다.
- 파일을 추가하면 `index.html`(관리자에서도 쓰면 `admin.html`)과 이 표를 갱신한다.

### 부팅 흐름
1. `main.js boot()` → `loadGameData()` (data JSON 9개 + 맵 12개 + 이미지) → 진행률 표시
2. `loadScenario()` → 암호 파일 + 복호화 키(Firestore REST 로 `scriptKeys/{keyId}` 공개 읽기 — SDK 불필요) → 복호화 → `parseAll` + `validate(buildScenarioContext())`
3. 타이틀 활성화 (`title` 배경음). 실패하면 원인과 '다시 시도'.

### 게임 루프
- **그리기:** `requestAnimationFrame` (`renderLoop`, `bvLoop`) — 화면에 보일 때만.
- **진행:** 이동·페이드·전투 연출은 `setTimeout` 으로 끝을 보장한다. 탭이 숨겨져 rAF 가 멈춰도 게임 진행이 멈추지 않는다.
- 이동: 한 칸 165ms 보간, 걷기 프레임 교차, 키를 누르고 있으면 연속 이동. 카메라는 주인공 중심(맵 경계에서 고정).

## 상태 머신 (`gameState`)
`LOADING → TITLE → WORLD ⇄ DIALOG / MODAL / BATTLE → ENDING`
| 값 | 의미 | 입력 |
|---|---|---|
| `TITLE` | 타이틀 | 버튼 |
| `WORLD` | 필드 | 이동·조사·메뉴 |
| `DIALOG` | 대화창 | Space/Enter/클릭 (타자 중이면 한 번에 표시) |
| `MODAL` | 메뉴·상점 | 버튼, Esc |
| `BATTLE` | 전투 | 커맨드 버튼·숫자키 |
| `ENDING` | 엔딩 | 재시작 버튼 |

## Firebase
| Firestore 경로 | 읽기 | 쓰기 | 용도 |
|---|---|---|---|
| `saves/{uid}` | 본인 | 본인 (키 제한) | 클라우드 세이브 |
| `scriptKeys/{keyId}` | 누구나 | 생성·삭제: 관리자 | 시나리오 복호화 키 |
| `admin/{doc}` | 관리자 | 관리자 | GitHub 토큰 (`admin/github`) |
| `config/admins` | 관리자 | 최고 관리자 | 관리자 이메일 목록 |
관리자 = 최고 관리자(`MASTER_EMAIL`) 또는 `config/admins.emails` 에 있는 계정 ([10_firebase_setup.md](10_firebase_setup.md)).

## 세이브 데이터 (version 2)
```json
{ "version": 2, "savedAt": "...",
  "player": { "name": "유진", "map": "lucen", "x": 16, "y": 20, "dir": "up", "lv": 5, "exp": 12, "nextExp": 87, "gold": 340,
              "weaponLv": 2, "armorLv": 1, "storyFlag": 2, "quests": { "main_forest": "done", "side_herb": "done", "main_north": "active" }, "vars": { "chest_forest": 1 } },
  "inventory": { "potion": 3, "hi_potion": 0, "ether": 2, "herb": 0, "pendant": 0 },
  "party": [ { "id": "hero", "hp": 110, "maxHp": 120, "mp": 40, "maxMp": 45, "atk": 28, "matk": 38, "def": 12, "unlocked": true }, ... ] }
```
- 퀘스트·변수는 `player` 안에 넣어, Firestore 규칙의 최상위 키 제한(`version, savedAt, player, inventory, party`)을 바꾸지 않았다.
- version 1 은 `migrateSave()` 가 변환한다.

## 알려진 주의점
- 버튼이 포커스를 가지면 Space 가 두 번 처리되므로 `mousedown` 기본 동작을 막는다.
- 게임 UI 함수는 `onclick="..."` 로 전역 호출한다 (일반 `<script>` 를 쓰는 이유).
- 관리자 페이지가 GitHub 에 직접 커밋하므로, 로컬 작업 전에 `git pull` 한다.
