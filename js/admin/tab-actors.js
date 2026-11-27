// ==========================================
// 탭: 캐릭터·몬스터 디자인 — 파티 캐릭터(외형·초상화·기본값·5스탯·성장·기본 장비·스킬), 몬스터(외형·기본값·5스탯·행동·전리품)
// 실제 능력치 계산은 게임과 같은 js/core/state.js 의 calcMemberStats / calcMonsterStats 를 쓴다.
// → data/characters.json, data/monsters.json 커밋
// ==========================================
import { $, esc, S, setStatus, setBusy, commitData, dataToText, options, drawCharPreview, drawMonsterPreview } from "./core.js";
import { SC } from "./tab-scenario.js";

const A = { sub: "party", party: 0, mon: null };
const BASES = [["hp", "HP"], ["mp", "MP"], ["atk", "공격"], ["matk", "마력"], ["def", "방어"]];
const FIVE = [["str", "STR 힘"], ["dex", "DEX 솜씨"], ["agi", "AGI 민첩"], ["con", "CON 체력"], ["int", "INT 지능"]];
const GROWS = [["hp", "HP"], ["mp", "MP"], ["def", "방어"], ...FIVE];
const pctTxt = (v) => `${Math.round(v * 1000) / 10}%`;
function derivedRow(label, d) {
  return `<tr><td>${label}</td><td>${d.maxHp}</td><td>${d.maxMp}</td><td>${d.atk}</td><td>${d.matk}</td><td>${d.def}</td><td>${pctTxt(d.crit)}</td><td>${pctTxt(d.evade)}</td>
    <td class="small">${FIVE.map(([k]) => d[k]).join(" / ")}</td></tr>`;
}
const DERIVED_HEAD = `<tr><th></th><th>HP</th><th>MP</th><th>공격</th><th>마력</th><th>방어</th><th>치명타</th><th>회피</th><th>STR/DEX/AGI/CON/INT</th></tr>`;
const FX = ["dark", "frost", "quake", "impact"];
const ID_RE = /^[a-z][a-z0-9_]*$/;

export function isActorsDirty() {
  return dataToText(GameData.characters) !== S.dataOriginal[`${DATA_DIR}/characters.json`] ||
         dataToText(GameData.monsters) !== S.dataOriginal[`${DATA_DIR}/monsters.json`];
}

function render() {
  document.querySelectorAll("#tab-actors [data-sub]").forEach(b => b.classList.toggle("on", b.dataset.sub === A.sub));
  ({ party: renderParty, monsters: renderMonsters, sprites: renderSprites })[A.sub]();
  $("actors-dirty").textContent = isActorsDirty() ? "● 저장하지 않은 변경" : "";
}

