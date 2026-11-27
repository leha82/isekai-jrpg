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
| Firebase `scriptKeys` | 키 (저장할 때마다 새 키, 최근 3개만 보관) | — |
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
| `01_quests.script` | HUD 현재 목표 (`@quest`) |
| `02_events.script` | 맵 이벤트 — 좌표·NPC 스프라이트·분기 (`@event`) |
| `10_ch1_elf_forest.script` | 1장 리아 합류, 성소 회복 |
| `20_ch2_kingdom.script` | 2장 근위병, 가렌 합류 |
| `30_ch3_demon_castle.script` | 3장 결계, 마왕 대면·보스전 |
| `90_ending.script` | 엔딩 장면 |

## 문법

```
# 주석 (줄 맨 앞 #)

@scene 장면id                    ← 대사·명령 묶음
화자: 대사                        ← 대화 한 줄. 첫 ": " 앞이 화자
  들여쓴 줄                       ← 바로 앞 대사에 줄바꿈으로 이어 붙음 (\n 도 가능)
> 명령 인자...                    ← 명령 (아래 표)
? 조건 -> 장면id                  ← 조건이 맞으면 그 장면으로 이동하고 현재 장면 종료
-> 장면id                         ← 무조건 이동

@event 이벤트id x,y 장소이름       ← 맵 좌표 이벤트. 내용 문법은 @scene 과 같음
* sprite 스프라이트키 [when 조건]  ← 맵에 그릴 NPC (조건이 맞을 때만)

@quest N                         ← 스토리 플래그가 N 이상일 때 HUD 목표 (가장 큰 N 사용)
목표 문구

@text 키                          ← 화면 문구: title_desc, ending_title, ending_body
문구 (여러 줄 가능)
```

- 연속된 대사는 대화창 하나로 이어서 나오고, 대화가 끝난 뒤 다음 명령이 실행된다.
- 명령은 위에서 아래로 순서대로 실행된다. 대사 앞에 둔 명령은 대화창이 뜨기 전에 실행된다.
- 필수 장면: `intro` (새 게임 시작), `party_wiped` (전멸 후 — 시작 위치 이동·회복은 게임이 먼저 처리)

### 조건

| 조건 | 예 |
|---|---|
| 비교 (`== != >= <= > <`) | `flag == 1`, `lv >= 4`, `gold >= 100`, `weapon >= 2`, `armor < 3` |
| 파티 합류 여부 | `joined elf`, `!joined knight` (`not joined` 도 가능) |
| 아이템 개수 | `item potion >= 1` |
| 여러 조건 | `flag == 2 and lv >= 4` |

### 명령

| 명령 | 효과 |
|---|---|
| `> flag N` | 스토리 플래그 설정 |
| `> join ID` / `> leave ID` | 파티 합류 / 이탈 (`hero`, `elf`, `knight`; 주인공은 이탈 불가) |
| `> heal` | 파티 전원 HP·MP 완전 회복 |
| `> sfx 이름` | 효과음 (`step`, `hit`, `magic`, `heal`, `coin`, `levelup`) |
| `> bgm field` / `> bgm battle` | 배경음 |
| `> save` | 자동 저장 (로그인 시 클라우드에도) |
| `> weapon +N` / `> armor +N` | 파티 무기·방어구 N단계 무료 강화 |
| `> gold ±N` / `> exp +N` | 골드 증감 (0 미만 불가) / 경험치 (레벨업 처리) |
| `> item ID ±N` | 아이템 증감 (`potion`, `ether`) |
| `> move X,Y` | 플레이어 위치 이동 |
| `> goto 장면id` | 다른 장면으로 이동 (`-> 장면id` 와 같음) |
| `> shop 이름` | 상점 열기 — **장면 종료** |
| `> battle 적id [boss] [win=장면id]` | 전투 — **장면 종료**. `boss`: 도망 불가·승리 자동저장 없음. `win=`: 승리 후 실행할 장면 |
| `> ending` | 엔딩 화면 (`@text ending_title`, `ending_body`) — **장면 종료** |

id 목록 — 파티: [04_characters.md](04_characters.md), 적: [06_monsters.md](06_monsters.md), 스프라이트: `js/data/sprites.js`.

### 검사 (관리자 페이지·게임 로드 시 공통)
- **오류 (저장 불가):** 문법 오류, 없는 장면·파티원·적·아이템·스프라이트 참조, 장면/이벤트 id 중복, 같은 좌표 이벤트 2개, 맵 밖 좌표, 필수 장면 누락
- **경고 (저장 가능):** 호출되지 않는 장면, 지나갈 수 없는 타일 위 이벤트, `@text`/`@quest 0` 누락

## 관리자 페이지 (`admin.html`)

| 항목 | 내용 |
|---|---|
| 주소 | https://leha82.github.io/isekai-jrpg/admin.html (게임에서 링크하지 않음, 검색 제외) · 로컬은 VS Code F5 후 `localhost:8000/admin.html` |
| 접근 | Google 로그인 → `MASTER_EMAIL`(`js/config.js`) 확인 → Firestore `admin/github` 읽기로 서버 권한 확인. 마스터가 아니면 "권한 없음" |
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
