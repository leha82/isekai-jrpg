// ==========================================
// 탭: 맵 디자인 — 타일 칠하기·맵 속성·인카운트·출구(워프) 편집 → data/maps/*.json 커밋
// ==========================================
import { $, esc, S, setStatus, setBusy, commitData, mapToText, dataToText, options, isDataDirty } from "./core.js";
import { SC } from "./tab-scenario.js";

const M = { id: null, tool: "brush", layer: "ground", tile: 1, zoom: 2, grid: true, painting: false, rectStart: null, hover: null,
            warpSel: null, dirty: new Set(), deleted: new Set(), undo: {} };
const DIRS = ["down", "up", "left", "right"];
const ID_RE = /^[a-z][a-z0-9_]*$/;

const map = () => GameData.maps[M.id];
const ts = () => 16 * M.zoom;

export function isMapsDirty() { return M.dirty.size > 0 || M.deleted.size > 0; }

// ---------- 그리기 ----------
export function drawMap() {
  const m = map(); if (!m) return;
  const cv = $("map-canvas"), c = cv.getContext("2d"), t = ts();
  cv.width = m.w * t; cv.height = m.h * t;
  c.imageSmoothingEnabled = false;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const g = tileSrc(m.ground[y][x]);
    c.drawImage(Images.tiles, g.sx, g.sy, g.size, g.size, x * t, y * t, t, t);
    if (m.objects[y][x]) { const o = tileSrc(m.objects[y][x]); c.drawImage(Images.tiles, o.sx, o.sy, o.size, o.size, x * t, y * t, t, t); }
  }
  if (M.grid) {
    c.strokeStyle = "rgba(0,0,0,.18)"; c.lineWidth = 1;
    for (let x = 0; x <= m.w; x++) { c.beginPath(); c.moveTo(x * t + .5, 0); c.lineTo(x * t + .5, m.h * t); c.stroke(); }
    for (let y = 0; y <= m.h; y++) { c.beginPath(); c.moveTo(0, y * t + .5); c.lineTo(m.w * t, y * t + .5); c.stroke(); }
  }
  // 이벤트 (복호화된 시나리오가 있을 때)
  if (SC.lastScn) SC.lastScn.events.filter(e => e.map === m.id).forEach(e => {
    if (e.sprite) { const s = charSrc(e.sprite.key, e.face || "down", 1); if (s) c.drawImage(Images.characters, s.sx, s.sy, s.size, s.size, e.x * t, e.y * t, t, t); }
    c.strokeStyle = "#facc15"; c.lineWidth = 2; c.strokeRect(e.x * t + 1, e.y * t + 1, t - 2, t - 2);
  });
  // 출구
  (m.warps || []).forEach(w => {
    c.fillStyle = w === M.warpSel ? "rgba(236,72,153,.55)" : "rgba(168,85,247,.45)";
    c.fillRect(w.x * t, w.y * t, t, t);
    c.fillStyle = "#fff"; c.font = `bold ${Math.max(9, t / 2.4)}px sans-serif`; c.textAlign = "center";
    c.fillText("⇲", w.x * t + t / 2, w.y * t + t * .7);
  });
  // 시작·부활 위치
  const g = GameData.game;
  [[g.start, "#22c55e", "S"], [g.respawn, "#38bdf8", "R"]].forEach(([p, col, ch]) => {
    if (p.map !== m.id) return;
    c.strokeStyle = col; c.lineWidth = 3; c.strokeRect(p.x * t + 2, p.y * t + 2, t - 4, t - 4);
    c.fillStyle = col; c.fillText(ch, p.x * t + t / 2, p.y * t + t * .7);
  });
  // 사각형 미리보기
  if (M.rectStart && M.hover) {
    const [x0, y0, x1, y1] = rectOf(M.rectStart, M.hover);
    c.strokeStyle = "#fff"; c.setLineDash([4, 3]); c.strokeRect(x0 * t, y0 * t, (x1 - x0 + 1) * t, (y1 - y0 + 1) * t); c.setLineDash([]);
  }
  if (M.hover) { c.strokeStyle = "#fff"; c.lineWidth = 2; c.strokeRect(M.hover.x * t, M.hover.y * t, t, t); }
}

function rectOf(a, b) { return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)]; }

