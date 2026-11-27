# 11. 시나리오 스크립트 & 관리자 페이지

대화, 맵 이벤트, 스토리 진행, 목표 문구는 코드가 아니라 **시나리오 스크립트(`.script`)**로 관리한다. ✅ (2026-11-27)

## 전체 구조

```
[로컬 PC]                                  [GitHub 저장소 · 공개]              [Firebase]
scenario-src/*.script  ── 관리자 페이지 ──▶  scenario/manifest.json             scriptKeys/{keyId}
(평문, git 제외)          가져오기·편집      scenario/*.script.enc.json          (복호화 키, 누구나 읽기
                         → 새 키로 암호화    (AES-256-GCM 암호문만)               생성·삭제는 마스터만)
                         → GitHub 커밋                                           admin/github
                                                                                 (GitHub 토큰, 마스터만)
게임(index.html): manifest + 암호문 받기 → scriptKeys/{keyId} 로 복호화 → 파싱·검사 → 실행
```

| 위치 | 내용 | GitHub 공개 |
|---|---|---|
| `scenario-src/` | 평문 스크립트 원본 (작업용) | ❌ `.gitignore` 로 제외 |
| `scenario/` | 암호화본 + `manifest.json` (파일 목록·현재 keyId) | ✅ 암호문만 |
| Firebase `scriptKeys` | 키 (저장할 때마다 새 키, 최근 3개만 보관 — `🗑 이전 키 삭제` 로 현재 키만 남길 수 있음) | — |
| `admin.html` | 스크립트 편집기 (마스터 전용) | 페이지 파일은 공개, 기능은 마스터만 |

### 보안 수준 (꼭 알아둘 것)
- **GitHub 저장소만 봐서는 스크립트를 읽을 수 없다.** 키가 저장소에 없기 때문이다.
- **수정은 마스터만 가능하다.** 키 등록·GitHub 토큰 읽기가 Firestore 보안 규칙에서 마스터 계정으로 제한되어, 화면 조작으로 우회할 수 없다.
- 단, 게임이 대사를 보여주려면 플레이어 브라우저가 키를 받아 복호화해야 하므로 **키는 누구나 읽을 수 있다.** 작정한 플레이어가 개발자 도구로 대사를 보는 것까지는 막지 못한다. (모든 웹 게임의 공통 한계)
- 이 저장소의 이전 커밋 기록에는 예전 `index.html`·`docs/03_story.md` 의 대사가 평문으로 남아 있다.

## 파일 구성 (`scenario-src/`)

파일 이름 순서대로 읽어서 하나로 합친다. 블록은 어느 파일에 있어도 되므로 파일은 내용별로 자유롭게 나눈다.
파일 이름은 영문·숫자·`_`·`-` + `.script`.

| 파일 | 내용 |
|---|---|
| `00_system.script` | 타이틀·엔딩 문구(`@text`), 새 게임 인트로(`intro`), 전멸(`party_wiped`) |
| `01_quests.script` | 퀘스트 정의 (`@quest`) |
| `10_meadow_hazel.script` | 초원·하젤 마을·촌장의 집 이벤트와 대화 |
| `20_forest_elbrea.script` | 숲길·엘브레아 (1장, 리아 합류) |
| `30_lucen.script` | 왕도 루센·알현실 (2장, 가렌 합류) |
| `40_north.script` | 그롬 산길·서리 평원·녹턴 요새 (3장) |
| `90_finale.script` | 오르벨·엔딩 |

## 문법

```
# 주석 (줄 맨 앞 #)

@scene 장면id                       ← 대사·명령 묶음
화자: 대사                           ← 대화 한 줄. 첫 ": " 앞이 화자. {hero} = 주인공 이름
  들여쓴 줄                          ← 바로 앞 대사에 줄바꿈으로 이어 붙음 (
 도 가능)
> 명령 인자...                       ← 명령 (아래 표)
? 조건 -> 장면id                     ← 조건이 맞으면 그 장면으로 이동하고 현재 장면 종료
-> 장면id                            ← 무조건 이동

@event 이벤트id 맵id:x,y 이름          ← 맵 이벤트. 내용 문법은 @scene 과 같음
* sprite 캐릭터키 [when 조건]          ← 맵에 그릴 NPC (조건이 맞을 때만). NPC 칸은 지나갈 수 없다
* tile 타일id [when 조건]              ← 그 칸의 오브젝트를 바꿔 그림 (예: 열린 상자)
* trigger talk | touch | enter         ← talk: 마주 보고 Space / touch: 밟으면 실행
                                         enter: 출구를 통해 이 맵에 들어올 때 실행 (좌표 무관, 맵마다 조건이 맞는 첫 이벤트 하나)
                                         (기본값: sprite 가 있으면 talk, 없으면 touch)
* when 조건                            ← 조건이 맞을 때만 이벤트가 동작 (말 걸기·밟기·진입 모두). 안 맞으면 NPC 도 보이지 않음
* face down|up|left|right              ← NPC 기본 방향 (말을 걸면 주인공 쪽을 본다)

@quest 퀘스트id main|side 제목          ← 퀘스트 정의. 다음 줄부터 설명 (HUD·퀘스트 메뉴에 표시)

@text 키                              ← 화면 문구: title_desc, ending_title, ending_body
문구 (여러 줄 가능)
```

