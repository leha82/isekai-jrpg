// ==========================================
// 리소스 로더 — data/*.json, data/maps/*.json, 이미지 (게임·관리자 공용)
// ==========================================
const GameData = { maps: {} };   // game, tiles, sprites, characters, monsters, skills, items, battle, audio, maps
const Images = { bg: {}, portraits: {} };

async function fetchJsonFile(url, bust = true) {
  const res = await fetch(bust ? `${url}?t=${Date.now()}` : url, { cache: "no-store" });
  if (!res.ok) { const e = new Error(`${url} 응답 ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${src}`));
    img.src = src;
  });
}

// onProgress(완료 수, 전체 수)
async function loadGameData(onProgress = () => {}) {
  let done = 0, total = DATA_FILES.length;
  const tick = () => onProgress(++done, total);
  await Promise.all(DATA_FILES.map(async name => { GameData[name] = await fetchJsonFile(`${DATA_DIR}/${name}.json`); tick(); }));

  const mapIds = GameData.game.maps;
  total += mapIds.length;
  await Promise.all(mapIds.map(async id => { GameData.maps[id] = await fetchJsonFile(`${DATA_DIR}/maps/${id}.json`); tick(); }));

  indexGameData();

  const imgJobs = [
    ["tiles", GameData.tiles.image],
    ["characters", GameData.sprites.characters.image],
    ["monsters", GameData.sprites.monsters.image]
  ];
  Object.entries(GameData.sprites.battleBackgrounds).forEach(([k, src]) => imgJobs.push([`bg:${k}`, src]));
  total += imgJobs.length;
  await Promise.all(imgJobs.map(async ([key, src]) => {
    const img = await loadImage(src);
    if (key.startsWith("bg:")) Images.bg[key.slice(3)] = img; else Images[key] = img;
    tick();
  }));
  return GameData;
}

// 자주 쓰는 조회용 색인
function indexGameData() {
  GameData.tileIndex = {};
  GameData.tiles.tiles.forEach((t, i) => { GameData.tileIndex[t.id] = i; });
}

function tileDef(i) { return GameData.tiles.tiles[i] || GameData.tiles.tiles[0]; }

// 타일 시트에서 i번 타일의 원본 좌표
function tileSrc(i) {
  const size = GameData.tiles.size, cols = GameData.tiles.columns;
  return { sx: (i % cols) * size, sy: Math.floor(i / cols) * size, size };
}

// 캐릭터 시트 프레임: dir(down/left/right/up), frame(0~2)
function charSrc(spriteKey, dir, frame) {
  const info = GameData.sprites.characters.list[spriteKey];
  if (!info) return null;
  const size = GameData.sprites.characters.size;
  const di = { down: 0, left: 1, right: 2, up: 3 }[dir] ?? 0;
  return { sx: (di * 3 + frame) * size, sy: info.row * size, size };
}

function monsterSrc(spriteKey) {
  return GameData.sprites.monsters.list[spriteKey] || null;
}

function portraitUrl(key) {
  return (GameData.characters.portraits || {})[key] || null;
}