function drawPalette() {
  const tiles = GameData.tiles.tiles;
  const list = tiles.map((t, i) => ({ t, i })).filter(({ t, i }) => !t.hidden && (M.layer === "ground" ? t.layer === "ground" : (t.layer === "object" || i === 0)));
  const cols = 8, size = 32;
  const cv = $("tile-palette");
  cv.width = cols * size; cv.height = Math.ceil(list.length / cols) * size;
  const c = cv.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.fillStyle = "#0b1220"; c.fillRect(0, 0, cv.width, cv.height);
  list.forEach(({ i }, k) => {
    const s = tileSrc(i), x = (k % cols) * size, y = Math.floor(k / cols) * size;
    c.drawImage(Images.tiles, s.sx, s.sy, s.size, s.size, x, y, size, size);
    if (i === 0) { c.strokeStyle = "#f87171"; c.beginPath(); c.moveTo(x + 4, y + 4); c.lineTo(x + 28, y + 28); c.stroke(); }
    if (i === M.tile) { c.strokeStyle = "#facc15"; c.lineWidth = 3; c.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3); c.lineWidth = 1; }
  });
  cv.onclick = (e) => {
    const r = cv.getBoundingClientRect();
    const k = Math.floor((e.clientY - r.top) * cv.height / r.height / size) * cols + Math.floor((e.clientX - r.left) * cv.width / r.width / size);
    if (list[k]) { M.tile = list[k].i; if (M.tool === "erase" || M.tool === "pick" || M.tool === "warp") setTool("brush"); drawPalette(); updateTileLabel(); }
  };
  updateTileLabel();
}

function updateTileLabel() {
  const t = GameData.tiles.tiles[M.tile] || {};
  $("tile-label").textContent = `${t.label || t.id} (${t.id}) — ${t.walk ? "통행 가능" : "통행 불가"}${t.enc ? " · 인카운트" : ""}`;
}

// ---------- 편집 ----------
function snapshot() {
  const m = map();
  const st = (M.undo[m.id] = M.undo[m.id] || []);
  st.push(JSON.stringify({ ground: m.ground, objects: m.objects, w: m.w, h: m.h, warps: m.warps }));
  if (st.length > 40) st.shift();
}
function undo() {
  const st = M.undo[M.id];
  if (!st || !st.length) { setStatus("되돌릴 작업이 없습니다."); return; }
  Object.assign(map(), JSON.parse(st.pop()));
  markDirty(); drawMap(); renderProps();
}
function markDirty() { M.dirty.add(M.id); renderMapSelect(); }

function setCell(x, y, val) {
  const m = map();
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
  m[M.layer][y][x] = val;
}
function paintValue() { return M.tool === "erase" ? (M.layer === "objects" ? 0 : m0()) : M.tile; }
function m0() { return GameData.tileIndex.grass || 1; }

function floodFill(x, y, val) {
  const m = map(), layer = m[M.layer], from = layer[y][x];
  if (from === val) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h || layer[cy][cx] !== from) continue;
    layer[cy][cx] = val;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}

function cellFromEvent(e) {
  const cv = $("map-canvas"), r = cv.getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left) * cv.width / r.width / ts()), y: Math.floor((e.clientY - r.top) * cv.height / r.height / ts()) };
}

function onDown(e) {
  if (!map()) return;
  const p = cellFromEvent(e);
  if (M.tool === "pick") {
    const v = map()[M.layer][p.y][p.x];
    M.tile = v; drawPalette(); setTool("brush"); return;
  }
  if (M.tool === "warp") { selectWarpAt(p.x, p.y); return; }
  snapshot();
  if (M.tool === "fill") { floodFill(p.x, p.y, paintValue()); markDirty(); drawMap(); return; }
  if (M.tool === "rect") { M.rectStart = p; M.hover = p; return; }
  M.painting = true;
  setCell(p.x, p.y, paintValue()); markDirty(); drawMap();
}
function onMove(e) {
  if (!map()) return;
  const p = cellFromEvent(e);
  const m = map();
  if (p.x < 0 || p.y < 0 || p.x >= m.w || p.y >= m.h) return;
  M.hover = p;
  const g = GameData.tiles.tiles[m.ground[p.y][p.x]], o = m.objects[p.y][p.x] ? GameData.tiles.tiles[m.objects[p.y][p.x]] : null;
  const ev = SC.lastScn ? SC.lastScn.events.find(v => v.map === m.id && v.x === p.x && v.y === p.y) : null;
  $("map-hover").textContent = `(${p.x}, ${p.y}) 지형: ${g.label || g.id}${o ? ` · 오브젝트: ${o.label || o.id}` : ""}${ev ? ` · 이벤트: ${ev.id}` : ""}`;
  if (M.painting) setCell(p.x, p.y, paintValue());
  drawMap();
}
function onUp() {
  if (M.rectStart && M.hover) {
    const [x0, y0, x1, y1] = rectOf(M.rectStart, M.hover);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setCell(x, y, paintValue());
    markDirty();
  }
  M.painting = false; M.rectStart = null;
  drawMap();
}