- 연속된 대사는 대화창 하나로 이어서 나오고, 대화가 끝난 뒤 다음 명령이 실행된다.
- 명령은 위에서 아래로 순서대로 실행된다. 대사 앞에 둔 명령은 대화창이 뜨기 전에 실행된다.
- 계산대(`counter` 타일) 너머의 NPC 에게도 말을 걸 수 있다.
- 필수 장면: `intro` (새 게임 시작), `party_wiped` (전멸 후 — 부활 위치 이동·회복은 게임이 먼저 처리)
- 화자 이름은 `?` 로 시작하면 안 된다 (`? 조건 -> 장면` 으로 읽힌다). 모르는 사람은 `누군가의 목소리:` 처럼 쓴다.
- 맵 진입 이벤트 예 (한 번만 실행):
  ```
  @event hazel_tobi_arrive hazel:1,1 토비의 귀가
  * trigger enter
  * when joined tobi and !quest main_village done
  -> hazel_tobi_home
  ```
- 맵 출구(`data/maps/*.json` 의 `warps`)에 `fail` 로 지정한 장면도 시나리오에 있어야 한다.

### 조건

| 조건 | 예 |
|---|---|
| 비교 (`== != >= <= > <`) | `flag == 1`, `lv >= 4`, `gold >= 100`, `weapon >= 2`, `armor < 3` |
| 변수 | `var chest_forest == 1` (`> set` 으로 설정, 없으면 0) |
| 파티 합류 여부 | `joined ria`, `!joined garen` (`not joined` 도 가능) |
| 퀘스트 상태 | `quest side_herb active`, `quest main_forest done`, `!quest side_pendant none` |
| 아이템 개수 | `item potion >= 1` |
| 여러 조건 | `flag == 2 and lv >= 4` |

### 명령

| 명령 | 효과 |
|---|---|
| `> flag N` | 스토리 플래그 설정 |
| `> set 변수 N` | 변수 설정 (상자 열림·일회성 이벤트 등) |
| `> join ID` / `> leave ID` | 파티 합류 / 이탈 (`hero`, `tobi`, `ria`, `garen`; 주인공은 이탈 불가) |
| `> quest start ID` / `> quest done ID` | 퀘스트 시작 / 완료 (알림 표시) |
| `> heal` | 파티 전원 HP·MP 완전 회복 |
| `> sfx ID` / `> bgm ID` | 효과음 / 배경음 (`data/audio.json` 의 id — 관리자 '리소스' 탭) |
| `> save` | 자동 저장 (로그인 시 클라우드에도) |
| `> weapon +N` / `> armor +N` | 파티 무기·방어구 N단계 무료 강화 (대장간 강화와 같음. 캐릭터별 장비와는 별개) |
| `> gold ±N` / `> exp +N` | 골드 증감 (0 미만 불가) / 경험치 (레벨업 처리) |
| `> item ID ±N` | 아이템 증감 (`data/items.json` 의 id) |
| `> move X,Y [방향]` | 같은 맵 안에서 위치 이동 |
| `> warp 맵ID X,Y [방향]` | 다른 맵으로 이동 (페이드) — **장면 종료** |
| `> goto 장면id` | 다른 장면으로 이동 (`-> 장면id` 와 같음) |
| `> shop 상점ID` | 상점 열기 (`data/items.json` 의 shops) — **장면 종료** |
| `> battle 적1,적2,적3 [boss] [win=장면id]` | 전투 (1~3마리) — **장면 종료**. `boss`: 도망 불가·보스 음악·승리 자동저장 없음. `win=`: 승리 후 장면 |
| `> ending` | 엔딩 화면 (`@text ending_title`, `ending_body`) — **장면 종료** |

id 목록 — 파티·스프라이트: [04_characters.md](04_characters.md), 적: [06_monsters.md](06_monsters.md), 맵: [02_world.md](02_world.md), 아이템·상점: [07_systems.md](07_systems.md), 타일·음원: 관리자 '리소스' 탭.

