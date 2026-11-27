// ==========================================
// 게임 상태
// gameState: LOADING | TITLE | WORLD | DIALOG | MODAL | SYSTEM | BATTLE | ENDING
// ==========================================
let gameState = "LOADING";
let player = null;   // newGameState() 로 만든다
let party = [];

// ---------- 5가지 스탯 ----------
// 캐릭터·몬스터 모두 STR·DEX·AGI·CON·INT 를 가진다. 계수는 data/battle.json 의 stats.
const STAT_KEYS = ["str", "dex", "agi", "con", "int"];
const STAT_INFO = {
  str: { label: "STR", name: "힘", desc: "공격력" },
  dex: { label: "DEX", name: "솜씨", desc: "치명타율 · 회피율 조금" },
  agi: { label: "AGI", name: "민첩", desc: "회피율 · 치명타율 조금" },
  con: { label: "CON", name: "체력", desc: "HP · 방어력" },
  int: { label: "INT", name: "지능", desc: "MP · 마력(마법·회복)" }
};
const EQUIP_SLOTS = ["weapon", "armor", "accessory"];
const SLOT_INFO = { weapon: { label: "무기" }, armor: { label: "방어구" }, accessory: { label: "장신구" } };
const BONUS_LABEL = { str: "STR", dex: "DEX", agi: "AGI", con: "CON", int: "INT", atk: "공격", matk: "마력", def: "방어", hp: "HP", mp: "MP" };

function statRules() { return (GameData.battle && GameData.battle.stats) || {}; }

// 기본값 + 스탯 → 실제 능력치. 캐릭터와 몬스터가 같은 공식을 쓴다.
//  공격 = 기본 + STR×atkPerStr  /  마력 = 기본 + INT×matkPerInt  /  방어 = 기본 + ⌊CON×defPerCon⌋
//  HP = 기본 + CON×hpPerCon  /  MP = 기본 + INT×mpPerInt
//  치명타율 = critBase + DEX×critPerDex + AGI×critPerAgi  /  회피율 = AGI×evadePerAgi + DEX×evadePerDex
function deriveStats(base, st, extra = {}) {
  const r = statRules();
  const n = (v) => v || 0;
  return {
    maxHp: Math.max(1, Math.floor(n(base.hp) + st.con * n(r.hpPerCon) + n(extra.hp))),
    maxMp: Math.max(0, Math.floor(n(base.mp) + st.int * n(r.mpPerInt) + n(extra.mp))),
    atk: Math.max(0, Math.floor(n(base.atk) + st.str * n(r.atkPerStr) + n(extra.atk))),
    matk: Math.max(0, Math.floor(n(base.matk) + st.int * n(r.matkPerInt) + n(extra.matk))),
    def: Math.max(0, Math.floor(n(base.def)) + Math.floor(st.con * n(r.defPerCon)) + n(extra.def)),
    crit: Math.min(n(r.maxCrit) || 0.5, n(r.critBase) + st.dex * n(r.critPerDex) + st.agi * n(r.critPerAgi)),
    evade: Math.min(n(r.maxEvade) || 0.35, st.agi * n(r.evadePerAgi) + st.dex * n(r.evadePerDex))
  };
}

// 파티 캐릭터의 현재 능력치: 레벨 성장 + 장비 보너스 + 대장간 강화
function calcMemberStats(def, lv, equip) {
  const g = def.growth || {}, b = def.base || {}, s = def.stats || {};
  const up = lv - 1;
  const bonus = equipBonus(equip);
  const st = {};
  STAT_KEYS.forEach(k => { st[k] = Math.floor((s[k] || 0) + (g[k] || 0) * up) + (bonus[k] || 0); });
  const base = {};
  ["hp", "mp", "atk", "matk", "def"].forEach(k => { base[k] = (b[k] || 0) + (g[k] || 0) * up; });
  const u = GameData.battle.upgrade || {};
  const wl = player ? player.weaponLv - 1 : 0, al = player ? player.armorLv - 1 : 0;
  const extra = {
    hp: (bonus.hp || 0) + al * (u.armorHp || 0), mp: bonus.mp || 0,
    atk: (bonus.atk || 0) + wl * (u.weaponAtk || 0), matk: (bonus.matk || 0) + wl * (u.weaponMatk || 0),
    def: (bonus.def || 0) + al * (u.armorDef || 0)
  };
  return Object.assign(st, deriveStats(base, st, extra));
}

// 몬스터 능력치 (data/monsters.json 의 base + stats)
function calcMonsterStats(d) {
  const s = d.stats || {}, st = {};
  STAT_KEYS.forEach(k => { st[k] = s[k] || 0; });
  const base = d.base || { hp: d.hp, atk: d.atk, matk: d.atk, def: d.def };
  return Object.assign(st, deriveStats(base, st));
}

function equipBonus(equip) {
  const out = {};
  EQUIP_SLOTS.forEach(slot => {
    const it = equip && equip[slot] ? GameData.items.items[equip[slot]] : null;
    if (it && it.bonus) Object.entries(it.bonus).forEach(([k, v]) => { out[k] = (out[k] || 0) + v; });
  });
  return out;
}

function makeMember(def) {
  const m = {
    id: def.id, name: def.name, role: def.role, sprite: def.sprite, portrait: def.portrait,
    unlocked: !!def.startUnlocked, equip: Object.assign({ weapon: "", armor: "", accessory: "" }, def.equip || {}),
    hp: 0, mp: 0, maxHp: 0, maxMp: 0
  };
  recalcMember(m, true);
  return m;
}

