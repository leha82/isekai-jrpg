// ==========================================
// 상점 · 여관 · 대장간 (data/items.json 의 shops)
// ==========================================
let currentShopId = null;

function openShop(shopId) {
  const shop = GameData.items.shops[shopId];
  if (!shop) { showToast(`없는 상점: ${shopId}`, true); return; }
  currentShopId = shopId;
  renderShop();
}

function renderShop() {
  const shop = GameData.items.shops[currentShopId];
  const u = GameData.battle.upgrade;
  const rows = [];
  if (shop.inn) rows.push(row("🛏️ 여관 휴식", "파티 전원 HP/MP 완전 회복", shop.inn, `shopInn(${shop.inn})`));
  shop.items.forEach(id => {
    const it = GameData.items.items[id];
    if (it) rows.push(row(`${it.icon || ""} ${it.name} <small>(보유 ${player.inventory[id] || 0})</small>`, it.desc || "", it.price, `shopBuy('${id}')`));
  });
  if (shop.upgrades) {
    const w = player.weaponLv * u.weaponCostPerLevel, a = player.armorLv * u.armorCostPerLevel;
    rows.push(row(`⚔️ 파티 무기 연마 <small>(현재 Lv.${player.weaponLv})</small>`, `전원 공격력 +${u.weaponAtk}, 마력 +${u.weaponMatk}`, w, `shopUpgrade('weapon', ${w})`));
    rows.push(row(`🛡️ 파티 방어구 강화 <small>(현재 Lv.${player.armorLv})</small>`, `전원 방어력 +${u.armorDef}, 최대 HP +${u.armorHp}`, a, `shopUpgrade('armor', ${a})`));
  }
  openWindow(`🏪 ${shop.name} — 보유 ${player.gold.toLocaleString()} G`, rows.join("") || `<p class="muted">파는 물건이 없습니다.</p>`);
}

function row(title, desc, price, action) {
  return `<div class="item-row"><div><b>${title}</b><br><span class="muted small">${desc}</span></div>
    <button class="item-btn" onclick="${action}" ${player.gold < price ? "disabled" : ""}>${price} G</button></div>`;
}

function shopInn(cost) {
  if (player.gold < cost) return;
  player.gold -= cost;
  healParty();
  SFX.heal();
  showToast("🛏️ 푹 쉬었습니다. HP/MP 전부 회복!");
  updateHUD();
  renderShop();
}

function shopBuy(id) {
  const it = GameData.items.items[id];
  if (!it || player.gold < it.price) return;
  player.gold -= it.price;
  player.inventory[id] = (player.inventory[id] || 0) + 1;
  SFX.coin();
  updateHUD();
  renderShop();
}

function shopUpgrade(kind, cost) {
  if (player.gold < cost) return;
  player.gold -= cost;
  applyGearUpgrade(kind, 1);
  SFX.levelup();
  showToast(kind === "weapon" ? "⚔️ 무기를 연마했습니다!" : "🛡️ 방어구를 강화했습니다!");
  updateHUD();
  renderShop();
}
