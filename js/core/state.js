// ==========================================
// 게임 상태
// gameState: LOADING | TITLE | WORLD | DIALOG | MODAL | BATTLE | ENDING
// ==========================================
let gameState = "LOADING";
let player = null;   // newGameState() 로 만든다
let party = [];

function makeMember(def) {
  const s = def.stats;
  return {
    id: def.id, name: def.name, role: def.role, sprite: def.sprite, portrait: def.portrait,
    hp: s.hp, maxHp: s.hp, mp: s.mp, maxMp: s.mp, atk: s.atk, matk: s.matk, def: s.def,
    unlocked: !!def.startUnlocked
  };
}

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
    focusQuest: "" // HUD 에 한 줄로 보여 줄 퀘스트 id (비어 있으면 메인 퀘스트)
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

// 장비 강화 (상점·시나리오 공용)
function applyGearUpgrade(kind, levels = 1) {
  const u = GameData.battle.upgrade;
  for (let i = 0; i < levels; i++) {
    if (kind === "weapon") {
      player.weaponLv++;
      party.forEach(m => { m.atk += u.weaponAtk; m.matk += u.weaponMatk; });
    } else {
      player.armorLv++;
      party.forEach(m => { m.def += u.armorDef; m.maxHp += u.armorHp; m.hp += u.armorHp; });
    }
  }
}

// 레벨업: 경험치가 넘치면 반복. 오른 레벨 목록을 돌려준다.
function checkLevelUp() {
  const ups = [];
  while (player.exp >= player.nextExp) {
    player.exp -= player.nextExp;
    player.lv++;
    player.nextExp = Math.floor(player.nextExp * GameData.battle.levelCurve.growth);
    party.forEach(m => {
      const gr = (memberDef(m.id) || {}).growth || {};
      m.maxHp += gr.hp || 0; m.maxMp += gr.mp || 0; m.atk += gr.atk || 0; m.matk += gr.matk || 0; m.def += gr.def || 0;
      m.hp = m.maxHp; m.mp = m.maxMp;
    });
    ups.push(player.lv);
  }
  return ups;
}

function healParty() { party.forEach(m => { m.hp = m.maxHp; m.mp = m.maxMp; }); }
