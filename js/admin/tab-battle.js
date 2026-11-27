// ==========================================
// 탭: 전투 설정 — 전투 공식·확률·5스탯 계수(battle.json), 스킬(skills.json), 아이템·장비·상점(items.json)
// 아이콘은 이미지 경로 (assets/img/icons/items|skills/*.svg — tools/gen_svg.py 로 생성)
// ==========================================
import { $, esc, S, setStatus, setBusy, commitData, dataToText, options } from "./core.js";

const BT = { sub: "rules" };
const ID_RE = /^[a-z][a-z0-9_]*$/;
const RULES = [
  ["encounterRate", "인카운트 배율 (맵 확률 × 이 값)", 0.1], ["encounterGraceSteps", "전투 후 안전 걸음 수", 1],
  ["fleeChance", "도망 성공 확률 (0~1)", 0.05], ["defenseFactor", "적 공격 시 방어력 반영 비율", 0.05],
  ["minDamage", "아군 최소 피해", 1], ["enemyMinDamage", "적 최소 피해", 1],
  ["critMultiplier", "치명타 배율", 0.1], ["guardReduction", "철벽수호 피해 배율", 0.05],
  ["animationSpeed", "전투 연출 속도 (1 = 기본, 2 = 두 배 빠르게)", 0.25]
];
const STAT_RULES = [
  ["atkPerStr", "STR 1당 공격력", 0.5], ["matkPerInt", "INT 1당 마력", 0.5], ["mpPerInt", "INT 1당 MP", 0.5],
  ["hpPerCon", "CON 1당 HP", 0.5], ["defPerCon", "CON 1당 방어력", 0.1],
  ["critBase", "기본 치명타율 (0~1)", 0.01], ["critPerDex", "DEX 1당 치명타율", 0.001], ["critPerAgi", "AGI 1당 치명타율", 0.001],
  ["evadePerAgi", "AGI 1당 회피율", 0.001], ["evadePerDex", "DEX 1당 회피율", 0.001], ["maxCrit", "치명타율 상한", 0.05], ["maxEvade", "회피율 상한", 0.05]
];
const ITEM_TYPES = { heal_hp: "HP 회복", heal_mp: "MP 회복", key: "퀘스트 아이템", map: "지도 (퀘스트 아이템)", weapon: "무기", armor: "방어구", accessory: "장신구" };
const BONUS_KEYS = ["str", "dex", "agi", "con", "int", "atk", "matk", "def", "hp", "mp"];
const bonusToText = (b) => Object.entries(b || {}).filter(([, v]) => v).map(([k, v]) => `${k}${v > 0 ? "+" : ""}${v}`).join(",");
function textToBonus(t) {
  const out = {};
  String(t).split(",").map(x => x.trim()).filter(Boolean).forEach(x => {
    const m = x.match(/^([a-z]+)\s*([+-]?\d+)$/);
    if (m && BONUS_KEYS.includes(m[1])) out[m[1]] = +m[2];
  });
  return out;
}
function iconOptions(dir, current) {
  const files = ((GameData.assets && GameData.assets.files) || []).map(f => f.path).filter(p => p.startsWith(`assets/img/icons/${dir}/`));
  if (current && !files.includes(current)) files.unshift(current);
  return options(["", ...files], current || "", p => p ? p.split("/").pop().replace(".svg", "") : "없음");
}
const FILES = ["battle", "skills", "items"];

export function isBattleDirty() { return FILES.some(f => dataToText(GameData[f]) !== S.dataOriginal[`${DATA_DIR}/${f}.json`]); }

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function render() {
  document.querySelectorAll("#tab-battle [data-sub]").forEach(b => b.classList.toggle("on", b.dataset.sub === BT.sub));
  ({ rules: renderRules, skills: renderSkills, items: renderItems })[BT.sub]();
  $("battle-dirty").textContent = isBattleDirty() ? "● 저장하지 않은 변경" : "";
}

