// ==========================================
// 월드: 맵 조회 · 렌더링(카메라 스크롤·애니메이션) · 이동 · 상호작용 · 맵 이동 · 인카운트
// ==========================================
const canvas = $("world-canvas");
const ctx = canvas.getContext("2d");
const View = { cols: 16, ts: 40 };            // 화면 가로 칸 수, 칸 하나의 픽셀 크기
const World = { map: null, move: null, stepParity: false, steps: 0, sinceBattle: 0, fade: 0, fadeTo: 0, fadeMs: 250,
                fadeResolve: null, transitioning: false, npcFace: {}, lastTime: 0, animT: 0 };
const heldDirs = [];
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };
const MOVE_MS = 165;

// ---------- 화면 크기 설정 (한 화면에 보이는 가로 칸 수) ----------
function loadViewSetting() {
  const saved = +localStorage.getItem("view_cols");
  const ok = GameData.game.views.some(v => v.cols === saved);
  setViewCols(ok ? saved : GameData.game.defaultView);
}
function setViewCols(cols) {
  View.cols = cols;
  View.ts = canvas.width / cols;
  try { localStorage.setItem("view_cols", String(cols)); } catch (e) {}
}

// ---------- 맵 조회 ----------
function inMap(m, x, y) { return x >= 0 && y >= 0 && x < m.w && y < m.h; }

function mapEvents() { return SCN ? SCN.events.filter(e => e.map === player.map) : []; }
function eventAt(x, y) { return mapEvents().find(e => e.x === x && e.y === y) || null; }
function npcVisible(ev) { return !!(ev.sprite && ScenarioFormat.evalCondition(ev.sprite.cond, scenarioState())); }
function npcAt(x, y) { const ev = eventAt(x, y); return ev && npcVisible(ev) ? ev : null; }

// 이벤트의 "* tile" 속성이 조건을 만족하면 그 칸의 오브젝트를 바꿔 그린다 (열린 상자 등)
function objectIndexAt(m, x, y) {
  if (m === World.map) {
    const ev = eventAt(x, y);
    if (ev && ev.tile && ScenarioFormat.evalCondition(ev.tile.cond, scenarioState())) {
      const idx = GameData.tileIndex[ev.tile.key];
      if (idx !== undefined) return idx;
    }
  }
  return m.objects[y][x];
}

function tileWalkable(m, x, y) {
  if (!inMap(m, x, y)) return false;
  const g = tileDef(m.ground[y][x]);
  const oi = objectIndexAt(m, x, y);
  return !!g.walk && (!oi || !!tileDef(oi).walk);
}
function canWalk(x, y) { return tileWalkable(World.map, x, y) && !npcAt(x, y); }
function warpAt(x, y) { return (World.map.warps || []).find(w => w.x === x && w.y === y) || null; }

function condOk(src) {
  const pc = ScenarioFormat.parseCondition(src);
  return pc.error ? false : ScenarioFormat.evalCondition(pc.cond, scenarioState());
}

// ---------- 렌더링 ----------
function renderLoop(now) {
  const dt = Math.min(100, now - (World.lastTime || now));
  World.lastTime = now;
  World.animT += dt;
  updateFade(dt);
  if (player && World.map) drawWorld(now);
  requestAnimationFrame(renderLoop);
}

function playerPixel(now) {
  if (!World.move) return { x: player.x, y: player.y, p: 0 };
  const p = Math.min(1, (now - World.move.t0) / MOVE_MS);
  return { x: World.move.fx + (World.move.tx - World.move.fx) * p, y: World.move.fy + (World.move.ty - World.move.fy) * p, p };
}