// 능력치를 다시 계산한다. refill: HP/MP 가득. 아니면 최대치가 늘어난 만큼 현재치도 늘리고, 줄면 최대치로 자른다.
function recalcMember(m, refill = false) {
  const def = memberDef(m.id);
  if (!def) return m;
  const oldMax = { hp: m.maxHp, mp: m.maxMp };
  Object.assign(m, calcMemberStats(def, player ? player.lv : 1, m.equip));
  if (refill || !oldMax.hp) { m.hp = m.maxHp; m.mp = m.maxMp; return m; }
  if (m.hp > 0 && m.maxHp > oldMax.hp) m.hp += m.maxHp - oldMax.hp;
  if (m.maxMp > oldMax.mp) m.mp += m.maxMp - oldMax.mp;
  m.hp = Math.min(m.hp, m.maxHp);
  m.mp = Math.min(m.mp, m.maxMp);
  return m;
}
function recalcParty(refill = false) { party.forEach(m => recalcMember(m, refill)); }

function newGameState(heroName) {
  const g = GameData.game;
  player = {
    name: heroName || g.defaultHeroName,
    map: g.start.map, x: g.start.x, y: g.start.y, dir: g.start.dir || "down",
    lv: 1, exp: 0, nextExp: GameData.battle.levelCurve.base, gold: g.startGold,
    weaponLv: 1, armorLv: 1, storyFlag: 0,
    inventory: { ...g.startItems },
    quests: {},   // id → "active" | "done"
    vars: {},     // 시나리오 변수 (> set)
    focusQuest: "", // HUD 에 한 줄로 보여 줄(추적 중인) 퀘스트 id (비어 있으면 메인 퀘스트)
    visited: []   // 가 본 맵 (지도 메뉴)
  };
  Object.keys(GameData.items.items).forEach(id => { if (!(id in player.inventory)) player.inventory[id] = 0; });
  party = GameData.characters.party.map(makeMember);
}

function partyMember(id) { return party.find(m => m.id === id) || null; }
function memberDef(id) { return GameData.characters.party.find(c => c.id === id) || null; }
function activeParty() { return party.filter(m => m.unlocked); }
// 리더 = 파티 순서상 첫 번째 합류 멤버. 맵을 걷는 캐릭터와 HUD 의 주 캐릭터가 된다.
function leader() { return activeParty()[0] || party[0]; }

// 합류 멤버끼리 순서를 바꾼다 (delta: -1 위로, +1 아래로, "top" 리더로)
function moveMember(id, delta) {
  const act = activeParty();
  const i = act.findIndex(m => m.id === id);
  if (i < 0) return false;
  const j = delta === "top" ? 0 : i + delta;
  if (j < 0 || j >= act.length || j === i) return false;
  const order = act.slice();
  const [m] = order.splice(i, 1);
  order.splice(j, 0, m);
  // party 배열에서 합류 멤버가 있던 자리들에 새 순서대로 채워 넣는다
  const slots = party.map((p, k) => p.unlocked ? k : -1).filter(k => k >= 0);
  slots.forEach((k, n) => { party[k] = order[n]; });
  return true;
}

// {hero} → 주인공 이름
function fmt(text) {
  return String(text ?? "").replace(/\{hero\}/g, player ? player.name : GameData.game.defaultHeroName);
}
function memberName(m) { return fmt(m.name); }

function skillsOf(member) {
  const def = memberDef(member.id);
  return def ? def.skills.map(id => ({ id, ...GameData.skills[id] })).filter(s => s.name) : [];
}

// ---------- 장비 ----------
function isEquipItem(it) { return !!it && EQUIP_SLOTS.includes(it.type); }
function canEquip(member, itemId) {
  const it = GameData.items.items[itemId];
  return isEquipItem(it) && (!it.for || !it.for.length || it.for.includes(member.id));
}
// slot 에 itemId 를 장착 ("" 이면 해제). 가방(inventory)에서 꺼내고, 빼낸 장비는 가방으로 돌아간다.
function equipItem(memberId, slot, itemId) {
  const m = partyMember(memberId);
  if (!m || !EQUIP_SLOTS.includes(slot)) return false;
  if (itemId) {
    const it = GameData.items.items[itemId];
    if (!it || it.type !== slot || !canEquip(m, itemId) || (player.inventory[itemId] || 0) <= 0) return false;
  }
  const cur = m.equip[slot];
  if (cur === itemId) return false;
  if (cur) player.inventory[cur] = (player.inventory[cur] || 0) + 1;
  if (itemId) player.inventory[itemId]--;
  m.equip[slot] = itemId || "";
  recalcMember(m);
  return true;
}
function bonusText(bonus) {
  return Object.entries(bonus || {}).filter(([, v]) => v).map(([k, v]) => `${BONUS_LABEL[k] || k} ${v > 0 ? "+" : ""}${v}`).join(" · ");
}
function iconTag(src, cls = "ico") { return src ? `<img class="${cls}" src="${src}" alt="">` : ""; }

// 장비 강화 (대장간·시나리오 공용): 파티 전원의 무기/방어구가 한 단계 강해진다
function applyGearUpgrade(kind, levels = 1) {
  if (kind === "weapon") player.weaponLv += levels; else player.armorLv += levels;
  recalcParty();
}

// 레벨업: 경험치가 넘치면 반복. 오른 레벨 목록을 돌려준다.
function checkLevelUp() {
  const ups = [];
  while (player.exp >= player.nextExp) {
    player.exp -= player.nextExp;
    player.lv++;
    player.nextExp = Math.floor(player.nextExp * GameData.battle.levelCurve.growth);
    ups.push(player.lv);
  }
  if (ups.length) recalcParty(true);
  return ups;
}

function healParty() { party.forEach(m => { m.hp = m.maxHp; m.mp = m.maxMp; }); }

function markVisited(mapId) {
  if (!player.visited) player.visited = [];
  if (!player.visited.includes(mapId)) player.visited.push(mapId);
}
