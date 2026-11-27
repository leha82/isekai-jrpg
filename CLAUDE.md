# 아르카디아 연대기 (isekai-jrpg)

빌드 도구·외부 의존성이 없는 단일 파일 HTML5 JRPG. 모든 코드는 `index.html` 한 파일에 있다.

## 기획 문서
`docs/` 폴더에서 주제별로 관리한다. 작업 전에 관련 문서를 먼저 읽는다.
- `docs/README.md` — 문서 목록과 운영 규칙
- 컨셉 01, 세계관·맵 02, 스토리 03, 캐릭터 04, 전투 05, 몬스터 06, 시스템(성장·상점·세이브) 07, 기술 구조 08, 로드맵 09
- `docs/reference/` — 원본 통합 기획서. 수정하지 않는다.

**코드에서 수치, 스킬, 몬스터, 스토리, 맵을 바꾸면 해당 docs 문서도 같은 작업 안에서 갱신한다.** 기능을 끝내면 `docs/09_roadmap.md`를 갱신한다.

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
10. 세이브/불러오기 — `SAVE_KEY`, `saveGame`, `readSave`, `applySaveData`, `showToast`
11. 반응형 스케일링 — `fitGameToScreen`

## 규칙
- UI 텍스트·주석은 한국어.
- `party` 멤버의 능력치 필드를 추가하면 `PARTY_SAVE_FIELDS`에도 추가한다.
- 세이브 구조를 호환되지 않게 바꾸면 `SAVE_VERSION`을 올린다.
