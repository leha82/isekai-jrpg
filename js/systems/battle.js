// ==========================================
// 3인 파티 턴제 전투
// ==========================================
let currentEnemy = null;
let isBossBattle = false;
let battleWinScene = null;   // 승리 후 실행할 시나리오 장면 (> battle ... win=장면id)
let activeTurnIndex = 0;
let battleTurnLock = false;
let garenGuard = false;

function triggerRandomEncounter(tileType) {
  const table = ENCOUNTERS[tileType];
  if (!table || Math.random() > table.rate) return;
  startBattle(table.pool[Math.floor(Math.random() * table.pool.length)], false, null);
}

// enemy: ENEMIES 의 id
function startBattle(enemyId, isBoss = false, winScene = null) {
  const enemy = createEnemy(enemyId);
  if (!enemy) { showToast(`없는 적: ${enemyId}`, true); return; }
  gameState = "BATTLE";
  currentEnemy = enemy;
  isBossBattle = isBoss;
  battleWinScene = winScene;
  garenGuard = false;
  setBGM("BATTLE");

  document.getElementById("battle-ui").style.display = "flex";
  document.getElementById("battle-log").innerHTML = `<div>⚠️ <strong>${enemy.name}</strong>이(가) 나타났다!</div>`;

  activeTurnIndex = -1;
  nextAllyTurn();
}

function renderBattleState() {
  document.getElementById("e-name").innerText = currentEnemy.name;
  document.getElementById("e-hp").innerText = Math.max(0, currentEnemy.hp);
  document.getElementById("e-maxhp").innerText = currentEnemy.maxHp;

  const eCtx = document.getElementById("enemy-canvas").getContext("2d");
  eCtx.clearRect(0, 0, 16, 16);
  drawSprite(eCtx, currentEnemy.sprite, 0, 0, 16);

  const pDiv = document.getElementById("party-sprites");
  pDiv.innerHTML = "";
  party.forEach((m, idx) => {
    if (!m.unlocked) return;
    const unit = document.createElement("div");
    unit.className = "ally-unit" + (idx === activeTurnIndex ? " active-turn" : "");
    const c = document.createElement("canvas");
    c.width = 16; c.height = 16; c.className = "sprite-box";
    drawSprite(c.getContext("2d"), m.sprite, 0, 0, 16);
    unit.appendChild(c);
    const info = document.createElement("div");
    info.innerHTML = `<strong>${m.name}</strong><br>HP ${m.hp}/${m.maxHp} | MP ${m.mp}`;
    unit.appendChild(info);
    pDiv.appendChild(unit);
  });
  updateHUD();
}

function nextAllyTurn() {
  activeTurnIndex++;
  while (activeTurnIndex < party.length && (!party[activeTurnIndex].unlocked || party[activeTurnIndex].hp <= 0)) {
    activeTurnIndex++;
  }
  if (activeTurnIndex >= party.length) {
    enemyTurn();
    return;
  }

  battleTurnLock = false;
  const actor = party[activeTurnIndex];
  document.getElementById("turn-indicator").innerText = `▶ ${actor.name} (${actor.role})의 차례`;
  renderBattleState();

  const grid = document.getElementById("cmd-grid");
  if (actor.id === "hero") {
    grid.innerHTML = `
      <button class="cmd-btn" onclick="execSkill('hero_atk')">⚔️ 검격</button>
      <button class="cmd-btn" onclick="execSkill('hero_fire')">🔥 파이어(5)</button>
      <button class="cmd-btn" onclick="execSkill('hero_heal')">✨ 힐(4)</button>
      <button class="cmd-btn" onclick="execSkill('potion')">🧪 포션(${player.inventory.potion})</button>
      <button class="cmd-btn" onclick="execSkill('ether')">💧 에테르(${player.inventory.ether})</button>
      <button class="cmd-btn" onclick="execSkill('run')">🏃 도망</button>
    `;
  } else if (actor.id === "elf") {
    grid.innerHTML = `
      <button class="cmd-btn" onclick="execSkill('elf_shot')">🏹 정밀사격</button>
      <button class="cmd-btn" onclick="execSkill('elf_wind')">🌪️ 질풍(6)</button>
      <button class="cmd-btn" onclick="execSkill('elf_heal')">💚 전체치유(8)</button>
      <button class="cmd-btn" onclick="execSkill('potion')">🧪 포션(${player.inventory.potion})</button>
    `;
  } else if (actor.id === "knight") {
    grid.innerHTML = `
      <button class="cmd-btn" onclick="execSkill('kni_atk')">🗡️ 강타</button>
      <button class="cmd-btn" onclick="execSkill('kni_slash')">⚡ 왕가일섬(6)</button>
      <button class="cmd-btn" onclick="execSkill('kni_guard')">🛡️ 철벽수호</button>
      <button class="cmd-btn" onclick="execSkill('potion')">🧪 포션(${player.inventory.potion})</button>
    `;
  }
}

