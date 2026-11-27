// ==========================================
// 탭: 이벤트 — 맵별 이벤트 목록·위치 확인, 클릭으로 위치 이동, 새 이벤트(NPC·밟기·조사) 추가
// 이벤트는 시나리오 스크립트의 @event 블록이므로, 저장은 '시나리오 저장(암호화)'으로 한다.
// ==========================================
import { $, esc, options, drawCharPreview } from "./core.js";
import { SC, parseCurrent, setFileText, gotoLine, saveScenario } from "./tab-scenario.js";

const E = { map: null, sel: null, moving: false, picking: false, form: null, scn: null };
const ID_RE = /^[A-Za-z_][\w-]*$/;

function events() { return (E.scn ? E.scn.events : []).filter(e => e.map === E.map); }

function draw() {
  const m = GameData.maps[E.map]; if (!m) return;
  const cv = $("ev-canvas"), c = cv.getContext("2d");
  const t = Math.max(12, Math.min(24, Math.floor(560 / Math.max(m.w, m.h))));
  cv.width = m.w * t; cv.height = m.h * t;
  c.imageSmoothingEnabled = false;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const g = tileSrc(m.ground[y][x]); c.drawImage(Images.tiles, g.sx, g.sy, g.size, g.size, x * t, y * t, t, t);
    if (m.objects[y][x]) { const o = tileSrc(m.objects[y][x]); c.drawImage(Images.tiles, o.sx, o.sy, o.size, o.size, x * t, y * t, t, t); }
  }
  c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(0, 0, cv.width, cv.height);
  (m.warps || []).forEach(w => { c.fillStyle = "rgba(168,85,247,.6)"; c.fillRect(w.x * t, w.y * t, t, t); });
  events().forEach(ev => {
    if (ev.sprite) { const s = charSrc(ev.sprite.key, ev.face || "down", 1); if (s) c.drawImage(Images.characters, s.sx, s.sy, s.size, s.size, ev.x * t, ev.y * t, t, t); }
    c.strokeStyle = ev === E.sel ? "#ff4fd8" : "#facc15"; c.lineWidth = ev === E.sel ? 3 : 2;
    c.strokeRect(ev.x * t + 1, ev.y * t + 1, t - 2, t - 2);
  });
  if (E.form && E.form.x !== undefined) { c.strokeStyle = "#22c55e"; c.lineWidth = 3; c.strokeRect(E.form.x * t + 1, E.form.y * t + 1, t - 2, t - 2); }
  cv.dataset.t = t;
}

function renderList() {
  const list = events();
  $("ev-table").innerHTML = `<tr><th>ID</th><th>이름</th><th>좌표</th><th>방식</th><th>스프라이트</th><th>파일</th></tr>` +
    (list.length ? list.map((ev, i) => `<tr data-i="${i}" class="${ev === E.sel ? "active" : ""}"><td>${esc(ev.id)}</td><td>${esc(ev.name)}</td><td>${ev.x},${ev.y}</td>
      <td>${ev.trigger === "talk" ? "말 걸기" : "밟기"}</td><td>${esc(ev.sprite ? ev.sprite.key : "-")}</td><td>${esc(ev.file)}:${ev.line}</td></tr>`).join("")
      : `<tr><td colspan="6" class="muted">이 맵에는 이벤트가 없습니다.</td></tr>`);
  $("ev-table").querySelectorAll("tr[data-i]").forEach(tr => {
    tr.onclick = () => { E.sel = list[+tr.dataset.i]; E.form = null; E.moving = false; render(); };
    tr.ondblclick = () => gotoLine(list[+tr.dataset.i].file, list[+tr.dataset.i].line);
  });
}