### 검사 (관리자 페이지·게임 로드 시 공통)
- **오류 (저장 불가):** 문법 오류, 없는 장면·맵·파티원·적·아이템·상점·퀘스트·스프라이트·타일·음원 참조, id 중복, 같은 칸 이벤트 2개, 맵 밖 좌표, 지나갈 수 없는 워프 도착지, 필수 장면·출구 fail 장면 누락
- **경고 (저장 가능):** 호출되지 않는 장면, 막힌 칸의 밟기 이벤트, `@text` 누락

## 관리자 페이지 (`admin.html`)

| 항목 | 내용 |
|---|---|
| 주소 | https://leha82.github.io/isekai-jrpg/admin.html (게임에서 링크하지 않음, 검색 제외) · 로컬은 VS Code F5 후 `localhost:8000/admin.html` |
| 접근 | Google 로그인 → Firestore `admin/github` 읽기로 서버 권한 확인 (최고 관리자 또는 지정된 관리자). 아니면 "권한 없음" — 메뉴 전체는 [13_admin.md](13_admin.md) |
| 파일로 직접 열기 | 동작하지 않음 (Firebase 로그인·모듈 로드 불가) |
| 편집 | 파일 목록, 줄 번호 편집기, 실시간 검사(클릭하면 해당 줄로 이동), 문법 도움말, `Ctrl+S` 저장 |
| 파일 관리 | 새 파일, 이름 변경, 삭제, 📥 파일 가져오기, 📁 폴더 가져오기(`scenario-src` 통째로), 📤 내보내기 |
| 저장 | `🔒 암호화 저장 & 업로드` — 오류가 있으면 막힘 |

### 저장할 때 일어나는 일
1. GitHub 토큰 권한 확인
2. 새 AES-256 키 생성 → Firebase `scriptKeys/{새 keyId}` 등록
3. **모든** 스크립트를 새 키로 암호화 (파일 이름을 인증 데이터로 묶음)
4. `scenario/*.enc.json` + `manifest.json` 을 커밋 1개로 GitHub `main` 에 푸시 (지운 파일은 삭제)
5. 최근 3개 + 직전 키만 남기고 오래된 키 삭제 (GitHub Pages 반영 지연 1~2분 동안 이전 파일도 풀리도록)

반영이 끝난 뒤 이전 키까지 지우려면 사이드바 `저장소` 의 **🗑 이전 키 삭제** 를 누른다. 저장소 `manifest.json` 의 현재 키가 불러온 키와 같은지 확인한 뒤, 그 키 하나만 남기고 `scriptKeys` 를 모두 삭제한다 (관리자 권한 필요).

### GitHub 토큰 (최초 1회)
GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → 저장소 `isekai-jrpg` 만 선택 → Repository permissions **Contents: Read and write** → 관리자 페이지에 붙여 넣기.
토큰은 Firestore `admin/github` 에 저장되며 마스터만 읽을 수 있다. 만료되면 `GitHub 토큰 변경`.

## 작업 흐름

### 관리자 페이지에서 직접 수정
로그인 → 수정 → `🔒 암호화 저장 & 업로드` → 1~2분 뒤 게임에 반영.

### Claude(로컬)와 함께 수정
1. (관리자 페이지에서 고친 적이 있으면) `📤 전체 내보내기` → 받은 파일을 `scenario-src/` 에 덮어쓰기
2. Claude 가 `scenario-src/*.script` 수정 + 로컬 검사
3. 관리자 페이지 → `📁 폴더 가져오기` 로 `scenario-src` 선택 → 검사 확인 → `🔒 암호화 저장 & 업로드`
4. 관리자 페이지가 GitHub 에 직접 커밋하므로, 로컬에서 다음 작업 전에 `git pull` 필요

## 게임 로드 실패 메시지

| 메시지 | 원인 / 해결 |
|---|---|
| 시나리오가 아직 업로드되지 않았습니다 | `scenario/manifest.json` 없음 → 관리자 페이지에서 저장 |
| 복호화 키를 받지 못했습니다 | Firebase 에 해당 keyId 없음, 또는 보안 규칙 미게시 → 규칙 게시 후 관리자 페이지에서 다시 저장 |
| 스크립트 오류 N건 | 저장 후 게임 데이터(적 id 등)가 바뀌어 참조가 깨짐 → 관리자 페이지에서 검사·수정 |
| 파일로 직접 열면 시나리오를 불러올 수 없습니다 | `index.html` 더블클릭 → F5(localhost) 또는 배포 사이트 사용 |