function setTool(t) {
  M.tool = t;
  document.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("on", b.dataset.tool === t));
}

// ---------- 출구 ----------
function selectWarpAt(x, y) {
  const m = map();
  m.warps = m.warps || [];
  let w = m.warps.find(v => v.x === x && v.y === y);
  if (!w) {
    snapshot();
    const other = GameData.game.maps.find(id => id !== m.id) || m.id;
    w = { x, y, to: other, tx: 1, ty: 1, dir: "down" };
    m.warps.push(w); markDirty();
  }
  M.warpSel = w; renderWarps(); drawMap();
}

function renderWarps() {
  const m = map();
  const list = (m.warps || []).map((w, i) => `<li class="${w === M.warpSel ? "active" : ""}" data-i="${i}">(${w.x},${w.y}) → ${esc(w.to)} (${w.tx},${w.ty})${w.cond ? " 🔒" : ""}</li>`).join("");
  const w = M.warpSel;
  const form = w ? `<div class="form-grid">
      <label>도착 맵<select id="w-to">${options(GameData.game.maps, w.to, id => `${GameData.maps[id] ? GameData.maps[id].name : id} (${id})`)}</select></label>
      <label>도착 x<input type="number" id="w-tx" value="${w.tx}"></label>
      <label>도착 y<input type="number" id="w-ty" value="${w.ty}"></label>
      <label>방향<select id="w-dir">${options(DIRS, w.dir)}</select></label>
      <label class="wide">조건 (선택)<input id="w-cond" value="${esc(w.cond || "")}" placeholder="예: flag >= 1"></label>
      <label class="wide">조건 불만족 장면<input id="w-fail" value="${esc(w.fail || "")}" placeholder="예: lucen_road_closed"></label>
      <button class="btn small danger" id="w-del">출구 삭제</button></div>` : `<p class="muted small">'출구' 도구로 맵의 칸을 클릭하면 출구를 만들거나 고릅니다.</p>`;
  $("warp-list").innerHTML = `<ul class="pick-list">${list || "<li class='muted'>출구 없음</li>"}</ul>${form}`;
  $("warp-list").querySelectorAll("li[data-i]").forEach(li => li.onclick = () => { M.warpSel = m.warps[+li.dataset.i]; renderWarps(); drawMap(); });
  if (w) {
    const bind = (id, fn) => { $(id).onchange = () => { snapshot(); fn($(id).value); markDirty(); renderWarps(); drawMap(); }; };
    bind("w-to", v => w.to = v); bind("w-tx", v => w.tx = +v); bind("w-ty", v => w.ty = +v); bind("w-dir", v => w.dir = v);
    bind("w-cond", v => { if (v.trim()) w.cond = v.trim(); else delete w.cond; });
    bind("w-fail", v => { if (v.trim()) w.fail = v.trim(); else delete w.fail; });
    $("w-del").onclick = () => { snapshot(); m.warps.splice(m.warps.indexOf(w), 1); M.warpSel = null; markDirty(); renderWarps(); drawMap(); };
  }
}

