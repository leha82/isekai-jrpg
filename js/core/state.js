// ==========================================
// 게임 상태
// gameState: TITLE | WORLD | DIALOG | MODAL | BATTLE | ENDING
// ==========================================
let gameState = "TITLE";

let player = {
  x: START_POS.x, y: START_POS.y, lv: 1, exp: 0, nextExp: 20, gold: 60,
  weaponLv: 1, armorLv: 1, storyFlag: 0,
  inventory: { potion: 2, ether: 1 }
};

let party = PARTY_DEFAULTS.map(m => ({ ...m }));

function partyMember(id) {
  return party.find(m => m.id === id) || null;
}
