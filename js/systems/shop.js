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
    if (!it) return;
    let desc = escapeHtml(it.desc || "");
    if (isEquipItem(it)) {
      const who = it.for && it.for.length ? it.for.map(c => { const d = memberDef(c); return d ? fmt(d.name) : c; }).join("·") : "누구나";
      desc = `<span class="bonus">${ITEM_KIND[it.type]} · ${escapeHtml(bonusText(it.bonus))}</span> · 장착: ${escapeHtml(who)}<br>` + desc;
    }
    if (it.type === "map") desc = `<span class="bonus">지도 · ${escapeHtml(mapItemNodes(it).map(n => (GameData.maps[n] || {}).name || n).join(" · "))}</span><br>` + desc;
    const ownedMap = it.type === "map" && (player.inventory[id] || 0) > 0; // 지도는 한 장이면 충분하다
    rows.push(row(`${iconTag(it.icon)} ${escapeHtml(it.name)} <small>(보유 ${player.inventory[id] || 0})</small>`, desc, it.price, `shopBuy('${id}')`, ownedMap ? "보유 중" : ""));
  });
  if (shop.upgrades) {
    const w = player.weaponLv * u.weaponCostPerLevel, a = player.armorLv * u.armorCostPerLevel;
    rows.push(row(`⚔️ 파티 무기 연마 <small>(현재 Lv.${player.weaponLv})</small>`, `전원의 무기 공격력 +${u.weaponAtk}, 마력 +${u.weaponMatk}`, w, `shopUpgrade('weapon', ${w})`));
    rows.push(row(`🛡️ 파티 방어구 강화 <small>(현재 Lv.${player.armorLv})</small>`, `전원의 방어구 방어력 +${u.armorDef}, 최대 HP +${u.armorHp}`, a, `shopUpgrade('armor', ${a})`));
  }
  openWindow(`🏪 ${shop.name} — 보유 ${player.gold.toLocaleString()} G`, rows.join("") || `<p class="muted">파는 물건이 없습니다.</p>`,
    { kind: "shop", onClose: () => requestAutoSave("shop") }); // 상점(NPC) 이용이 끝나면 자동 저장
}

// blocked: 살 수 없는 이유(버튼 글자). 비어 있으면 가격 버튼
function row(title, desc, price, action, blocked = "") {
  return `<div class="item-row"><div class="grow"><b>${title}</b><br><span class="muted small">${desc}</span></div>
    <button class="item-btn" onclick="${action}" ${blocked || player.gold < price ? "disabled" : ""}>${blocked || `${price} G`}</button></div>`;
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
  if (it.type === "map" && (player.inventory[id] || 0) > 0) return;
  player.gold -= it.price;
  player.inventory[id] = (player.inventory[id] || 0) + 1;
  SFX.coin();
  if (isEquipItem(it)) showToast(`🛡️ ${it.name} 구입 — 메뉴의 장비(E)에서 장착하세요.`);
  else if (it.type === "map") showToast(`🗺️ ${it.name} 구입 — 메뉴의 지도(M)에서 볼 수 있습니다.`);
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
