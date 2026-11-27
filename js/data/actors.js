// ==========================================
// 파티 · 적 · 아이템 데이터
// 시나리오 스크립트에서 파티원은 id(hero/elf/knight), 적은 ENEMIES 키, 아이템은 ITEMS 키로 부른다.
// ==========================================

// 파티 기본 능력치 (Lv.1, 장비 강화 전). 첫 번째 멤버는 주인공이며 항상 합류 상태.
const PARTY_DEFAULTS = [
  { id: "hero",   name: "유진", role: "이세계인",  sprite: "hero",       hp: 55, maxHp: 55, mp: 25, maxMp: 25, atk: 12, matk: 18, def: 4, unlocked: true },
  { id: "elf",    name: "리아", role: "엘프 궁수", sprite: "elf",        hp: 45, maxHp: 45, mp: 30, maxMp: 30, atk: 14, matk: 16, def: 3, unlocked: false },
  { id: "knight", name: "가렌", role: "왕국 기사", sprite: "knightAlly", hp: 75, maxHp: 75, mp: 15, maxMp: 15, atk: 16, matk: 8,  def: 7, unlocked: false }
];

// 적 정의 (maxHp 는 생성 시 hp 로 채운다)
const ENEMIES = {
  slime_field:   { name: "초원 슬라임",   sprite: "slime",     hp: 32,  atk: 7,  exp: 14,  gold: 15 },
  goblin_forest: { name: "숲 고블린",     sprite: "goblin",    hp: 55,  atk: 12, exp: 26,  gold: 25 },
  slime_poison:  { name: "독 슬라임",     sprite: "slime",     hp: 48,  atk: 10, exp: 22,  gold: 20 },
  dark_knight:   { name: "마왕군 흑기사", sprite: "knight",    hp: 105, atk: 18, exp: 55,  gold: 45 },
  demon_lord:    { name: "고대 관리자 마왕 아르카스", sprite: "demonLord", hp: 220, atk: 24, exp: 999, gold: 500 }
};

const ITEMS = { potion: "체력 포션", ether: "마력 에테르" };

function createEnemy(id) {
  const e = ENEMIES[id];
  return e ? { id, ...e, maxHp: e.hp } : null;
}
