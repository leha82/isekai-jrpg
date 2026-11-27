// ==========================================
// 지도 (메뉴 '지도' 탭 · 단축키 M)
//  - 월드 지도: data/game.json 의 worldMap 위치에 지역을 그리고, 맵 출구(warps)로 이어진 길을 잇는다.
//               가 본 지역만 이름이 보이고, 가 본 곳과 이어진 지역은 '???' 로 보인다. 실내 맵(parent)은 바깥 지역에 포함.
//  - 현재 지역: 지금 맵 전체를 타일 평균색으로 축소해 그리고 출구·사람·내 위치를 표시한다.
// ==========================================
const MapView = { tileColors: null };

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
  return `<div class="map-wrap">
    <div class="map-box"><div class="section-title">월드 지도 <small>베일하르트 대륙</small></div><canvas id="map-world" width="360" height="250"></canvas></div>
    <div class="map-box"><div class="section-title">${escapeHtml(m.name)} <small>${m.w}×${m.h}</small></div><canvas id="map-area"></canvas>
      <div class="map-legend"><span><i style="background:#ef4444"></i>나</span><span><i style="background:#60a5fa"></i>사람</span><span><i style="background:#d946ef"></i>출구</span></div>
      <div class="muted small">${exits.map(e => escapeHtml(e.text)).join(" · ") || "출구 없음"}</div></div>
  </div>`;
}

function drawMapTab() {
  const w = $("map-world"), a = $("map-area");
  if (w) drawWorldMap(w);
  if (a) drawAreaMap(a);
}

const NODE_STYLE = {
  town: "#facc15", castle: "#fbbf24", field: "#4ade80", forest: "#16a34a", mountain: "#b45309", snow: "#7dd3fc", dungeon: "#a855f7"
};

function drawWorldMap(cv) {
  const c = cv.getContext("2d"), W = cv.width, H = cv.height;
  const wm = GameData.game.worldMap || {};
  const pos = (id) => ({ x: 24 + wm[id].x / 100 * (W - 48), y: 18 + wm[id].y / 100 * (H - 36) });
  const g = c.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * .7);
  g.addColorStop(0, "#2a2f4a"); g.addColorStop(1, "#11142a");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // 바다 같은 테두리 무늬
  c.strokeStyle = "rgba(125,211,252,.12)"; c.lineWidth = 1;
  for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(W / 2, H / 2, W * .48 - i * 6, H * .46 - i * 5, 0, 0, Math.PI * 2); c.stroke(); }
  // 나침반
  c.fillStyle = "#fde68a"; c.font = "bold 11px 'Malgun Gothic', sans-serif"; c.textAlign = "center";
  c.fillText("N", W - 18, 16); c.beginPath(); c.moveTo(W - 18, 20); c.lineTo(W - 22, 30); c.lineTo(W - 14, 30); c.fill();

  const visited = visitedNodes();
  const cur = worldNodeOf(player.map);
  const edges = worldEdges();
  const known = new Set(visited);
  edges.forEach(([a, b]) => { if (visited.has(a)) known.add(b); if (visited.has(b)) known.add(a); });
  // 길
  edges.forEach(([a, b]) => {
    if (!known.has(a) || !known.has(b)) return;
    const p = pos(a), q = pos(b);
    const both = visited.has(a) && visited.has(b);
    c.strokeStyle = both ? "rgba(253,230,138,.75)" : "rgba(148,163,184,.4)";
    c.lineWidth = both ? 3 : 2;
    c.setLineDash(both ? [] : [4, 4]);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
  });
  c.setLineDash([]);
  // 지역
  Object.keys(wm).filter(id => wm[id].x !== undefined && GameData.maps[id]).forEach(id => {
    if (!known.has(id)) return;
    const p = pos(id), m = GameData.maps[id];
    const seen = visited.has(id);
    const color = seen ? (NODE_STYLE[m.bgm] || NODE_STYLE[m.battleBg] || "#e2e8f0") : "#475569";
    const town = ["town", "castle"].includes(m.bgm);
    c.fillStyle = "#0b0d18"; c.strokeStyle = color; c.lineWidth = 2;
    c.beginPath();
    if (town) c.rect(p.x - 7, p.y - 7, 14, 14); else c.arc(p.x, p.y, 7, 0, Math.PI * 2);
    c.fill(); c.stroke();
    c.fillStyle = color;
    c.beginPath();
    if (town) c.rect(p.x - 4, p.y - 4, 8, 8); else c.arc(p.x, p.y, 4, 0, Math.PI * 2);
    c.fill();
    const label = seen ? m.name : "???";
    c.font = `${id === cur ? "bold " : ""}11px 'Malgun Gothic', sans-serif`;
    // 이름표는 지점 오른쪽 (화면 오른쪽 끝이면 왼쪽)
    const right = p.x < W - 90;
    c.textAlign = right ? "left" : "right";
    const lx = p.x + (right ? 12 : -12), ly = p.y + 4;
    c.lineWidth = 3; c.strokeStyle = "#0b0d18"; c.strokeText(label, lx, ly);
    c.fillStyle = id === cur ? "#fde68a" : seen ? "#e2e8f0" : "#94a3b8"; c.fillText(label, lx, ly);
  });
  // 현재 위치
  if (cur) {
    const p = pos(cur);
    c.strokeStyle = "#ef4444"; c.lineWidth = 2;
    c.beginPath(); c.arc(p.x, p.y, 12, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "#ef4444";
    c.beginPath(); c.moveTo(p.x, p.y - 12); c.lineTo(p.x - 6, p.y - 24); c.lineTo(p.x + 6, p.y - 24); c.fill();
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