function addBattleLog(msg) {
  const log = document.getElementById("battle-log");
  log.innerHTML += `<div>${msg}</div>`;
  log.scrollTop = log.scrollHeight;
}

function execSkill(skill) {
  if (battleTurnLock || gameState !== "BATTLE") return;
  const actor = party[activeTurnIndex];

  if (skill === "hero_atk") {
    const dmg = Math.max(1, actor.atk + Math.floor(Math.random() * 4));
    currentEnemy.hp -= dmg; SFX.hit();
    addBattleLog(`⚔️ 유진의 검격! <strong>${dmg}</strong> 피해!`);
  } else if (skill === "hero_fire") {
    if (actor.mp < 5) { addBattleLog("❌ MP 부족!"); return; }
    actor.mp -= 5;
    const dmg = actor.matk + Math.floor(Math.random() * 7);
    currentEnemy.hp -= dmg; SFX.magic();
    addBattleLog(`🔥 유진의 파이어! <strong>${dmg}</strong> 화염 피해!`);
  } else if (skill === "hero_heal") {
    if (actor.mp < 4) { addBattleLog("❌ MP 부족!"); return; }
    const target = party.filter(m => m.unlocked && m.hp > 0).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    actor.mp -= 4; SFX.heal();
    const amount = 20 + Math.floor(actor.matk * 0.8);
    target.hp = Math.min(target.maxHp, target.hp + amount);
    addBattleLog(`✨ 유진의 힐! ${target.name}의 HP +${amount}!`);
  } else if (skill === "ether") {
    if (player.inventory.ether <= 0) { addBattleLog("❌ 에테르가 없습니다!"); return; }
    player.inventory.ether--; SFX.magic();
    const target = party.filter(m => m.unlocked && m.hp > 0).sort((a, b) => (a.mp / a.maxMp) - (b.mp / b.maxMp))[0];
    target.mp = Math.min(target.maxMp, target.mp + 20);
    addBattleLog(`💧 ${target.name}에게 에테르 사용! MP +20!`);
  } else if (skill === "elf_shot") {
    const dmg = Math.max(1, actor.atk + Math.floor(Math.random() * 6));
    currentEnemy.hp -= dmg; SFX.hit();
    addBattleLog(`🏹 리아의 정밀 사격! <strong>${dmg}</strong> 피해!`);
  } else if (skill === "elf_wind") {
    if (actor.mp < 6) { addBattleLog("❌ MP 부족!"); return; }
    actor.mp -= 6;
    const dmg = actor.matk + 6;
    currentEnemy.hp -= dmg; SFX.magic();
    addBattleLog(`🌪️ 리아의 질풍 마법! <strong>${dmg}</strong> 피해!`);
  } else if (skill === "elf_heal") {
    if (actor.mp < 8) { addBattleLog("❌ MP 부족!"); return; }
    actor.mp -= 8; SFX.heal();
    party.filter(m => m.unlocked && m.hp > 0).forEach(m => m.hp = Math.min(m.maxHp, m.hp + 28));
    addBattleLog(`💚 리아의 정령 치유! 파티 전원 HP +28!`);
  } else if (skill === "kni_atk") {
    const dmg = Math.max(1, actor.atk + Math.floor(Math.random() * 4));
    currentEnemy.hp -= dmg; SFX.hit();
    addBattleLog(`🗡️ 가렌의 대검 강타! <strong>${dmg}</strong> 피해!`);
  } else if (skill === "kni_slash") {
    if (actor.mp < 6) { addBattleLog("❌ MP 부족!"); return; }
    actor.mp -= 6;
    const dmg = Math.floor(actor.atk * 1.65);
    currentEnemy.hp -= dmg; SFX.hit();
    addBattleLog(`⚡ 가렌의 왕가 일섬! <strong>${dmg}</strong> 치명타!`);
  } else if (skill === "kni_guard") {
    garenGuard = true; SFX.heal();
    addBattleLog(`🛡️ 가렌이 방패를 들어 이번 턴 파티 피해를 절반으로 줄입니다!`);
  } else if (skill === "potion") {
    if (player.inventory.potion <= 0) { addBattleLog("❌ 포션이 없습니다!"); return; }
    player.inventory.potion--; SFX.heal();
    const target = party.filter(m => m.unlocked && m.hp > 0).sort((a, b) => a.hp - b.hp)[0];
    target.hp = Math.min(target.maxHp, target.hp + 45);
    addBattleLog(`🧪 ${target.name}에게 포션 사용! HP +45!`);
  } else if (skill === "run") {
    if (isBossBattle) { addBattleLog("🚫 보스전에서는 도망칠 수 없습니다!"); return; }
    if (Math.random() < 0.7) {
      addBattleLog("🏃 파티가 무사히 도망쳤습니다!");
      battleTurnLock = true;
      setTimeout(endBattle, 650);
      return;
    } else {
      addBattleLog("💦 도망에 실패했습니다!");
    }
  }

  battleTurnLock = true;
  renderBattleState();

  if (currentEnemy.hp <= 0) {
    setTimeout(() => {
      SFX.coin();
      addBattleLog(`🎉 <strong>${currentEnemy.name}</strong> 격파! (EXP +${currentEnemy.exp}, +${currentEnemy.gold}G)`);
      player.exp += currentEnemy.exp;
      player.gold += currentEnemy.gold;
      checkLevelUp();
      renderBattleState();
      setTimeout(() => {
        const winScene = battleWinScene;
        const wasBoss = isBossBattle;
        endBattle();
        if (winScene) runScene(winScene);
        else if (!wasBoss) saveGame(true); // 일반 전투 승리 직후 자동 저장 (이 기기에만)
      }, 1100);
    }, 450);
    return;
  }

  setTimeout(nextAllyTurn, 420);
}

