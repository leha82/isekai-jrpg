// ==========================================
// 지도 (메뉴 '지도' 탭 · 단축키 M)
//  - 월드 지도: **가지고 있는 지도 아이템**(data/items.json 의 type "map")마다 한 장. 위의 드롭다운으로 고른다.
//               지도 아이템은 상점에서 사거나 퀘스트 보상(> item map_xxx +1)으로 얻는다. 챕터가 진행될수록 새 지역 지도가 생긴다.
//               지도 아이템의 nodes(지역 맵 id)를 data/game.json 의 worldMap 위치에 네모 칸으로 그리고, 출구(warps)로 이어진 지역끼리 길을 잇는다.
//               가 본 지역은 색과 이름이 또렷하게, 가 보지 못한 지역은 이름만 흐리게(비활성) 보인다. 실내 맵(parent)은 바깥 지역에 포함.
//  - 현재 지역: 지금 맵 전체를 타일 평균색으로 축소해 그리고 출구·사람·내 위치를 표시한다.
// ==========================================
const MapView = { tileColors: null };
let mapRegion = ""; // 지도 탭에서 고른 지도 아이템 id

function worldNodeOf(mapId) {
  const wm = GameData.game.worldMap || {};
  let id = mapId, guard = 0;
  while (wm[id] && wm[id].parent && guard++ < 5) id = wm[id].parent;
  return wm[id] && wm[id].x !== undefined ? id : null;
}

function visitedNodes() {
  const set = new Set();
  (player.visited || []).forEach(id => { const n = worldNodeOf(id); if (n) set.add(n); });
  const cur = worldNodeOf(player.map);
  if (cur) set.add(cur);
  return set;
}

function worldEdges() {
  const edges = new Map();
  Object.values(GameData.maps).forEach(m => (m.warps || []).forEach(w => {
    const a = worldNodeOf(m.id), b = worldNodeOf(w.to);
    if (!a || !b || a === b) return;
    const key = [a, b].sort().join("|");
    if (!edges.has(key)) edges.set(key, [a, b]);
  }));
  return [...edges.values()];
}

// 지도 아이템이 보여 주는 지역 (worldMap 에 위치가 있는 것만, 실내 맵은 바깥 지역으로)
function mapItemNodes(it) {
  const wm = GameData.game.worldMap || {};
  return (it.nodes || []).map(worldNodeOf).filter((id, i, a) => id && GameData.maps[id] && wm[id] && a.indexOf(id) === i);
}

function ownedMaps() {
  return Object.entries(GameData.items.items)
    .filter(([id, it]) => it.type === "map" && (player.inventory[id] || 0) > 0)
    .map(([id, it]) => ({ id, it }))
    .sort((a, b) => (a.it.chapter || 0) - (b.it.chapter || 0));
}

function menuMap() {
  const m = World.map;
  const exits = [];
  (m.warps || []).forEach(w => {
    const to = GameData.maps[w.to];
    if (!to || exits.some(e => e.to === w.to)) return;
    const dir = w.y <= 1 ? "북" : w.y >= m.h - 2 ? "남" : w.x <= 1 ? "서" : w.x >= m.w - 2 ? "동" : "문";
    const known = (player.visited || []).includes(w.to);
    exits.push({ to: w.to, text: `${dir} → ${known ? to.name : "???"}` });
  });
  const owned = ownedMaps();
  if (!owned.some(o => o.id === mapRegion)) {
    // 처음 열면 지금 있는 지역이 들어 있는 지도 (없으면 가장 최근 챕터 지도)
    const cur = worldNodeOf(player.map);
    const here = owned.filter(o => mapItemNodes(o.it).includes(cur)).pop();
    mapRegion = here ? here.id : (owned.length ? owned[owned.length - 1].id : "");
  }
  const world = owned.length
    ? `<select class="map-select" onchange="mapRegion=this.value; SFX.cursor(); renderMenu()">${owned.map(o =>
        `<option value="${o.id}" ${o.id === mapRegion ? "selected" : ""}>${o.it.chapter ? `${o.it.chapter}장 · ` : ""}${escapeHtml(o.it.name)}</option>`).join("")}</select>
       <canvas id="map-world" width="400" height="260"></canvas>
       <div class="map-legend"><span><i class="sq" style="background:#1b2240;border:1px solid #4ade80"></i>가 본 곳</span><span><i class="sq" style="background:#5a606e"></i>아직 못 가 본 곳</span><span><i style="background:#ef4444"></i>지금 위치</span></div>`
    : `<p class="muted small map-none">가지고 있는 지도가 없습니다.<br>지도는 상점에서 사거나 퀘스트로 얻을 수 있습니다. 지도를 얻으면 여기에 나옵니다.</p>`;
  return `<div class="map-wrap">
    <div class="map-box"><div class="section-title">월드 지도 <small>가진 지도 ${owned.length}장</small></div>${world}</div>
    <div class="map-box"><div class="section-title">${escapeHtml(m.name)} <small>${m.w}×${m.h}</small></div><canvas id="map-area"></canvas>
      <div class="map-legend"><span><i style="background:#ef4444"></i>나</span><span><i style="background:#60a5fa"></i>사람</span><span><i style="background:#d946ef"></i>출구</span></div>
      <div class="muted small">${exits.map(e => escapeHtml(e.text)).join(" · ") || "출구 없음"}</div></div>
  </div>`;
}