// ---------- 맵 속성 ----------
function renderProps() {
  const m = map(); if (!m) return;
  const enc = m.encounter;
  const groups = enc ? enc.groups.map((g, i) => `<tr><td><input data-g="${i}" data-k="enemies" value="${esc(g.enemies.join(","))}"></td>
    <td><input type="number" data-g="${i}" data-k="weight" value="${g.weight || 1}" style="width:50px"></td><td><button class="btn small" data-gdel="${i}">✕</button></td></tr>`).join("") : "";
  $("map-props").innerHTML = `<div class="form-grid">
    <label>ID<input value="${esc(m.id)}" disabled></label>
    <label>이름<input id="p-name" value="${esc(m.name)}"></label>
    <label>가로<input type="number" id="p-w" value="${m.w}" min="5" max="120"></label>
    <label>세로<input type="number" id="p-h" value="${m.h}" min="5" max="120"></label>
    <label>배경음<select id="p-bgm">${options(Object.keys(GameData.audio.bgm), m.bgm, id => `${GameData.audio.bgm[id].title} (${id})`)}</select></label>
    <label>전투 배경<select id="p-bg">${options(Object.keys(GameData.sprites.battleBackgrounds), m.battleBg)}</select></label>
    <label class="wide"><input type="checkbox" id="p-enc" ${enc ? "checked" : ""}> 랜덤 인카운트 사용</label>
    ${enc ? `<label>한 걸음당 확률<input type="number" id="p-rate" step="0.01" min="0" max="1" value="${enc.rate}"></label>` : ""}
  </div>
  ${enc ? `<table class="mini-table"><tr><th>적 id (쉼표, 최대 3)</th><th>비중</th><th></th></tr>${groups}</table>
    <button class="btn small" id="p-gadd">＋ 적 그룹</button>
    <p class="muted small">적 id: ${Object.keys(GameData.monsters).join(", ")}</p>` : ""}`;
  const on = (id, fn) => { const el = $(id); if (el) el.onchange = () => { snapshot(); fn(el); markDirty(); renderProps(); drawMap(); }; };
  on("p-name", el => m.name = el.value.trim() || m.id);
  on("p-bgm", el => m.bgm = el.value);
  on("p-bg", el => m.battleBg = el.value);
  on("p-w", el => resizeMap(+el.value, m.h));
  on("p-h", el => resizeMap(m.w, +el.value));
  on("p-enc", el => { m.encounter = el.checked ? { rate: 0.08, groups: [{ enemies: [Object.keys(GameData.monsters)[0]], weight: 1 }] } : null; });
  on("p-rate", el => m.encounter.rate = Math.max(0, Math.min(1, +el.value)));
  $("map-props").querySelectorAll("[data-g]").forEach(el => el.onchange = () => {
    snapshot();
    const g = m.encounter.groups[+el.dataset.g];
    if (el.dataset.k === "weight") g.weight = Math.max(1, +el.value);
    else {
      const ids = el.value.split(",").map(s => s.trim()).filter(Boolean);
      const bad = ids.filter(id => !GameData.monsters[id]);
      if (bad.length || !ids.length || ids.length > 3) { setStatus(`적 id 확인: ${bad.join(", ") || "1~3마리"}`, "error"); renderProps(); return; }
      g.enemies = ids;
    }
    markDirty();
  });
  $("map-props").querySelectorAll("[data-gdel]").forEach(b => b.onclick = () => { snapshot(); m.encounter.groups.splice(+b.dataset.gdel, 1); markDirty(); renderProps(); });
  if ($("p-gadd")) $("p-gadd").onclick = () => { snapshot(); m.encounter.groups.push({ enemies: [Object.keys(GameData.monsters)[0]], weight: 1 }); markDirty(); renderProps(); };
}

function resizeMap(w, h) {
  const m = map();
  w = Math.max(5, Math.min(120, w | 0)); h = Math.max(5, Math.min(120, h | 0));
  const fill = m.ground[m.h - 1][m.w - 1];
  m.ground = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (m.ground[y] && m.ground[y][x] !== undefined) ? m.ground[y][x] : fill));
  m.objects = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (m.objects[y] && m.objects[y][x] !== undefined) ? m.objects[y][x] : 0));
  m.w = w; m.h = h;
  m.warps = (m.warps || []).filter(v => v.x < w && v.y < h);
}

// ---------- 맵 목록 ----------
function renderMapSelect() {
  $("map-select").innerHTML = GameData.game.maps.map(id => `<option value="${id}"${id === M.id ? " selected" : ""}>${M.dirty.has(id) ? "● " : ""}${esc(GameData.maps[id].name)} (${id}) ${GameData.maps[id].w}×${GameData.maps[id].h}</option>`).join("");
}

function selectMap(id) {
  M.id = id; M.warpSel = null;
  renderMapSelect(); renderProps(); renderWarps(); drawMap();
}

function newMap(copyFrom = null) {
  const id = (prompt("새 맵 id (영문 소문자·숫자·_)", copyFrom ? `${copyFrom.id}_copy` : "new_map") || "").trim();
  if (!id) return;
  if (!ID_RE.test(id) || GameData.maps[id]) { alert("id 형식이 맞지 않거나 이미 있는 맵입니다."); return; }
  let m;
  if (copyFrom) m = JSON.parse(JSON.stringify(copyFrom));
  else {
    const w = +prompt("가로 칸 수", "20") || 20, h = +prompt("세로 칸 수", "15") || 15;
    m = { name: id, w, h, bgm: "field", battleBg: "meadow", encounter: null,
          ground: Array.from({ length: h }, () => Array(w).fill(GameData.tileIndex.grass)), objects: Array.from({ length: h }, () => Array(w).fill(0)), warps: [] };
  }
  m.id = id; if (copyFrom) m.name = `${copyFrom.name} 사본`; m.warps = copyFrom ? m.warps : [];
  GameData.maps[id] = m;
  GameData.game.maps.push(id);
  M.deleted.delete(id);
  M.dirty.add(id);
  selectMap(id);
  setStatus(`새 맵 ${id} 를 만들었습니다. 다른 맵에서 이 맵으로 가는 출구를 추가하세요.`, "ok");
}

