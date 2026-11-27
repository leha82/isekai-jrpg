# 08. 기술 구조

## 기술 스택

- HTML5 / CSS3 / Vanilla JavaScript (ES6+), 단일 파일 `index.html`
- 그래픽: `<canvas>` 2D에 문자 배열 도트를 `fillRect`로 그림 (`image-rendering: pixelated`)
- 사운드: Web Audio API Oscillator (square / triangle / sawtooth / sine)
- 저장: `localStorage`
- 외부 라이브러리·에셋·빌드 도구 없음

## 실행 & 디버깅

| 방법 | 명령 |
|---|---|
| 파일로 열기 | `index.html` 더블클릭 |
| 로컬 서버 | `python -m http.server 8000` → http://localhost:8000 |
| VS Code | `Ctrl+Shift+B` (서버), `F5` (Edge/Chrome 디버그) |

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

## index.html 코드 구조 (`<script>` 섹션 번호)

| # | 섹션 | 주요 식별자 |
|---|---|---|
| 1 | 8비트 사운드 엔진 | `initAudio`, `playTone`, `SFX`, `setBGM`, `toggleAudio` |
| 2 | 도트 스프라이트 | `PALETTE`, `SPRITES` |
| 3 | 월드맵 | `MAP_W`, `MAP_H`, `WORLD_MAP`, `LOCATIONS` |
| 4 | 게임 상태 | `gameState`, `player`, `party`, `currentEnemy` |
| 5 | 렌더링 & HUD | `drawSprite`, `renderWorld`, `updateHUD` |
| 6 | 상점 & 인벤토리 | `openTownShop`, `useInn`, `buyItem`, `upgradeGear`, `openInventory`, `useFieldItem` |
| 7 | 스토리 & 이벤트 | `startDialog`, `advanceDialog`, `startGame`, `checkTileEvent` |
| 8 | 턴제 전투 | `triggerRandomEncounter`, `startBattle`, `nextAllyTurn`, `execSkill`, `enemyTurn`, `checkLevelUp`, `endBattle`, `triggerEnding` |
| 9 | 입력 처리 | `movePlayer`, `handleActionKey`, keydown 핸들러, 버튼 포커스 방지 |
| 10 | 세이브/불러오기 | `SAVE_KEY`, `saveGame`, `readSave`, `applySaveData`, `manualSave`, `manualLoad`, `continueGame`, `showToast` |
| 11 | 반응형 스케일링 | `fitGameToScreen` |

## 상태 머신 (`gameState`)

```
TITLE ──startGame/continueGame──▶ WORLD ◀──────────────┐
                                   │ │ │                 │
                 이벤트 대화 ◀─────┘ │ └──▶ MODAL (상점/가방) ──닫기──┘
                 DIALOG ──종료──▶ WORLD    │
                                     └──▶ BATTLE ──승리/도망/전멸──▶ WORLD
                                               └──보스 승리──▶ DIALOG ──▶ ENDING
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
- 모든 UI 함수는 전역(`onclick="..."`)에서 호출된다. 파일을 모듈로 나눌 때는 `window`에 노출해야 한다.
