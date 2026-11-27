# 08. 기술 구조

## 기술 스택

- HTML5 / CSS3 / Vanilla JavaScript (ES6+). 빌드 도구 없이 여러 `.js` 파일을 `<script>` 순서대로 불러온다 (전역 공유).
- 그래픽: `<canvas>` 2D에 문자 배열 도트를 `fillRect`로 그림 (`image-rendering: pixelated`)
- 사운드: Web Audio API Oscillator (square / triangle / sawtooth / sine)
- 저장: `localStorage` + (선택) Firebase Firestore 클라우드 세이브
- 시나리오: 암호화된 스크립트(`scenario/`) + Firebase 키 → 복호화 (WebCrypto AES-256-GCM). [11_scenario.md](11_scenario.md)
- 외부 에셋 없음. **예외: Firebase JS SDK 13.4.0**을 gstatic CDN에서 ES module로 불러온다. 로그인·클라우드 세이브·**시나리오 키**에 쓰이므로, 이제 SDK를 불러오지 못하면 시나리오를 풀 수 없어 게임을 시작할 수 없다.

## 실행 & 디버깅

| 방법 | 명령 |
|---|---|
| VS Code | `F5` (서버 자동 실행 + Edge/Chrome 디버그), `Ctrl+Shift+B` (서버만) |
| 로컬 서버 | `python -m http.server 8000` → http://localhost:8000 (관리자: `/admin.html`) |
| 파일로 열기 | **동작하지 않음** — 시나리오 파일을 `fetch` 할 수 없고 Firebase 로그인도 불가 |

## 파일 구조

```
index.html              게임 화면 (마크업 + 스크립트 로드 순서)
admin.html              스크립트 관리자 (마스터 전용)
css/game.css · admin.css
js/config.js            Firebase 설정, MASTER_EMAIL, GitHub 저장소, 시나리오 폴더
js/data/                sprites.js (PALETTE, SPRITES) · world.js (맵, 타일, 인카운트, START_POS) · actors.js (PARTY_DEFAULTS, ENEMIES, ITEMS)
js/core/                state.js (gameState, player, party) · audio.js · ui.js (토스트, 대화창, 스케일링) · render.js
js/scenario/            crypto.js (AES-GCM) · format.js (파서·검사기) · context.js (검사용 게임 데이터) · runtime.js (로드·장면 실행) ← 게임·관리자 공용(runtime 제외)
js/systems/             shop.js · battle.js · save.js (로컬·클라우드 세이브, 로그인 UI)
js/game/                input.js · main.js (startGame, bootScenario — 마지막 일반 스크립트)
js/firebase/game-cloud.js   게임용 Firebase module → window.cloud
js/admin/admin.js           관리자 module (Firebase + GitHub API)
scenario/               암호화된 시나리오 (관리자 페이지가 커밋)
scenario-src/           평문 시나리오 원본 (git 제외)
firestore.rules         Firestore 보안 규칙 원본 (콘솔에 게시해야 적용)
```

### 스크립트 로드 순서 (`index.html`)
`config → data/sprites → data/world → data/actors → core/state → core/audio → core/ui → core/render → scenario/crypto → scenario/format → scenario/context → scenario/runtime → systems/shop → systems/battle → systems/save → game/input → game/main → (module) firebase/game-cloud`

- 일반 스크립트끼리는 전역(`let`/`const`/`function`)을 공유한다. 다른 파일의 함수는 **호출 시점**에만 정의되어 있으면 되므로, 순서는 "최상위에서 바로 실행되는 코드"가 쓰는 것만 맞추면 된다.
- 새 파일을 추가하면 `index.html`(관리자에서도 쓰면 `admin.html`)의 `<script>` 목록과 이 표를 갱신한다.

### 부팅 흐름
1. `main.js` → `bootScenario()` : 타이틀 버튼 비활성화, "시나리오를 불러오는 중"
2. `runtime.js` → `loadScenario()` : `scenario/manifest.json` + 암호 파일 받기 → `waitForCloud()` → `cloud.getScriptKey(keyId)` → 복호화 → `ScenarioFormat.parseAll` + `validate`
3. 성공하면 `@text title_desc` 를 타이틀에 표시하고 버튼 활성화. 실패하면 원인과 `다시 시도` 버튼 표시

## 배포 (GitHub Pages) ✅

| 항목 | 내용 |
|---|---|
| 주소 | https://leha82.github.io/isekai-jrpg/ |
| 방식 | 브랜치 배포 — `main` 브랜치 루트(`/`) |
| 반영 | `main`에 push하면 GitHub Actions의 `pages build and deployment`가 자동 실행되고, 보통 1~2분 뒤 반영됨 |
| `.nojekyll` | Jekyll 변환을 건너뛰고 파일을 그대로 서비스함 (빌드가 빠르고 md 파일이 html로 변환되지 않음) |
| 설정 위치 | GitHub 저장소 → Settings → Pages → Build and deployment |
| 배포 확인 | 저장소 Actions 탭 또는 `https://api.github.com/repos/leha82/isekai-jrpg/actions/runs` |