function renderDetail() {
  const el = $("ev-detail");
  if (E.form) { renderForm(); return; }
  const ev = E.sel;
  if (!ev) { el.innerHTML = `<p class="muted">왼쪽 목록이나 맵에서 이벤트를 고르세요.<br>노란 칸 = 이벤트, 보라 칸 = 출구</p>`; return; }
  const preview = ev.steps.slice(0, 6).map(s => s.t === "say" ? `${esc(s.speaker)}: ${esc(s.text.split("\n")[0])}` : s.t === "jump" ? `${s.cond ? "? " + esc(s.cond.src) + " " : ""}-> ${esc(s.target)}` : `> ${esc(s.name)}`).join("<br>");
  el.innerHTML = `<div class="card-title">${esc(ev.name)} <small>${esc(ev.id)}</small></div>
    <div class="meta">${esc(ev.map)} (${ev.x}, ${ev.y}) · ${ev.trigger === "talk" ? "말 걸기" : "밟기"}${ev.sprite ? ` · ${esc(ev.sprite.key)}${ev.sprite.cond ? ` (조건: ${esc(ev.sprite.cond.src)})` : ""}` : ""}</div>
    ${ev.sprite ? `<canvas id="ev-sprite"></canvas>` : ""}
    <div class="code-preview">${preview || "<span class='muted'>내용 없음</span>"}${ev.steps.length > 6 ? "<br>…" : ""}</div>
    <div class="btn-row">
      <button class="btn small" id="ev-open">📝 스크립트에서 열기</button>
      <button class="btn small ${E.moving ? "primary" : ""}" id="ev-move">${E.moving ? "맵을 클릭해 새 위치 지정…" : "📍 위치 옮기기"}</button>
    </div>`;
  if (ev.sprite) drawCharPreview($("ev-sprite"), ev.sprite.key, 2);
  $("ev-open").onclick = () => gotoLine(ev.file, ev.line);
  $("ev-move").onclick = () => { E.moving = !E.moving; renderDetail(); };
}

function renderForm() {
  const f = E.form;
  const files = [...SC.files.keys()].sort();
  const chars = Object.keys(GameData.sprites.characters.list);
  $("ev-detail").innerHTML = `<div class="card-title">새 이벤트</div>
    <div class="form-grid">
      <label>ID<input id="nf-id" value="${esc(f.id)}"></label>
      <label>이름<input id="nf-name" value="${esc(f.name)}"></label>
      <label>위치<input value="${f.x === undefined ? "맵을 클릭하세요" : `${f.x}, ${f.y}`}" disabled></label>
      <label>종류<select id="nf-kind">${options(["npc", "talk", "touch"], f.kind, k => ({ npc: "NPC (말 걸기)", talk: "조사 (말 걸기, 그림 없음)", touch: "밟으면 실행" }[k]))}</select></label>
      ${f.kind === "npc" ? `<label>스프라이트<select id="nf-sprite">${options(chars, f.sprite, k => `${GameData.sprites.characters.list[k].label} (${k})`)}</select></label>
      <label>바라보는 방향<select id="nf-face">${options(["down", "up", "left", "right"], f.face)}</select></label>` : ""}
      <label>화자<input id="nf-speaker" value="${esc(f.speaker)}"></label>
      <label class="wide">첫 대사<input id="nf-line" value="${esc(f.line)}"></label>
      <label class="wide">추가할 파일<select id="nf-file">${options(files, f.file)}</select></label>
    </div>
    ${f.kind === "npc" ? `<canvas id="nf-preview"></canvas>` : ""}
    <div class="btn-row"><button class="btn small primary" id="nf-add">＋ 스크립트에 추가</button><button class="btn small" id="nf-cancel">취소</button></div>
    <p class="muted small">추가한 뒤 '시나리오' 탭에서 대사·분기를 더 쓰고 🔒 저장하세요.</p>`;
  if (f.kind === "npc") drawCharPreview($("nf-preview"), f.sprite, 2);
  const bind = (id, k) => { const el = $(id); if (el) el.onchange = () => { f[k] = el.value; renderForm(); draw(); }; };
  ["id", "name", "kind", "sprite", "face", "speaker", "line", "file"].forEach(k => bind(`nf-${k}`, k));
  $("nf-cancel").onclick = () => { E.form = null; render(); };
  $("nf-add").onclick = addEvent;
}