function renderRules() {
  const b = GameData.battle;
  let need = b.levelCurve.base, total = 0;
  const curve = [];
  for (let lv = 1; lv <= 12; lv++) { total += need; curve.push(`Lv${lv}→${lv + 1}: ${need} (누적 ${total})`); need = Math.floor(need * b.levelCurve.growth); }
  $("battle-body").innerHTML = `<div class="form-grid">
      ${RULES.map(([k, l, step]) => `<label>${l}<input type="number" step="${step}" data-r="${k}" value="${b[k]}"></label>`).join("")}
      <label>레벨업 기본 경험치<input type="number" data-lc="base" value="${b.levelCurve.base}"></label>
      <label>레벨당 필요 경험치 배율<input type="number" step="0.05" data-lc="growth" value="${b.levelCurve.growth}"></label>
      ${Object.entries({ weaponCostPerLevel: "무기 연마 가격(Lv당)", armorCostPerLevel: "방어구 강화 가격(Lv당)", weaponAtk: "무기 1단계 공격+", weaponMatk: "무기 1단계 마력+", armorDef: "방어구 1단계 방어+", armorHp: "방어구 1단계 HP+" })
        .map(([k, l]) => `<label>${l}<input type="number" data-up="${k}" value="${b.upgrade[k]}"></label>`).join("")}
    </div>
    <div class="section-title">5스탯 계수 <small>캐릭터·몬스터 공용</small></div>
    <div class="form-grid">${STAT_RULES.map(([k, l, step]) => `<label>${l}<input type="number" step="${step}" data-st="${k}" value="${(b.stats || {})[k] ?? 0}"></label>`).join("")}</div>
    <div class="section-title">경험치 곡선 미리보기</div><div class="meta">${curve.join(" · ")}</div>
    <div class="section-title">피해 공식</div>
    <div class="meta">능력치: 공격 = 기본 + STR×계수 · 마력 = 기본 + INT×계수 · 방어 = 기본 + ⌊CON×계수⌋ · HP = 기본 + CON×계수 · MP = 기본 + INT×계수 (+ 장비·레벨 성장)<br>
      치명타율 = 기본 + DEX×계수 + AGI×계수 (+ 스킬 치명) · 회피율 = AGI×계수 + DEX×계수 — 물리 공격·적 일반 공격은 회피될 수 있다<br>
      물리: 공격력 × 배율 + 0~편차 (치명타 시 × 치명타 배율) − 적 방어<br>
      마법: 마력 × 배율 + 0~편차 − 적 방어 × 0.5<br>
      적 → 아군: 적 공격 × 행동 배율 − 아군 방어 × 방어 반영 비율 + 0~3 (철벽수호 시 × 철벽수호 배율)<br>
      맵별 인카운트 확률·출현 적은 '맵 디자인' 탭의 맵 속성에서 바꿉니다.</div>`;
  const body = $("battle-body");
  body.querySelectorAll("[data-r]").forEach(el => el.onchange = () => { b[el.dataset.r] = num(el.value); render(); });
  body.querySelectorAll("[data-lc]").forEach(el => el.onchange = () => { b.levelCurve[el.dataset.lc] = num(el.value); render(); });
  body.querySelectorAll("[data-up]").forEach(el => el.onchange = () => { b.upgrade[el.dataset.up] = Math.round(num(el.value)); render(); });
  body.querySelectorAll("[data-st]").forEach(el => el.onchange = () => { if (!b.stats) b.stats = {}; b.stats[el.dataset.st] = num(el.value); render(); });
}