// ---------- 파티 ----------
function renderParty() {
  const list = GameData.characters.party;
  const c = list[A.party];
  const portraits = Object.keys(GameData.characters.portraits);
  const chars = Object.keys(GameData.sprites.characters.list);
  $("actors-list").innerHTML = list.map((p, i) => `<li class="${i === A.party ? "active" : ""}" data-i="${i}">${esc(p.name === "{hero}" ? "주인공 (이름 입력)" : p.name)} <small>${esc(p.id)}</small></li>`).join("");
  $("actors-list").querySelectorAll("li").forEach(li => li.onclick = () => { A.party = +li.dataset.i; render(); });
  $("actors-form").innerHTML = `
    <div class="preview-row"><canvas id="pv-char"></canvas><img id="pv-portrait" class="pv-portrait" src="${esc(GameData.characters.portraits[c.portrait] || "")}"></div>
    <div class="form-grid">
      <label>ID<input value="${esc(c.id)}" disabled></label>
      <label>이름 <small>{hero}=입력 이름</small><input data-k="name" value="${esc(c.name)}"></label>
      <label>역할<input data-k="role" value="${esc(c.role)}"></label>
      <label>맵 스프라이트<select data-k="sprite">${options(chars, c.sprite, k => `${GameData.sprites.characters.list[k].label} (${k})`)}</select></label>
      <label>초상화<select data-k="portrait">${options(portraits, c.portrait)}</select></label>
      <label><input type="checkbox" data-k="startUnlocked" ${c.startUnlocked ? "checked" : ""} ${A.party === 0 ? "disabled" : ""}> 처음부터 합류</label>
    </div>
    <div class="section-title">기본값 (Lv.1, 스탯·장비 보너스 전)</div>
    <table class="mini-table"><tr>${BASES.map(([, l]) => `<th>${l}</th>`).join("")}</tr>
      <tr>${BASES.map(([k]) => `<td><input type="number" data-stat="base.${k}" value="${(c.base || {})[k] ?? 0}"></td>`).join("")}</tr></table>
    <div class="section-title">5스탯 (Lv.1)</div>
    <table class="mini-table"><tr>${FIVE.map(([, l]) => `<th>${l}</th>`).join("")}</tr>
      <tr>${FIVE.map(([k]) => `<td><input type="number" data-stat="stats.${k}" value="${(c.stats || {})[k] ?? 0}"></td>`).join("")}</tr></table>
    <div class="section-title">레벨업 성장치 <small>(소수 가능, 레벨마다 더한 뒤 버림)</small></div>
    <table class="mini-table"><tr>${GROWS.map(([, l]) => `<th>${l}</th>`).join("")}</tr>
      <tr>${GROWS.map(([k]) => `<td><input type="number" step="0.5" data-stat="growth.${k}" value="${(c.growth || {})[k] ?? 0}"></td>`).join("")}</tr></table>
    <div class="section-title">기본 장비 (새 게임 시작 시)</div>
    <div class="form-grid">${EQUIP_SLOTS.map(slot => {
      const ids = Object.keys(GameData.items.items).filter(id => GameData.items.items[id].type === slot && canEquipDef(c.id, id));
      return `<label>${SLOT_INFO[slot].label}<select data-eq="${slot}">${options(["", ...ids], (c.equip || {})[slot] || "", v => v ? `${GameData.items.items[v].name} (${v})` : "없음")}</select></label>`;
    }).join("")}</div>
    <div class="section-title">실제 능력치 미리보기 <small>(기본 장비 기준, 대장간 강화 제외)</small></div>
    <table class="mini-table">${DERIVED_HEAD}${[1, 5, 10, 15].map(lv => derivedRow(`Lv.${lv}`, calcMemberStats(c, lv, c.equip || {}))).join("")}</table>
    <div class="section-title">스킬 (전투 커맨드 순서대로)</div>
    <div class="check-grid">${Object.entries(GameData.skills).map(([id, s]) => `<label><input type="checkbox" data-skill="${id}" ${c.skills.includes(id) ? "checked" : ""}> ${s.icon ? `<img src="${esc(s.icon)}" width="16" height="16" style="vertical-align:-3px">` : ""} ${esc(s.name)} <small>${id}</small></label>`).join("")}</div>
    <label class="wide">설명<textarea data-k="desc" rows="2">${esc(c.desc || "")}</textarea></label>`;
  drawCharPreview($("pv-char"), c.sprite, 3);
  $("actors-form").querySelectorAll("[data-k]").forEach(el => el.onchange = () => {
    c[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value;
    render();
  });
  $("actors-form").querySelectorAll("[data-stat]").forEach(el => el.onchange = () => {
    const [g, k] = el.dataset.stat.split(".");
    if (!c[g]) c[g] = {};
    c[g][k] = g === "growth" ? Math.max(0, Math.round((+el.value || 0) * 100) / 100) : Math.max(0, Math.round(+el.value || 0));
    render();
  });
  $("actors-form").querySelectorAll("[data-eq]").forEach(el => el.onchange = () => {
    if (!c.equip) c.equip = { weapon: "", armor: "", accessory: "" };
    c.equip[el.dataset.eq] = el.value;
    render();
  });
  $("actors-form").querySelectorAll("[data-skill]").forEach(el => el.onchange = () => {
    const id = el.dataset.skill;
    c.skills = el.checked ? [...c.skills, id] : c.skills.filter(s => s !== id);
    if (!c.skills.length) { c.skills = [id]; setStatus("스킬은 하나 이상 있어야 합니다.", "error"); }
    render();
  });
}

function canEquipDef(charId, itemId) {
  const it = GameData.items.items[itemId];
  return !!it && (!it.for || !it.for.length || it.for.includes(charId));
}

// ---------- 몬스터 ----------
function monsterUsage(id) {
  const where = [];
  Object.values(GameData.maps).forEach(m => { if (m.encounter && m.encounter.groups.some(g => g.enemies.includes(id))) where.push(`${m.name} (출현)`); });
  if (SC.lastScn) {
    const all = [...Object.values(SC.lastScn.scenes), ...SC.lastScn.events];
    all.forEach(b => b.steps.forEach(s => { if (s.t === "cmd" && s.name === "battle" && s.enemies.includes(id)) where.push(`${b.id} (이벤트 전투)`); }));
  }
  return where;
}

function renderMonsters() {
  const ids = Object.keys(GameData.monsters);
  if (!A.mon || !GameData.monsters[A.mon]) A.mon = ids[0];
  const m = GameData.monsters[A.mon];
  $("actors-list").innerHTML = ids.map(id => `<li class="${id === A.mon ? "active" : ""}" data-id="${id}">${esc(GameData.monsters[id].name)} <small>${id}</small></li>`).join("") +
    `<li class="list-actions"><button class="btn small" id="mon-new">＋ 새 몬스터</button><button class="btn small" id="mon-dup">복제</button><button class="btn small danger" id="mon-del">삭제</button></li>`;
  $("actors-list").querySelectorAll("li[data-id]").forEach(li => li.onclick = () => { A.mon = li.dataset.id; render(); });
  $("mon-new").onclick = () => addMonster(null);
  $("mon-dup").onclick = () => addMonster(m);
  $("mon-del").onclick = () => {
    const used = monsterUsage(A.mon);
    if (used.length) { alert(`사용 중이라 삭제할 수 없습니다:\n${used.join("\n")}`); return; }
    if (!confirm(`${m.name} (${A.mon}) 을(를) 삭제할까요?`)) return;
    delete GameData.monsters[A.mon]; A.mon = null; render();
  };
  const sprites = Object.keys(GameData.sprites.monsters.list);
  const items = Object.keys(GameData.items.items);
  const used = monsterUsage(A.mon);
  $("actors-form").innerHTML = `
    <div class="preview-row"><canvas id="pv-mon"></canvas><div class="meta">사용처: ${used.length ? esc(used.join(", ")) : "없음"}</div></div>
    <div class="form-grid">
      <label>ID<input value="${esc(A.mon)}" disabled></label>
      <label>이름<input data-k="name" value="${esc(m.name)}"></label>
      <label>스프라이트<select data-k="sprite">${options(sprites, m.sprite, k => `${GameData.sprites.monsters.list[k].label} (${k})`)}</select></label>
      ${[["exp", "경험치"], ["gold", "골드"]].map(([k, l]) => `<label>${l}<input type="number" data-n="${k}" value="${m[k]}"></label>`).join("")}
    </div>
    <div class="section-title">기본값 · 5스탯 <small>실제 HP·공격 등 = 기본값 + 스탯 효과 (캐릭터와 같은 공식)</small></div>
    <table class="mini-table"><tr>${[["hp", "HP"], ["atk", "공격"], ["matk", "마력"], ["def", "방어"]].map(([, l]) => `<th>${l}</th>`).join("")}${FIVE.map(([, l]) => `<th>${l}</th>`).join("")}</tr>
      <tr>${["hp", "atk", "matk", "def"].map(k => `<td><input type="number" data-mb="base.${k}" value="${(m.base || {})[k] ?? 0}"></td>`).join("")}${FIVE.map(([k]) => `<td><input type="number" data-mb="stats.${k}" value="${(m.stats || {})[k] ?? 0}"></td>`).join("")}</tr></table>
    <table class="mini-table">${DERIVED_HEAD}${derivedRow("실제", calcMonsterStats(m))}</table>
    <div class="meta">마력은 암흑·냉기 특수기의 피해에 쓰입니다. 회피율만큼 아군의 물리 공격이 빗나가고, 치명타율만큼 일반 공격이 강해집니다.</div>
    <div class="section-title">행동 (비중에 따라 무작위 선택)</div>
    <table class="mini-table"><tr><th>종류</th><th>이름</th><th>배율</th><th>대상</th><th>비중</th><th>이펙트</th><th></th></tr>
      ${m.actions.map((a, i) => `<tr><td><select data-a="${i}" data-f="type">${options(["attack", "special"], a.type, v => v === "attack" ? "일반 공격" : "특수기")}</select></td>
        <td><input data-a="${i}" data-f="name" value="${esc(a.name || "")}"></td>
        <td><input type="number" step="0.1" data-a="${i}" data-f="power" value="${a.power ?? 1}"></td>
        <td><select data-a="${i}" data-f="target">${options(["one", "all"], a.target || "one", v => v === "one" ? "한 명" : "전체")}</select></td>
        <td><input type="number" data-a="${i}" data-f="weight" value="${a.weight || 1}"></td>
        <td><select data-a="${i}" data-f="fx">${options(["", ...FX], a.fx || "")}</select></td>
        <td><button class="btn small" data-adel="${i}">✕</button></td></tr>`).join("")}</table>
    <button class="btn small" id="act-add">＋ 행동</button>
    <div class="section-title">전리품</div>
    <table class="mini-table"><tr><th>아이템</th><th>확률 (0~1)</th><th></th></tr>
      ${m.drops.map((d, i) => `<tr><td><select data-d="${i}" data-f="item">${options(items, d.item)}</select></td><td><input type="number" step="0.01" data-d="${i}" data-f="chance" value="${d.chance}"></td><td><button class="btn small" data-ddel="${i}">✕</button></td></tr>`).join("")}</table>
    <button class="btn small" id="drop-add">＋ 전리품</button>
    <label class="wide">설명<textarea data-k="desc" rows="2">${esc(m.desc || "")}</textarea></label>`;
  drawMonsterPreview($("pv-mon"), m.sprite, 3);
  const f = $("actors-form");
  f.querySelectorAll("[data-k]").forEach(el => el.onchange = () => { m[el.dataset.k] = el.value; render(); });
  f.querySelectorAll("[data-n]").forEach(el => el.onchange = () => { m[el.dataset.n] = Math.max(0, Math.round(+el.value || 0)); render(); });
  f.querySelectorAll("[data-mb]").forEach(el => el.onchange = () => {
    const [g, k] = el.dataset.mb.split(".");
    if (!m[g]) m[g] = {};
    m[g][k] = Math.max(0, Math.round(+el.value || 0));
    if (g === "base" && k === "hp" && m.base.hp < 1) m.base.hp = 1;
    render();
  });
  f.querySelectorAll("[data-a]").forEach(el => el.onchange = () => {
    const a = m.actions[+el.dataset.a], k = el.dataset.f;
    if (k === "power" || k === "weight") a[k] = +el.value; else if (el.value) a[k] = el.value; else delete a[k];
    render();
  });
  f.querySelectorAll("[data-adel]").forEach(b => b.onclick = () => { if (m.actions.length > 1) m.actions.splice(+b.dataset.adel, 1); render(); });
  $("act-add").onclick = () => { m.actions.push({ type: "attack", name: "공격", weight: 1 }); render(); };
  f.querySelectorAll("[data-d]").forEach(el => el.onchange = () => { const d = m.drops[+el.dataset.d]; d[el.dataset.f] = el.dataset.f === "chance" ? Math.max(0, Math.min(1, +el.value)) : el.value; render(); });
  f.querySelectorAll("[data-ddel]").forEach(b => b.onclick = () => { m.drops.splice(+b.dataset.ddel, 1); render(); });
  $("drop-add").onclick = () => { m.drops.push({ item: items[0], chance: 0.1 }); render(); };
}

function addMonster(copy) {
  const id = (prompt("새 몬스터 id (영문 소문자·숫자·_)", copy ? `${A.mon}_2` : "new_monster") || "").trim();
  if (!id) return;
  if (!ID_RE.test(id) || GameData.monsters[id]) { alert("id 형식이 맞지 않거나 이미 있습니다."); return; }
  GameData.monsters[id] = copy ? JSON.parse(JSON.stringify(copy)) : { name: "새 몬스터", sprite: Object.keys(GameData.sprites.monsters.list)[0],
    base: { hp: 30, atk: 2, matk: 2, def: 0 }, stats: { str: 4, dex: 4, agi: 4, con: 4, int: 2 }, exp: 10, gold: 10, actions: [{ type: "attack", name: "공격", weight: 1 }], drops: [], desc: "" };
  if (copy) GameData.monsters[id].name += " 2";
  A.mon = id; render();
}

// ---------- 스프라이트 목록 ----------
function renderSprites() {
  $("actors-list").innerHTML = `<li class="muted">스크립트의 <code>* sprite</code>, 캐릭터·몬스터의 외형에 쓰는 키 목록입니다. 그림은 tools/gen_assets.py 로 생성합니다.</li>`;
  const chars = Object.entries(GameData.sprites.characters.list);
  const mons = Object.entries(GameData.sprites.monsters.list);
  $("actors-form").innerHTML = `<div class="section-title">캐릭터 스프라이트 (4방향)</div><div class="sprite-grid">${chars.map(([k, v]) => `<div class="sprite-card"><canvas data-c="${k}"></canvas><b>${esc(v.label)}</b><small>${k}</small></div>`).join("")}</div>
    <div class="section-title">몬스터 스프라이트</div><div class="sprite-grid">${mons.map(([k, v]) => `<div class="sprite-card"><canvas data-m="${k}"></canvas><b>${esc(v.label)}</b><small>${k}</small></div>`).join("")}</div>`;
  $("actors-form").querySelectorAll("[data-c]").forEach(cv => drawCharPreview(cv, cv.dataset.c, 2));
  $("actors-form").querySelectorAll("[data-m]").forEach(cv => drawMonsterPreview(cv, cv.dataset.m, 2));
}

async function saveActors() {
  if (S.busy) return;
  const changes = [
    { path: `${DATA_DIR}/characters.json`, content: dataToText(GameData.characters) },
    { path: `${DATA_DIR}/monsters.json`, content: dataToText(GameData.monsters) }
  ];
  if (!isActorsDirty()) { setStatus("저장할 변경이 없습니다."); return; }
  if (!confirm("캐릭터·몬스터 데이터를 GitHub에 커밋합니다. 계속할까요?")) return;
  setBusy(true);
  try {
    const sha = await commitData(changes, "data: 캐릭터·몬스터 수정");
    setStatus(`✅ 캐릭터·몬스터 저장 완료${sha ? ` — 커밋 ${sha.slice(0, 7)}` : ""}`, "ok");
    render();
  } catch (e) { setStatus(`저장 실패: ${e.message}`, "error"); }
  finally { setBusy(false); }
}

export function initActorsTab() {
  document.querySelectorAll("#tab-actors [data-sub]").forEach(b => b.onclick = () => { A.sub = b.dataset.sub; render(); });
  $("actors-save").onclick = saveActors;
}
export function showActorsTab() { render(); }
