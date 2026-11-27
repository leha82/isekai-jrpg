// ==========================================
// 상점 · 여관 · 인벤토리
// ==========================================
let currentShopName = "마을";

// 파티 장비 강화 (상점 구매와 시나리오 "> weapon +N" / "> armor +N" 공용)
function applyGearUpgrade(kind, levels = 1) {
  for (let i = 0; i < levels; i++) {
    if (kind === "weapon") {
      player.weaponLv++;
      party.forEach(m => { m.atk += 4; m.matk += 4; });
    } else {
      player.armorLv++;
      party.forEach(m => { m.def += 3; m.maxHp += 10; m.hp += 10; });
    }
  }
}

function openTownShop(townName) {
  gameState = "MODAL";
  currentShopName = townName;
  document.getElementById("modal-title").innerText = `🏪 ${townName} 상점 & 여관 (보유: ${player.gold} G)`;
  const wCost = player.weaponLv * 45;
  const aCost = player.armorLv * 40;

  document.getElementById("modal-list").innerHTML = `
    <div class="item-row">
      <div><strong>🛏️ 여관 휴식</strong><br><span style="color:#94a3b8">파티 전원 HP/MP 완전 회복</span></div>
      <button class="item-btn" onclick="useInn(15)" ${player.gold < 15 ? 'disabled' : ''}>15 G</button>
    </div>
    <div class="item-row">
      <div><strong>🧪 체력 포션 (보유: ${player.inventory.potion}개)</strong><br><span style="color:#94a3b8">아군 1명 HP 45 회복</span></div>
      <button class="item-btn" onclick="buyItem('potion', 20)" ${player.gold < 20 ? 'disabled' : ''}>20 G</button>
    </div>
    <div class="item-row">
      <div><strong>💧 마력 에테르 (보유: ${player.inventory.ether}개)</strong><br><span style="color:#94a3b8">아군 1명 MP 20 회복</span></div>
      <button class="item-btn" onclick="buyItem('ether', 25)" ${player.gold < 25 ? 'disabled' : ''}>25 G</button>
    </div>
    <div class="item-row">
      <div><strong>⚔️ 파티 무기 연마 (현재 Lv.${player.weaponLv})</strong><br><span style="color:#94a3b8">전원 공격력·마력 +4 영구 상승</span></div>
      <button class="item-btn" onclick="upgradeGear('weapon', ${wCost})" ${player.gold < wCost ? 'disabled' : ''}>${wCost} G</button>
    </div>
    <div class="item-row">
      <div><strong>🛡️ 파티 방어구 강화 (현재 Lv.${player.armorLv})</strong><br><span style="color:#94a3b8">전원 방어력 +3, 최대 HP +10</span></div>
      <button class="item-btn" onclick="upgradeGear('armor', ${aCost})" ${player.gold < aCost ? 'disabled' : ''}>${aCost} G</button>
    </div>
  `;
  document.getElementById("modal-ui").style.display = "flex";
}

function useInn(cost) {
  if (player.gold < cost) return;
  player.gold -= cost;
  party.forEach(m => { m.hp = m.maxHp; m.mp = m.maxMp; });
  SFX.heal();
  updateHUD();
  openTownShop(currentShopName);
}

function buyItem(type, cost) {
  if (player.gold < cost) return;
  player.gold -= cost;
  player.inventory[type]++;
  SFX.coin();
  updateHUD();
  openTownShop(currentShopName);
}

function upgradeGear(kind, cost) {
  if (player.gold < cost) return;
  player.gold -= cost;
  applyGearUpgrade(kind, 1);
  SFX.levelup();
  updateHUD();
  openTownShop(currentShopName);
}

function openInventory() {
  if (gameState !== "WORLD") return;
  gameState = "MODAL";
  document.getElementById("modal-title").innerText = `🎒 파티 가방 & 장비 현황 (무기 Lv.${player.weaponLv} / 방어구 Lv.${player.armorLv})`;
  document.getElementById("modal-list").innerHTML = `
    <div class="item-row">
      <div><strong>🧪 체력 포션 (${player.inventory.potion}개)</strong><br><span style="color:#94a3b8">부상당한 파티원 HP 45 회복</span></div>
      <button class="item-btn" onclick="useFieldItem('potion')" ${player.inventory.potion <= 0 ? 'disabled' : ''}>사용</button>
    </div>
    <div class="item-row">
      <div><strong>💧 마력 에테르 (${player.inventory.ether}개)</strong><br><span style="color:#94a3b8">파티원 전원 MP 15 회복</span></div>
      <button class="item-btn" onclick="useFieldItem('ether')" ${player.inventory.ether <= 0 ? 'disabled' : ''}>사용</button>
    </div>
  `;
  document.getElementById("modal-ui").style.display = "flex";
}

function useFieldItem(type) {
  if (type === "potion" && player.inventory.potion > 0) {
    const target = party.filter(m => m.unlocked && m.hp < m.maxHp).sort((a, b) => a.hp - b.hp)[0];
    if (!target) { showToast("체력이 줄어든 파티원이 없습니다.", true); return; }
    player.inventory.potion--;
    target.hp = Math.min(target.maxHp, target.hp + 45);
    SFX.heal();
  } else if (type === "ether" && player.inventory.ether > 0) {
    player.inventory.ether--;
    party.filter(m => m.unlocked).forEach(m => m.mp = Math.min(m.maxMp, m.mp + 15));
    SFX.magic();
  }
  updateHUD();
  openInventory();
}

function closeModal() {
  document.getElementById("modal-ui").style.display = "none";
  gameState = "WORLD";
}