function drawMapTab() {
  const w = $("map-world"), a = $("map-area");
  const it = GameData.items.items[mapRegion];
  if (w && it) drawWorldMap(w, it);
  if (a) drawAreaMap(a);
}

const NODE_STYLE = {
  town: "#facc15", castle: "#fbbf24", field: "#4ade80", forest: "#16a34a", mountain: "#b45309", snow: "#7dd3fc", dungeon: "#a855f7"
};

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

// 지도 아이템 한 장: 양피지 바탕 위에 지역을 네모 칸으로 그린다
function drawWorldMap(cv, item) {
  const c = cv.getContext("2d"), W = cv.width, H = cv.height;
  const wm = GameData.game.worldMap || {};
  const nodes = mapItemNodes(item);
  // 양피지 바탕 + 가장자리 그을림 + 격자 + 테두리
  const g = c.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, W * .65);
  g.addColorStop(0, "#efe0b8"); g.addColorStop(.75, "#d9c18c"); g.addColorStop(1, "#a9874f");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = "rgba(110,80,40,.18)"; c.lineWidth = 1;
  for (let x = 20; x < W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 20; y < H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.strokeStyle = "#6b4f2a"; c.lineWidth = 3; c.strokeRect(4, 4, W - 8, H - 8);
  c.lineWidth = 1; c.strokeRect(9, 9, W - 18, H - 18);
  // 지도 이름 · 나침반
  c.fillStyle = "#4a3418"; c.font = "bold 12px 'Malgun Gothic', sans-serif"; c.textAlign = "left";
  c.fillText(item.name, 16, 26);
  c.textAlign = "center"; c.fillText("N", W - 24, 26);
  c.beginPath(); c.moveTo(W - 24, 30); c.lineTo(W - 29, 42); c.lineTo(W - 19, 42); c.fill();
  if (!nodes.length) return;

  // 지역 위치(0~100)를 이 지도에 맞게 늘린다 (지역이 모인 범위 → 캔버스 안쪽)
  const xs = nodes.map(id => wm[id].x), ys = nodes.map(id => wm[id].y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const BW = 88, BH = 34, padX = 20 + BW / 2, padTop = 50 + BH / 2, padBot = 16 + BH / 2;
  const sx = (W - padX * 2) / Math.max(1, maxX - minX), sy = (H - padTop - padBot) / Math.max(1, maxY - minY);
  const pos = (id) => ({
    x: maxX === minX ? W / 2 : padX + (wm[id].x - minX) * sx,
    y: maxY === minY ? (padTop + H - padBot) / 2 : padTop + (wm[id].y - minY) * sy
  });

  const visited = visitedNodes();
  const cur = worldNodeOf(player.map);
  const inMapSet = new Set(nodes);
  // 길: 이 지도 안의 지역끼리. 둘 다 가 봤으면 실선, 아니면 점선
  worldEdges().forEach(([a, b]) => {
    if (!inMapSet.has(a) || !inMapSet.has(b)) return;
    const p = pos(a), q = pos(b);
    const both = visited.has(a) && visited.has(b);
    c.strokeStyle = both ? "rgba(122,62,20,.85)" : "rgba(122,62,20,.35)";
    c.lineWidth = both ? 3 : 2;
    c.setLineDash(both ? [] : [5, 4]);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
  });
  c.setLineDash([]);
  // 지역 칸 (네모). 가 본 곳 = 진한 칸 + 지역 색 테두리 + 밝은 이름 / 못 가 본 곳 = 회색 칸 + 흐린 이름 (비활성)
  nodes.forEach(id => {
    const p = pos(id), m = GameData.maps[id];
    const seen = visited.has(id);
    const color = NODE_STYLE[m.bgm] || NODE_STYLE[m.battleBg] || "#e2e8f0";
    const x = p.x - BW / 2, y = p.y - BH / 2;
    c.save();
    c.shadowColor = "rgba(60,40,10,.35)"; c.shadowOffsetY = 2; c.shadowBlur = 3;
    roundRect(c, x, y, BW, BH, 5);
    c.fillStyle = seen ? "#1b2240" : "rgba(90,96,110,.55)";
    c.fill();
    c.restore();
    roundRect(c, x, y, BW, BH, 5);
    c.lineWidth = id === cur ? 3 : 2;
    c.strokeStyle = id === cur ? "#ef4444" : seen ? color : "rgba(70,70,80,.6)";
    c.stroke();
    c.fillStyle = seen ? color : "rgba(70,70,80,.45)";
    c.fillRect(x + 4, y + 4, BW - 8, 4);
    c.font = `${seen ? "bold " : ""}11px 'Malgun Gothic', sans-serif`;
    c.textAlign = "center";
    c.fillStyle = seen ? "#fff7d6" : "rgba(230,230,235,.6)";
    c.fillText(m.name, p.x, p.y + 9, BW - 8);
  });
  // 지금 위치 표시 (이 지도에 있을 때)
  if (cur && inMapSet.has(cur)) {
    const p = pos(cur);
    c.fillStyle = "#ef4444";
    c.beginPath(); c.moveTo(p.x, p.y - BH / 2 - 2); c.lineTo(p.x - 6, p.y - BH / 2 - 13); c.lineTo(p.x + 6, p.y - BH / 2 - 13); c.fill();
  }
}

// 타일마다 평균색 (한 번만 계산)
function tileColors() {
  if (MapView.tileColors) return MapView.tileColors;
  const img = Images.tiles, size = GameData.tiles.size, n = GameData.tiles.tiles.length;
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const c = cv.getContext("2d");
  c.drawImage(img, 0, 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = tileSrc(i);
    let r = 0, g = 0, b = 0, k = 0;
    try {
      const d = c.getImageData(s.sx, s.sy, size, size).data;
      for (let j = 0; j < d.length; j += 4) if (d[j + 3] > 100) { r += d[j]; g += d[j + 1]; b += d[j + 2]; k++; }
    } catch (e) {}
    out.push(k ? `rgb(${r / k | 0},${g / k | 0},${b / k | 0})` : null);
  }
  MapView.tileColors = out;
  return out;
}

function drawAreaMap(cv) {
  const m = World.map;
  const cell = Math.max(3, Math.floor(Math.min(360 / m.w, 250 / m.h)));
  cv.width = m.w * cell; cv.height = m.h * cell;
  const c = cv.getContext("2d");
  const colors = tileColors();
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const oi = objectIndexAt(m, x, y);
      c.fillStyle = (oi && colors[oi]) || colors[m.ground[y][x]] || "#000";
      c.fillRect(x * cell, y * cell, cell, cell);
      if (!tileWalkable(m, x, y)) { c.fillStyle = "rgba(0,0,0,.28)"; c.fillRect(x * cell, y * cell, cell, cell); }
    }
  }
  (m.warps || []).forEach(w => {
    c.fillStyle = "#fff"; c.fillRect(w.x * cell - 1, w.y * cell - 1, cell + 2, cell + 2);
    c.fillStyle = "#d946ef"; c.fillRect(w.x * cell, w.y * cell, cell, cell);
  });
  mapEvents().filter(ev => eventActive(ev) && npcVisible(ev)).forEach(ev => {
    c.fillStyle = "#60a5fa";
    c.beginPath(); c.arc(ev.x * cell + cell / 2, ev.y * cell + cell / 2, Math.max(2, cell * .4), 0, Math.PI * 2); c.fill();
  });
  const px = player.x * cell + cell / 2, py = player.y * cell + cell / 2;
  c.fillStyle = "#fff"; c.beginPath(); c.arc(px, py, Math.max(3, cell * .6), 0, Math.PI * 2); c.fill();
  c.fillStyle = "#ef4444"; c.beginPath(); c.arc(px, py, Math.max(2, cell * .45), 0, Math.PI * 2); c.fill();
}