function addEvent() {
  const f = E.form;
  if (!ID_RE.test(f.id)) { alert("ID 는 영문·숫자·_·- 로 쓰세요."); return; }
  if (E.scn.events.some(e => e.id === f.id)) { alert("이미 있는 이벤트 ID 입니다."); return; }
  if (f.x === undefined) { alert("맵을 클릭해 위치를 정하세요."); return; }
  if (E.scn.events.some(e => e.map === E.map && e.x === f.x && e.y === f.y)) { alert("그 칸에는 이미 이벤트가 있습니다."); return; }
  const lines = [`@event ${f.id} ${E.map}:${f.x},${f.y} ${f.name || f.id}`];
  if (f.kind === "npc") { lines.push(`* sprite ${f.sprite}`); lines.push(`* face ${f.face}`); }
  if (f.kind === "talk") lines.push("* trigger talk");
  lines.push(`${f.speaker || "시스템"}: ${f.line || "…"}`);
  const text = SC.files.get(f.file).text.replace(/\s*$/, "\n") + "\n" + lines.join("\n") + "\n";
  setFileText(f.file, text);
  E.form = null;
  refresh();
  E.sel = events().find(e => e.id === f.id) || null;
  render();
}

function moveEvent(ev, x, y) {
  const file = SC.files.get(ev.file);
  const lines = file.text.split("\n");
  lines[ev.line - 1] = `@event ${ev.id} ${ev.map}:${x},${y}${ev.name && ev.name !== ev.id ? " " + ev.name : ""}`;
  setFileText(ev.file, lines.join("\n"));
  refresh();
  E.sel = events().find(e => e.id === ev.id) || null;
}

function onCanvasClick(e) {
  const cv = $("ev-canvas"), r = cv.getBoundingClientRect(), t = +cv.dataset.t;
  const x = Math.floor((e.clientX - r.left) * cv.width / r.width / t), y = Math.floor((e.clientY - r.top) * cv.height / r.height / t);
  if (E.form) { E.form.x = x; E.form.y = y; renderForm(); draw(); return; }
  if (E.moving && E.sel) {
    if (events().some(v => v !== E.sel && v.x === x && v.y === y)) { alert("그 칸에는 이미 이벤트가 있습니다."); return; }
    moveEvent(E.sel, x, y); E.moving = false; render(); return;
  }
  E.sel = events().find(v => v.x === x && v.y === y) || null;
  render();
}

function refresh() { E.scn = parseCurrent(); }

function render() {
  $("ev-map").innerHTML = options(GameData.game.maps, E.map, id => `${GameData.maps[id].name} (${id}) — 이벤트 ${(E.scn ? E.scn.events : []).filter(e => e.map === id).length}`);
  renderList(); renderDetail(); draw();
}

export function initEventsTab() {
  $("ev-map").onchange = (e) => { E.map = e.target.value; E.sel = null; E.form = null; render(); };
  $("ev-canvas").addEventListener("click", onCanvasClick);
  $("ev-new").onclick = () => {
    if (!SC.loaded && !SC.files.size) { alert("먼저 시나리오를 불러오세요."); return; }
    const files = [...SC.files.keys()].sort();
    const sameMap = events()[0];
    E.form = { id: `${E.map}_npc_${Date.now() % 1000}`, name: "주민", kind: "npc", sprite: "villager_m", face: "down", speaker: "주민", line: "안녕하세요!",
               file: sameMap ? sameMap.file : files[files.length - 1] };
    E.sel = null; E.moving = false; render();
  };
  $("ev-save").onclick = saveScenario;
}

export function showEventsTab() {
  if (!E.map || !GameData.maps[E.map]) E.map = GameData.game.maps[0];
  refresh();
  if (E.sel) E.sel = events().find(e => e.id === E.sel.id) || null;
  render();
}