function enemyTurn() {
  document.getElementById("turn-indicator").innerText = `⚠️ ${currentEnemy.name}의 공격!`;
  const alive = party.filter(m => m.unlocked && m.hp > 0);
  const target = alive[Math.floor(Math.random() * alive.length)];

  setTimeout(() => {
    let rawDmg = Math.max(2, currentEnemy.atk - Math.floor(target.def * 0.5) + Math.floor(Math.random() * 4));
    if (garenGuard) rawDmg = Math.max(1, Math.floor(rawDmg * 0.5));
    garenGuard = false;

    target.hp = Math.max(0, target.hp - rawDmg);
    SFX.hit();
    addBattleLog(`💥 ${currentEnemy.name}의 공격! <strong>${target.name}</strong>에게 <strong>${rawDmg}</strong> 피해!`);
    renderBattleState();

    if (party.filter(m => m.unlocked && m.hp > 0).length === 0) {
      setTimeout(() => {
        player.x = START_POS.x; player.y = START_POS.y;
        party.forEach(m => { m.hp = m.maxHp; m.mp = m.maxMp; });
        endBattle();
        runScene("party_wiped");
      }, 650);
    } else {
      activeTurnIndex = -1;
      setTimeout(nextAllyTurn, 500);
    }
  }, 500);
}

function checkLevelUp() {
  while (player.exp >= player.nextExp) {
    player.exp -= player.nextExp;
    player.lv++;
    player.nextExp = Math.floor(player.nextExp * 1.45);
    SFX.levelup();
    party.forEach(m => {
      m.maxHp += 14; m.maxMp += 5; m.atk += 3; m.matk += 4; m.def += 2;
      m.hp = m.maxHp; m.mp = m.maxMp;
    });
    addBattleLog(`✨ <strong>파티 레벨 업! Lv.${player.lv}</strong> (전원 능력치 상승 & 회복)`);
  }
}

function endBattle() {
  document.getElementById("battle-ui").style.display = "none";
  gameState = "WORLD";
  battleWinScene = null;
  setBGM("FIELD");
  renderWorld();
  updateHUD();
}