function drawWorld(now) {
  const m = World.map, ts = View.ts, W = canvas.width, H = canvas.height;
  const pp = playerPixel(now);
  const mapW = m.w * ts, mapH = m.h * ts;
  let camX = pp.x * ts + ts / 2 - W / 2, camY = pp.y * ts + ts / 2 - H / 2;
  camX = mapW <= W ? (mapW - W) / 2 : Math.max(0, Math.min(camX, mapW - W));
  camY = mapH <= H ? (mapH - H) / 2 : Math.max(0, Math.min(camY, mapH - H));
  camX = Math.round(camX); camY = Math.round(camY);

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0b0a12";
  ctx.fillRect(0, 0, W, H);
  const x0 = Math.max(0, Math.floor(camX / ts)), y0 = Math.max(0, Math.floor(camY / ts));
  const x1 = Math.min(m.w - 1, Math.ceil((camX + W) / ts)), y1 = Math.min(m.h - 1, Math.ceil((camY + H) / ts));
  const animOdd = Math.floor(World.animT / 650) % 2 === 1;
  const img = Images.tiles;

  const drawTile = (i, x, y) => {
    let def = tileDef(i);
    if (animOdd && def.anim && GameData.tileIndex[def.anim] !== undefined) i = GameData.tileIndex[def.anim];
    const s = tileSrc(i);
    const dx = Math.round(x * ts - camX), dy = Math.round(y * ts - camY);
    const dw = Math.round((x + 1) * ts - camX) - dx, dh = Math.round((y + 1) * ts - camY) - dy;
    ctx.drawImage(img, s.sx, s.sy, s.size, s.size, dx, dy, dw, dh);
  };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      drawTile(m.ground[y][x], x, y);
      const oi = objectIndexAt(m, x, y);
      if (oi) drawTile(oi, x, y);
    }
  }

  // 캐릭터 (y 순서로 그려 겹침을 자연스럽게)
  const actors = mapEvents().filter(npcVisible).map(ev => ({
    y: ev.y, draw: () => drawChar(ev.sprite.key, World.npcFace[ev.id] || ev.face || "down", 1, ev.x, ev.y, camX, camY, 0)
  }));
  const walkFrame = World.move ? (pp.p < 0.5 ? (World.stepParity ? 0 : 2) : 1) : 1;
  const bob = World.move && pp.p < 0.5 ? -ts / 16 : 0;
  const leadSprite = (leader() || {}).sprite || "hero";
  actors.push({ y: pp.y, draw: () => drawChar(leadSprite, player.dir, walkFrame, pp.x, pp.y, camX, camY, bob) });
  actors.sort((a, b) => a.y - b.y).forEach(a => a.draw());

  if (World.fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${World.fade})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawChar(key, dir, frame, x, y, camX, camY, bob) {
  const s = charSrc(key, dir, frame);
  if (!s) return;
  const ts = View.ts;
  const dx = Math.round(x * ts - camX), dy = Math.round(y * ts - camY + bob);
  // 그림자
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(dx + ts / 2, dy + ts * 0.92, ts * 0.32, ts * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(Images.characters, s.sx, s.sy, s.size, s.size, dx, dy, Math.round(ts), Math.round(ts));
}

// ---------- 페이드 ----------
function updateFade(dt) {
  if (World.fade === World.fadeTo) return;
  const step = dt / World.fadeMs;
  World.fade = World.fade < World.fadeTo ? Math.min(World.fadeTo, World.fade + step) : Math.max(World.fadeTo, World.fade - step);
  if (World.fade === World.fadeTo && World.fadeResolve) { const r = World.fadeResolve; World.fadeResolve = null; r(); }
}
// 게임 진행은 타이머로 보장하고(탭이 숨겨져 rAF 가 멈춰도 진행), 그리기는 rAF 가 맡는다.
function fadeTo(target, ms = 250) {
  World.fadeTo = target;
  World.fadeMs = ms;
  if (World.fade === target) return Promise.resolve();
  return new Promise(r => {
    World.fadeResolve = r;
    setTimeout(() => { if (World.fadeResolve === r) { World.fade = target; World.fadeResolve = null; r(); } }, ms + 40);
  });
}

// ---------- 이동 ----------
function pressDir(d) {
  const i = heldDirs.indexOf(d); if (i >= 0) heldDirs.splice(i, 1);
  heldDirs.push(d);
  if (!World.move) tryMove(d);
}
function releaseDir(d) { const i = heldDirs.indexOf(d); if (i >= 0) heldDirs.splice(i, 1); }
function releaseAllDirs() { heldDirs.length = 0; }

function tryMove(dir) {
  if (gameState !== "WORLD" || World.move || World.transitioning) return false;
  player.dir = dir;
  const [dx, dy] = DIR_VEC[dir];
  const nx = player.x + dx, ny = player.y + dy;
  const wp = warpAt(nx, ny);
  if (wp && wp.cond && !condOk(wp.cond)) {
    releaseAllDirs();
    if (wp.fail) runScene(wp.fail); else SFX.error();
    return false;
  }
  if (!canWalk(nx, ny)) return false;
  const mv = { fx: player.x, fy: player.y, tx: nx, ty: ny, t0: performance.now() };
  World.move = mv;
  World.stepParity = !World.stepParity;
  setTimeout(() => completeStep(mv), MOVE_MS);
  return true;
}

function completeStep(mv) {
  if (World.move !== mv) return;
  player.x = mv.tx; player.y = mv.ty;
  World.move = null;
  onStepComplete();
  // 키를 누르고 있으면 다음 칸으로 계속 이동
  if (!World.move && gameState === "WORLD" && !World.transitioning && heldDirs.length) tryMove(heldDirs[heldDirs.length - 1]);
}

function onStepComplete() {
  World.steps++;
  World.sinceBattle++;
  if (World.steps % 2 === 0) SFX.step(0.35);
  const wp = warpAt(player.x, player.y);
  if (wp) { doWarp(wp.to, wp.tx, wp.ty, wp.dir); return; }
  const ev = eventAt(player.x, player.y);
  if (ev && ev.trigger === "touch") { runEvent(ev); return; }
  tryEncounter();
}

// 바라보는 칸의 말 걸기 이벤트 (계산대 너머도 가능) → 없으면 발밑의 밟기 이벤트
function interact() {
  if (gameState !== "WORLD" || World.move || World.transitioning) return;
  const [dx, dy] = DIR_VEC[player.dir];
  let tx = player.x + dx, ty = player.y + dy;
  let ev = eventAt(tx, ty);
  if (!ev && inMap(World.map, tx, ty) && tileDef(World.map.objects[ty][tx]).id === "counter") ev = eventAt(tx + dx, ty + dy);
  if (ev && ev.trigger === "talk") {
    if (ev.sprite) World.npcFace[ev.id] = OPPOSITE[player.dir];
    releaseAllDirs();
    runEvent(ev);
    return;
  }
  const here = eventAt(player.x, player.y);
  if (here && here.trigger === "touch") runEvent(here);
}

// ---------- 맵 이동 ----------
async function doWarp(mapId, x, y, dir) {
  if (!GameData.maps[mapId]) { showToast(`없는 맵: ${mapId}`, true); return; }
  World.transitioning = true;
  releaseAllDirs();
  SFX.door(0.6);
  await fadeTo(1, 200);
  enterMap(mapId, x, y, dir);
  await wait(60);
  await fadeTo(0, 260);
  World.transitioning = false;
  requestAutoSave("map");  // 다른 맵으로 이동하면 자동 저장
}

function enterMap(mapId, x, y, dir) {
  const changed = player.map !== mapId || !World.map;
  player.map = mapId; player.x = x; player.y = y;
  if (dir) player.dir = dir;
  World.map = GameData.maps[mapId];
  World.move = null;
  World.sinceBattle = 0;
  if (changed) { World.npcFace = {}; showMapBanner(World.map.name); }
  playBGM(World.map.bgm);
  updateHUD();
}

let bannerTimer = null;
function showMapBanner(name) {
  const b = $("map-banner");
  b.textContent = name;
  b.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove("show"), 2200);
}

// ---------- 인카운트 ----------
function tryEncounter() {
  const m = World.map, enc = m.encounter;
  if (!enc || !enc.groups || !enc.groups.length) return;
  if (!tileDef(m.ground[player.y][player.x]).enc) return;
  if (World.sinceBattle < (GameData.battle.encounterGraceSteps || 0)) return;
  if (Math.random() > enc.rate * (GameData.battle.encounterRate ?? 1)) return;
  const total = enc.groups.reduce((s, g) => s + (g.weight || 1), 0);
  let r = Math.random() * total;
  const group = enc.groups.find(g => (r -= (g.weight || 1)) < 0) || enc.groups[0];
  World.sinceBattle = 0;
  releaseAllDirs();
  startBattle(group.enemies, {});
}