- 저장소 전체가 공개 파일로 서비스된다 (예: `/docs/02_world.md`). 공개하면 안 되는 파일은 저장소에 넣지 않는다.
- 배포 파일을 `index.html`만으로 제한하려면 Settings → Pages의 Source를 **GitHub Actions**로 바꾸고, `actions/upload-pages-artifact` + `actions/deploy-pages` 워크플로를 추가한다. 💡
- 게임 세이브(`localStorage`)는 도메인 기준으로 저장된다. 로컬(`localhost`)과 배포 사이트의 세이브는 서로 공유되지 않는다.

## 주요 식별자 (파일별)

| 파일 | 주요 식별자 |
|---|---|
| `core/audio.js` | `initAudio`, `playTone`, `SFX`, `setBGM`, `toggleAudio` |
| `core/ui.js` | `showToast`, `startDialog`, `advanceDialog`, `fitGameToScreen` |
| `core/render.js` | `drawSprite`, `renderWorld`, `updateHUD` |
| `scenario/runtime.js` | `SCN`, `loadScenario`, `waitForCloud`, `runScene`, `runSteps`, `execScenarioCommand`, `checkTileEvent`, `scenarioQuestText`, `scenarioEventSprites`, `scnText`, `showEnding` |
| `scenario/format.js` | `ScenarioFormat.parseAll / validate / evalCondition / COMMAND_HELP` |
| `scenario/crypto.js` | `ScenarioCrypto.newKey / encryptText / decryptText` |
| `systems/shop.js` | `openTownShop`, `applyGearUpgrade`, `useInn`, `buyItem`, `upgradeGear`, `openInventory`, `useFieldItem`, `closeModal` |
| `systems/battle.js` | `triggerRandomEncounter`, `startBattle(enemyId, isBoss, winScene)`, `nextAllyTurn`, `execSkill`, `enemyTurn`, `checkLevelUp`, `endBattle` |
| `systems/save.js` | `saveGame(isAuto, toCloud)`, `readSave`, `applySaveData`, `manualSave`, `manualLoad`, `continueGame`, `latestSave`, `cloudSave`, `onCloudAuthChanged`, `updateAuthUI`, `toggleLogin` |
| `game/input.js` | `movePlayer`, `handleActionKey`, keydown 핸들러 |
| `game/main.js` | `startGame`, `bootScenario` |
| `firebase/game-cloud.js` | `window.cloud = { signIn, signOut, load, save, getScriptKey }`, `cloud-ready` 이벤트 |

### Firebase 연결 구조

- 게임 본체(일반 `<script>`)는 Firebase를 직접 import하지 않는다. `game-cloud.js`(module)가 SDK를 불러와 `window.cloud` 객체만 노출하고, `cloud-ready` 이벤트를 보낸 뒤 `onAuthStateChanged` → `onCloudAuthChanged(user)`로 로그인 상태를 알린다.
- module 스크립트는 지연 실행되므로 본체 함수가 모두 정의된 다음에 실행된다. SDK import가 실패하면 module 전체가 실행되지 않고, `load` 이벤트에서 `window.cloud`가 없음을 확인해 UI를 '사용 불가'로 바꾼다.
- `FIREBASE_CONFIG`(apiKey 포함, `js/config.js`)는 공개되는 식별자라 비밀이 아니다. 접근 제어는 [`firestore.rules`](../firestore.rules)가 담당한다. 규칙을 바꾸면 Firebase 콘솔 → Firestore → 규칙에 **다시 게시**해야 반영된다.

| Firestore 경로 | 읽기 | 쓰기 | 용도 |
|---|---|---|---|
| `saves/{uid}` | 본인 | 본인 (키 제한) | 클라우드 세이브 |
| `scriptKeys/{keyId}` | 누구나 | 생성·삭제: 마스터 / 수정: 불가 | 시나리오 복호화 키 |
| `admin/{doc}` | 마스터 | 마스터 | GitHub 토큰 (`admin/github`) |
- Firestore 문서 `saves/{uid}`의 내용은 아래 세이브 데이터 포맷과 같다. 보안 규칙이 최상위 키를 `version, savedAt, player, inventory, party`로 제한하므로, **최상위 키를 추가하면 규칙도 함께 수정**해야 한다.

## 상태 머신 (`gameState`)

```
TITLE ──startGame/continueGame──▶ WORLD ◀──────────────┐
                                   │ │ │                 │
                 이벤트 대화 ◀─────┘ │ └──▶ MODAL (상점/가방) ──닫기──┘
                 DIALOG ──종료──▶ WORLD    │
                                     └──▶ BATTLE ──승리/도망/전멸──▶ WORLD
                                               └──win=장면 승리──▶ DIALOG ──▶ (> ending) ENDING
```

