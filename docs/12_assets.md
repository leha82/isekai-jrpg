# 12. 리소스 (그래픽 · 사운드) — 직접 생성

모든 그래픽과 음원은 저장소 안의 생성기로 만든다. 외부 리소스를 내려받지 않으므로 **출처·라이선스 문제가 없고**, 수치만 바꿔 다시 생성할 수 있다. ✅ (2026-11-27)
(무료 리소스 사이트는 자동 다운로드를 막아 두어 쓰지 않았다.)

## 생성기

| 도구 | 출력 | 필요 | 실행 |
|---|---|---|---|
| `tools/gen_assets.py` | `assets/img/tiles.png` (16×16 타일 73종), `characters.png` (캐릭터 17명 × 4방향 × 3프레임), `monsters.png` (13종), `bg/*.png` (전투 배경 8종), `data/tiles.json`, `data/sprites.json` | 파이썬 기본 라이브러리만 | `python tools/gen_assets.py` |
| `tools/gen_svg.py` | `assets/img/portraits/*.svg` (초상화 7장, 도트가 아닌 벡터 일러스트), `assets/img/icons/*.svg` (UI 아이콘 16개), `assets/img/icons/items/*.svg` (아이템·장비 22개), `assets/img/icons/skills/*.svg` (스킬 12개) | 기본 라이브러리 | `python tools/gen_svg.py` |
| `tools/gen_audio.py` | `assets/bgm/*.mp3` (배경음 11곡), `assets/sfx/*.mp3` (효과음 20종), `data/audio.json` | numpy, lameenc | `uv run --python 3.13 --with numpy,lameenc python tools/gen_audio.py` |
| `tools/gen_maps.py` | `data/maps/*.json` (맵 12개) | 기본 라이브러리 (`data/tiles.json` 필요) | `python tools/gen_maps.py` |
| `tools/gen_manifest.py` | `data/assets.json` (관리자 '리소스' 탭 목록) | 기본 라이브러리 | `python tools/gen_manifest.py` |

> ⚠️ `gen_maps.py` 를 다시 실행하면 관리자 페이지에서 편집한 맵이 덮어써진다. 맵은 처음 만들 때만 쓰고, 이후에는 관리자 '맵 디자인' 탭에서 고친다.
> ⚠️ `gen_assets.py` 는 타일 순서가 곧 맵 데이터 값이다. 타일을 추가할 때는 **목록 끝에** 붙여야 기존 맵이 깨지지 않는다. 캐릭터도 목록 끝에 추가한다(행 번호).
> ⚠️ `gen_assets.py` 의 전투 배경(`bg/*.png`)은 실행할 때마다 조금씩 달라진다. 배경을 바꿀 생각이 없으면 실행 후 `git checkout -- assets/img/bg` 로 되돌린다.

## 그래픽
- **타일:** 팔레트 + 노이즈 질감 + 명암. 물은 2프레임 애니메이션(`anim`). 속성: `walk`(통행), `enc`(인카운트), `layer`(ground/object).
- **캐릭터:** 머리 모양(짧은/긴/뾰족/포니테일)·머리색·피부·옷·바지·망토·투구·두건·수염·왕관·엘프 귀·빛나는 눈을 조합해 4방향 걷기 프레임을 그리고, 자동 명암·외곽선을 입힌다.
- **몬스터:** 도형(타원·다각형)으로 그린 뒤 가장자리 기준 자동 명암 + 외곽선.
- **초상화:** SVG 그라데이션 일러스트 (주인공·리아·가렌·오르벨·국왕·촌장·토비). HUD·대화창·파티 메뉴에 쓴다.
- **UI 아이콘:** 24×24 선 아이콘 (파티·가방·장비·스킬·퀘스트·지도·설정·저장·불러오기·소리·음소거·로그인·복사·검·하트·동전). 설정 아이콘은 `gear_icon()` 으로 계산한 **톱니바퀴**(톱니 8개).
- **아이템·장비·스킬 아이콘** ✅ (2026-11-28): 32×32 컬러 SVG (`COLOR_ICONS` — 외곽선 + 면 색 + 하이라이트). 데이터의 `icon` 필드가 이미지 경로를 가리키고(예: `assets/img/icons/items/potion.svg`), 가방·장비·스킬 메뉴, 상점, 전투 커맨드에 그림으로 나온다. 새 아이템·스킬은 `COLOR_ICONS` 에 그림을 추가하고 실행 → `gen_manifest.py` → 관리자 '전투 설정' 탭에서 아이콘을 고른다.

## 사운드
- **작곡:** 곡마다 화음 진행 16마디 + 직접 쓴 멜로디(`TRACKS`). 반주(베이스 패턴·아르페지오·패드)와 드럼(가벼움·행진·록·빠름)을 스타일로 조합한다.
- **합성:** 사각파·삼각파·톱니파·사인파·벨(FM풍)·플럭·하프 음색, ADSR, 간단한 지연 잔향.
- **반복:** 두 번 연속 렌더링해 두 번째 구간을 잘라 잔향이 루프 시작에 이어지게 하고, 게임은 `loop` 길이 + MP3 디코더 지연(`decoderDelay` 1105샘플, Edge 에서 측정)으로 `loopStart/loopEnd` 를 맞춰 끊김 없이 반복한다.
- 형식: MP3 모노 44.1kHz 96kbps (총 약 5MB).

| BGM id | 제목 | 사용처 |
|---|---|---|
| `title` | 타이틀 | 타이틀 화면 |
| `field` | 바람결 초원 | 초원·숲길 |
| `town` | 하젤 마을 | 하젤·촌장의 집 |
| `forest` | 세계수의 숲 | 엘브레아 |
| `castle` | 왕도 루센 | 루센·알현실 |
| `mountain` | 그롬 산길 | 그롬 산길 |
| `snow` | 서리 평원 | 서리 평원 |
| `dungeon` | 녹턴 요새 | 녹턴 외곽·내부·옥좌 |
| `battle` / `boss` | 전투 / 관리자 오르벨 | 일반 / 보스 전투 |
| `ending` | 엔딩 — 새로운 순환 | 엔딩 |

효과음: `step` `cursor` `confirm` `cancel` `error` `hit` `slash` `fire` `wind` `heal` `guard` `coin` `levelup` `encounter` `door` `chest` `warp` `enemy_die` `item` `fanfare`

## 확인
관리자 페이지 '🎵 리소스' 탭에서 이미지 목록·확대, 타일 카탈로그, 배경음·효과음 재생을 할 수 있다. ([13_admin.md](13_admin.md))