function deleteMap() {
  const g = GameData.game;
  if ([g.start.map, g.respawn.map].includes(M.id)) { alert("시작·부활 맵은 삭제할 수 없습니다."); return; }
  const refs = Object.values(GameData.maps).filter(m => (m.warps || []).some(w => w.to === M.id)).map(m => m.id);
  if (!confirm(`${M.id} 맵을 삭제할까요?${refs.length ? `\n이 맵으로 가는 출구가 있는 맵: ${refs.join(", ")}` : ""}\n(💾 맵 저장을 눌러야 저장소에 반영됩니다)`)) return;
  delete GameData.maps[M.id];
  g.maps = g.maps.filter(id => id !== M.id);
  M.dirty.delete(M.id);
  M.deleted.add(M.id);
  selectMap(g.maps[0]);
}

export async function saveMaps() {
  if (S.busy) return;
  // 출구가 가리키는 맵이 있는지 확인
  const bad = [];
  Object.values(GameData.maps).forEach(m => (m.warps || []).forEach(w => { if (!GameData.maps[w.to]) bad.push(`${m.id}(${w.x},${w.y}) → ${w.to}`); }));
  if (bad.length) { setStatus(`없는 맵으로 가는 출구가 있습니다: ${bad.join(", ")}`, "error"); return; }
  const changes = [...M.dirty].map(id => ({ path: `${DATA_DIR}/maps/${id}.json`, content: mapToText(GameData.maps[id]) }));
  [...M.deleted].forEach(id => changes.push({ path: `${DATA_DIR}/maps/${id}.json`, content: null }));
  const gameText = dataToText(GameData.game);
  if (isDataDirty(`${DATA_DIR}/game.json`, gameText)) changes.push({ path: `${DATA_DIR}/game.json`, content: gameText });
  if (!changes.length) { setStatus("저장할 맵 변경이 없습니다."); return; }
  if (!confirm(`맵 ${changes.length}개 파일을 GitHub에 커밋합니다. 계속할까요?`)) return;
  setBusy(true);
  try {
    const sha = await commitData(changes, `data: 맵 수정 (${[...M.dirty, ...M.deleted].join(", ")})`);
    M.dirty.clear(); M.deleted.clear(); renderMapSelect();
    setStatus(`✅ 맵 저장 완료${sha ? ` — 커밋 ${sha.slice(0, 7)}` : ""}. 1~2분 뒤 게임에 반영됩니다.`, "ok");
  } catch (e) { setStatus(`맵 저장 실패: ${e.message}`, "error"); }
  finally { setBusy(false); }
}

// ---------- 초기화 ----------
export function initMapsTab() {
  const cv = $("map-canvas");
  cv.addEventListener("mousedown", onDown);
  cv.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  cv.addEventListener("mouseleave", () => { M.hover = null; drawMap(); });
  document.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => setTool(b.dataset.tool));
  $("map-select").onchange = (e) => selectMap(e.target.value);
  $("map-layer").onchange = (e) => { M.layer = e.target.value; M.tile = M.layer === "objects" ? 0 : (GameData.tileIndex.grass || 1); drawPalette(); };
  $("map-zoom").onchange = (e) => { M.zoom = +e.target.value; drawMap(); };
  $("map-grid").onchange = (e) => { M.grid = e.target.checked; drawMap(); };
  $("map-new").onclick = () => newMap();
  $("map-dup").onclick = () => newMap(map());
  $("map-del").onclick = deleteMap;
  $("map-undo").onclick = undo;
  $("map-save").onclick = saveMaps;
  window.addEventListener("keydown", (e) => {
    if ($("tab-maps").hidden) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
  });
}

export function showMapsTab() {
  if (!M.id || !GameData.maps[M.id]) M.id = GameData.game.maps[0];
  setTool(M.tool);
  drawPalette();
  selectMap(M.id);
}