| 값 | 의미 | 입력 |
|---|---|---|
| `TITLE` | 타이틀 오버레이 | 버튼만 |
| `WORLD` | 필드 이동 | 이동, 조사, 가방, 저장/불러오기 |
| `DIALOG` | 대화창 | Space/Enter/클릭으로 다음 |
| `MODAL` | 상점 또는 가방 (원본 기획서의 `SHOP_INV`) | 버튼, Esc |
| `BATTLE` | 전투 | 커맨드 버튼 |
| `ENDING` | 엔딩 오버레이 | 재시작 버튼 |

## 데이터 구조

```javascript
let player = {
  x: 2, y: 6, lv: 1, exp: 0, nextExp: 20, gold: 60,
  weaponLv: 1, armorLv: 1, storyFlag: 0,   // 0:시작 1:리아 2:가렌 3:클리어
  inventory: { potion: 2, ether: 1 }
};
let party = [ // 능력치는 멤버별로 관리
  { id: "hero",   name: "유진", role, sprite, hp, maxHp, mp, maxMp, atk, matk, def, unlocked: true },
  { id: "elf",    name: "리아", ..., unlocked: false },
  { id: "knight", name: "가렌", ..., unlocked: false }
];
```

## 세이브 데이터 포맷

키 `arcadia_isekai_jrpg_save_v1`, JSON 문자열:

```json
{
  "version": 1,
  "savedAt": "2026-11-27T12:00:00.000Z",
  "player": { "x": 2, "y": 6, "lv": 1, "exp": 0, "nextExp": 20, "gold": 60,
              "weaponLv": 1, "armorLv": 1, "storyFlag": 0 },
  "inventory": { "potion": 2, "ether": 1 },
  "party": [
    { "id": "hero", "hp": 55, "maxHp": 55, "mp": 25, "maxMp": 25,
      "atk": 12, "matk": 18, "def": 4, "unlocked": true },
    { "id": "elf", "...": "..." },
    { "id": "knight", "...": "..." }
  ]
}
```

- 원본 기획서의 `saveData` 예시(주인공 스탯만 저장하고 파티는 합류 여부만 저장)와 다르다. 실제 코드는 **멤버별 능력치를 모두 저장**한다. 레벨업과 장비 강화가 멤버마다 따로 반영되기 때문이다.
- 저장 필드 목록은 `PLAYER_SAVE_FIELDS`, `PARTY_SAVE_FIELDS` 상수로 관리한다. 필드를 추가해도 예전 세이브는 기본값으로 불러온다.
- 구조를 호환되지 않게 바꾸면 `SAVE_VERSION`을 올리고, 변환 로직을 넣거나 키를 `_v2`로 바꾼다.

## 그래픽 엔진

- 스프라이트는 폭 16의 문자열 배열이다. 각 문자가 `PALETTE`의 색 하나에 대응한다.
- 행이 16개보다 적으면 세로 가운데에 정렬해 그린다.

| 문자 | 색 | 용도 | 문자 | 색 | 용도 |
|---|---|---|---|---|---|
| `.` | 투명 | — | `G` | #16a34a | 녹색 |
| `K` | #111111 | 검정/윤곽 | `L` | #86efac | 연녹색 |
| `W` | #ffffff | 흰색 | `Y` | #facc15 | 노랑/금발 |
| `S` | #ffccaa | 피부 | `P` | #9333ea | 보라 |
| `H` | #3b2f2f | 머리카락 | `C` | #64748b | 강철 회색 |
| `B` | #2563eb | 파랑 | `T` | #78350f | 갈색 |
| `R` | #dc2626 | 빨강 | `A` | #38bdf8 | 하늘색 |

## 사운드 엔진

- `AudioContext`는 사용자가 처음 클릭하거나 키를 누를 때 생성·resume한다 (브라우저 자동재생 정책). 생성에 실패하면 무음으로 진행한다.
- `playTone`은 컨텍스트가 `running`일 때만 재생하고, 호출마다 try/catch로 감싼다.
- BGM: `FIELD`(삼각파, 310ms 간격), `BATTLE`(톱니파, 170ms 간격) 16음 루프.
- 효과음: `step`, `hit`, `magic`, `heal`, `coin`, `levelup`.

## 반응형

- 게임 화면은 내부 해상도 640x480(+테두리)로 고정하고, `fitGameToScreen()`이 창 너비와 높이에 맞춰 `transform: scale()`로 줄인다 (최소 0.35배).
- 너비 480px 이하에서는 하단 가상 패드를 압축 배치한다.

## 알려진 주의점

- 마우스로 누른 버튼에 포커스가 남으면 Space 입력이 두 번 처리될 수 있다. 그래서 버튼의 `mousedown` 기본 동작을 막아 포커스가 가지 않게 했다.
- 게임 UI 함수는 전역(`onclick="..."`)에서 호출된다. 일반 `<script>` 로 불러오는 이유이며, ES module 로 바꾸려면 `window`에 노출해야 한다.
- 관리자 페이지가 GitHub 에 직접 커밋하므로, 로컬 작업 전에 `git pull` 한다.