function renderSkills() {
  const sk = GameData.skills;
  const sfx = Object.keys(GameData.audio.sfx);
  const users = (id) => GameData.characters.party.filter(c => c.skills.includes(id)).map(c => c.id);
  $("battle-body").innerHTML = `<table class="mini-table wide-table"><tr><th>ID</th><th>아이콘</th><th>이름</th><th>MP</th><th>종류</th><th>대상</th><th>배율</th><th>고정량</th><th>편차</th><th>치명</th><th>이펙트</th><th>효과음</th><th>설명</th><th>사용</th><th></th></tr>
    ${Object.entries(sk).map(([id, s]) => `<tr><td>${id}</td>
      <td>${s.icon ? `<img src="${esc(s.icon)}" width="20" height="20">` : ""}<select data-s="${id}" data-f="icon">${iconOptions("skills", s.icon)}</select></td>
      <td><input data-s="${id}" data-f="name" value="${esc(s.name)}"></td>
      <td><input type="number" data-s="${id}" data-f="mp" value="${s.mp || 0}"></td>
      <td><select data-s="${id}" data-f="type">${options(["physical", "magic", "heal", "guard"], s.type, v => ({ physical: "물리", magic: "마법", heal: "회복", guard: "방어" }[v]))}</select></td>
      <td><select data-s="${id}" data-f="target">${options(["enemy", "all_enemies", "ally", "all_allies"], s.target, v => ({ enemy: "적 하나", all_enemies: "적 전체", ally: "아군 하나", all_allies: "아군 전체" }[v]))}</select></td>
      <td><input type="number" step="0.05" data-s="${id}" data-f="power" value="${s.power ?? ""}"></td>
      <td><input type="number" data-s="${id}" data-f="base" value="${s.base ?? ""}"></td>
      <td><input type="number" data-s="${id}" data-f="variance" value="${s.variance ?? ""}"></td>
      <td><input type="number" step="0.05" data-s="${id}" data-f="crit" value="${s.crit ?? ""}"></td>
      <td><select data-s="${id}" data-f="fx">${options(["slash", "bigslash", "arrow", "stone", "fire", "wind", "heal", "shield"], s.fx)}</select></td>
      <td><select data-s="${id}" data-f="sfx">${options(sfx, s.sfx)}</select></td>
      <td><input data-s="${id}" data-f="desc" value="${esc(s.desc || "")}"></td>
      <td class="small">${users(id).join(", ") || "-"}</td>
      <td><button class="btn small" data-sdel="${id}">✕</button></td></tr>`).join("")}</table>
    <button class="btn small" id="skill-add">＋ 새 스킬</button>
    <p class="muted small">캐릭터가 쓰는 스킬은 '캐릭터·몬스터' 탭에서 고릅니다. 빈 칸은 0/없음으로 처리됩니다.</p>`;
  const body = $("battle-body");
  body.querySelectorAll("[data-s]").forEach(el => el.onchange = () => {
    const s = sk[el.dataset.s], k = el.dataset.f;
    if (["mp", "power", "base", "variance", "crit"].includes(k)) { if (el.value === "") delete s[k]; else s[k] = num(el.value); }
    else s[k] = el.value;
    render();
  });
  body.querySelectorAll("[data-sdel]").forEach(b => b.onclick = () => {
    const id = b.dataset.sdel;
    if (users(id).length) { alert(`이 스킬을 쓰는 캐릭터가 있습니다: ${users(id).join(", ")}`); return; }
    if (confirm(`${sk[id].name} (${id}) 스킬을 삭제할까요?`)) { delete sk[id]; render(); }
  });
  $("skill-add").onclick = () => {
    const id = (prompt("새 스킬 id (영문 소문자·숫자·_)", "new_skill") || "").trim();
    if (!id) return;
    if (!ID_RE.test(id) || sk[id]) { alert("id 형식이 맞지 않거나 이미 있습니다."); return; }
    sk[id] = { name: "새 스킬", icon: "", mp: 0, type: "physical", target: "enemy", fx: "slash", sfx: "slash", power: 1, variance: 3, desc: "" };
    render();
  };
}

function renderItems() {
  const it = GameData.items.items, shops = GameData.items.shops;
  $("battle-body").innerHTML = `<div class="section-title">아이템</div>
    <table class="mini-table wide-table"><tr><th>ID</th><th>아이콘</th><th>이름</th><th>종류</th><th>회복량</th><th>장비 보너스 <small>(str+2,atk+4)</small></th><th>장착 가능 <small>(id, 비우면 누구나)</small> / 지도: 지역 맵 id</th><th>가격</th><th>설명</th><th></th></tr>
    ${Object.entries(it).map(([id, v]) => `<tr><td>${id}</td><td>${v.icon ? `<img src="${esc(v.icon)}" width="20" height="20">` : ""}<select data-i="${id}" data-f="icon">${iconOptions("items", v.icon)}</select></td>
      <td><input data-i="${id}" data-f="name" value="${esc(v.name)}"></td>
      <td><select data-i="${id}" data-f="type">${options(Object.keys(ITEM_TYPES), v.type, t => ITEM_TYPES[t])}</select></td>
      <td><input type="number" data-i="${id}" data-f="amount" value="${v.amount ?? ""}"></td>
      <td><input data-i="${id}" data-f="bonus" value="${esc(bonusToText(v.bonus))}" style="width:120px" ${["weapon", "armor", "accessory"].includes(v.type) ? "" : "disabled"}></td>
      <td>${v.type === "map"
        ? `<input data-i="${id}" data-f="nodes" value="${esc((v.nodes || []).join(","))}" style="width:150px" title="이 지도에 그릴 지역 맵 id (쉼표)"> 장<input type="number" data-i="${id}" data-f="chapter" value="${v.chapter ?? ""}" style="width:40px" title="챕터">`
        : `<input data-i="${id}" data-f="for" value="${esc((v.for || []).join(","))}" style="width:90px" ${["weapon", "armor", "accessory"].includes(v.type) ? "" : "disabled"}>`}</td>
      <td><input type="number" data-i="${id}" data-f="price" value="${v.price ?? 0}"></td>
      <td><input data-i="${id}" data-f="desc" value="${esc(v.desc || "")}" style="width:240px"></td>
      <td><button class="btn small" data-idel="${id}">✕</button></td></tr>`).join("")}</table>
    <button class="btn small" id="item-add">＋ 새 아이템</button>
    <div class="section-title">상점</div>
    <table class="mini-table wide-table"><tr><th>ID</th><th>이름</th><th>판매 아이템 (쉼표)</th><th>여관 가격 (0=없음)</th><th>장비 강화</th><th></th></tr>
    ${Object.entries(shops).map(([id, s]) => `<tr><td>${id}</td><td><input data-sh="${id}" data-f="name" value="${esc(s.name)}"></td>
      <td><input data-sh="${id}" data-f="items" value="${esc(s.items.join(","))}" style="width:200px"></td>
      <td><input type="number" data-sh="${id}" data-f="inn" value="${s.inn}"></td>
      <td><input type="checkbox" data-sh="${id}" data-f="upgrades" ${s.upgrades ? "checked" : ""}></td>
      <td><button class="btn small" data-shdel="${id}">✕</button></td></tr>`).join("")}</table>
    <button class="btn small" id="shop-add">＋ 새 상점</button>
    <p class="muted small">시나리오에서 <code>&gt; shop 상점ID</code>, <code>&gt; item 아이템ID +N</code> 으로 씁니다.</p>`;
  const body = $("battle-body");
  body.querySelectorAll("[data-i]").forEach(el => el.onchange = () => {
    const v = it[el.dataset.i], k = el.dataset.f;
    if (k === "amount" || k === "price" || k === "chapter") { if (el.value === "") delete v[k]; else v[k] = Math.max(0, Math.round(num(el.value))); }
    else if (k === "nodes") {
      const ids = el.value.split(",").map(x => x.trim()).filter(Boolean);
      const bad = ids.filter(x => !(GameData.game.worldMap || {})[x]);
      if (bad.length) { setStatus(`월드 지도 위치(game.json worldMap)가 없는 맵 id: ${bad.join(", ")}`, "error"); render(); return; }
      v.nodes = ids;
    }
    else if (k === "bonus") v.bonus = textToBonus(el.value);
    else if (k === "for") {
      const ids = el.value.split(",").map(x => x.trim()).filter(Boolean);
      const bad = ids.filter(x => !GameData.characters.party.some(c => c.id === x));
      if (bad.length) { setStatus(`없는 파티원 id: ${bad.join(", ")}`, "error"); render(); return; }
      v.for = ids;
    }
    else {
      v[k] = el.value;
      if (k === "type" && ["weapon", "armor", "accessory"].includes(el.value)) { if (!v.bonus) v.bonus = {}; if (!v.for) v.for = []; delete v.amount; }
      if (k === "type" && el.value === "map") { if (!v.nodes) v.nodes = []; delete v.amount; delete v.bonus; delete v.for; }
    }
    render();
  });
  body.querySelectorAll("[data-idel]").forEach(b => b.onclick = () => {
    const id = b.dataset.idel;
    const inShop = Object.keys(shops).filter(s => shops[s].items.includes(id));
    if (inShop.length || ["potion", "ether"].includes(id)) { alert(`삭제할 수 없습니다 (${inShop.length ? "상점: " + inShop.join(", ") : "시작 아이템"})`); return; }
    if (confirm(`${it[id].name} 아이템을 삭제할까요? (스크립트에서 쓰고 있다면 검사 오류가 납니다)`)) { delete it[id]; render(); }
  });
  $("item-add").onclick = () => {
    const id = (prompt("새 아이템 id", "new_item") || "").trim();
    if (!id) return;
    if (!ID_RE.test(id) || it[id]) { alert("id 형식이 맞지 않거나 이미 있습니다."); return; }
    it[id] = { name: "새 아이템", icon: "", type: "key", price: 0, desc: "" }; render();
  };
  body.querySelectorAll("[data-sh]").forEach(el => el.onchange = () => {
    const s = shops[el.dataset.sh], k = el.dataset.f;
    if (k === "items") {
      const ids = el.value.split(",").map(x => x.trim()).filter(Boolean);
      const bad = ids.filter(x => !it[x]);
      if (bad.length) { setStatus(`없는 아이템: ${bad.join(", ")}`, "error"); render(); return; }
      s.items = ids;
    } else if (k === "inn") s.inn = Math.max(0, Math.round(num(el.value)));
    else if (k === "upgrades") s.upgrades = el.checked;
    else s[k] = el.value;
    render();
  });
  body.querySelectorAll("[data-shdel]").forEach(b => b.onclick = () => { if (confirm(`${shops[b.dataset.shdel].name} 상점을 삭제할까요?`)) { delete shops[b.dataset.shdel]; render(); } });
  $("shop-add").onclick = () => {
    const id = (prompt("새 상점 id", "new_shop") || "").trim();
    if (!id) return;
    if (!ID_RE.test(id) || shops[id]) { alert("id 형식이 맞지 않거나 이미 있습니다."); return; }
    shops[id] = { name: "새 상점", items: ["potion"], inn: 0, upgrades: false }; render();
  };
}

async function saveBattle() {
  if (S.busy) return;
  if (!isBattleDirty()) { setStatus("저장할 변경이 없습니다."); return; }
  if (!confirm("전투 설정·스킬·아이템 데이터를 GitHub에 커밋합니다. 계속할까요?")) return;
  setBusy(true);
  try {
    const sha = await commitData(FILES.map(f => ({ path: `${DATA_DIR}/${f}.json`, content: dataToText(GameData[f]) })), "data: 전투 설정·스킬·아이템 수정");
    setStatus(`✅ 전투 설정 저장 완료${sha ? ` — 커밋 ${sha.slice(0, 7)}` : ""}`, "ok");
    render();
  } catch (e) { setStatus(`저장 실패: ${e.message}`, "error"); }
  finally { setBusy(false); }
}

export function initBattleTab() {
  // 아이콘 고르기 목록용 리소스 목록 (data/assets.json)
  fetch(`${DATA_DIR}/assets.json?t=${Date.now()}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => { if (j) GameData.assets = j; }).catch(() => {});
  document.querySelectorAll("#tab-battle [data-sub]").forEach(b => b.onclick = () => { BT.sub = b.dataset.sub; render(); });
  $("battle-save").onclick = saveBattle;
}
export function showBattleTab() { render(); }
