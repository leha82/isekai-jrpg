// ==========================================
// 턴제 전투 (데이터 기반)
//  - 스킬: data/skills.json / 몬스터: data/monsters.json / 공식·확률: data/battle.json
//  - 적 1~3마리, 아군은 파티 순서대로 커맨드 선택 → 적 행동 → 다음 라운드
// ==========================================
const B = { enemies: [], boss: false, win: null, guard: false, over: false, round: 0, choose: null };

const rnd = (n) => Math.floor(Math.random() * (n + 1));
const aliveEnemies = () => B.enemies.filter(e => e.hp > 0);
const aliveAllies = () => activeParty().filter(m => m.hp > 0);

function makeEnemy(id, i) {
  const d = GameData.monsters[id];
  return { uid: `${id}_${i}`, id, name: d.name, sprite: d.sprite, hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def || 0,
           exp: d.exp, gold: d.gold, actions: d.actions || [{ type: "attack", name: "공격", weight: 1 }], drops: d.drops || [] };
}

async function startBattle(enemyIds, opts = {}) {
  const ids = enemyIds.filter(id => GameData.monsters[id]);
  if (!ids.length) { showToast(`없는 적: ${enemyIds.join(",")}`, true); return; }
  gameState = "BATTLE";
  releaseAllDirs();
  Object.assign(B, { enemies: ids.map(makeEnemy), boss: !!opts.boss, win: opts.win || null, guard: false, over: false, round: 0, choose: null });
  // 같은 이름이 여럿이면 A/B/C 붙이기
  const count = {};
  B.enemies.forEach(e => { count[e.name] = (count[e.name] || 0) + 1; });
  const seen = {};
  B.enemies.forEach(e => { if (count[e.name] > 1) { seen[e.name] = (seen[e.name] || 0) + 1; e.name += " " + "ABC"[seen[e.name] - 1]; } });

  SFX.encounter();
  playBGM(B.boss ? "boss" : "battle");
  await fadeTo(1, 160);
  $("battle-ui").style.display = "flex";
  bvStart(World.map.battleBg);
  bvLayoutEnemies(B.enemies);
  bvLayoutAllies(activeParty());
  renderBattleParty();
  await fadeTo(0, 160);
  setCommands([]);
  battleMsg(`${B.enemies.map(e => e.name).join(", ")} 이(가) 나타났다!`);
  await bvWait(900);
  battleLoop();
}

async function battleLoop() {
  while (!B.over) {
    B.round++;
    for (const ally of activeParty()) {
      if (B.over) return;
      if (ally.hp <= 0) continue;
      await allyTurn(ally);
      if (checkBattleEnd()) return;
    }
    for (const e of B.enemies) {
      if (B.over) return;
      if (e.hp <= 0) continue;
      await enemyTurn(e);
      if (checkBattleEnd()) return;
    }
    B.guard = false;
  }
}

// ---------- UI ----------
function battleMsg(text) { $("battle-msg").textContent = text; $("battle-msg").classList.add("show"); }

function renderBattleParty(activeId = null) {
  $("battle-party").innerHTML = activeParty().map(m => {
    const hp = Math.max(0, m.hp) / m.maxHp * 100, mp = m.mp / m.maxMp * 100;
    return `<div class="bp-row${m.id === activeId ? " active" : ""}${m.hp <= 0 ? " down" : ""}">
      <span class="bp-name">${escapeHtml(memberName(m))}</span>
      <span class="bp-bars"><span class="bar hp"><i style="width:${hp}%"></i></span><span class="bar mp"><i style="width:${mp}%"></i></span></span>
      <span class="bp-num">${Math.max(0, m.hp)}/${m.maxHp}<br><small>${m.mp}/${m.maxMp}</small></span></div>`;
  }).join("");
  BV.actors.forEach(a => { a.active = a.kind === "ally" && a.ref.id === activeId; });
}

// buttons: [{ label, disabled, onClick, cls }]
function setCommands(buttons, title = "") {
  $("turn-indicator").textContent = title;
  const grid = $("cmd-grid");
  grid.innerHTML = "";
  buttons.forEach((b, i) => {
    const el = document.createElement("button");
    el.className = "cmd-btn" + (b.cls ? " " + b.cls : "");
    el.innerHTML = `<span class="key">${i + 1}</span>${b.label}`;
    el.disabled = !!b.disabled;
    el.onclick = () => { if (!el.disabled) { SFX.cursor(); b.onClick(); } };
    grid.appendChild(el);
  });
}

// 숫자 키로 커맨드 선택
function battleKey(e) {
  if (gameState !== "BATTLE") return;
  const n = parseInt(e.key, 10);
  const btns = [...$("cmd-grid").querySelectorAll("button")];
  if (n >= 1 && n <= btns.length) { e.preventDefault(); btns[n - 1].click(); }
  else if ((e.key === " " || e.key === "Enter") && btns.length === 1) { e.preventDefault(); btns[0].click(); }
  else if (e.key === "Escape" || e.key === "Backspace") { const back = btns.find(b => b.classList.contains("back")); if (back) { e.preventDefault(); back.click(); } }
}

// ---------- 아군 턴 ----------
function allyTurn(ally) {
  renderBattleParty(ally.id);
  battleMsg(`${memberName(ally)}의 차례`);
  return new Promise(resolve => {
    const done = async (action) => { setCommands([]); await performAction(ally, action); resolve(); };
    const mainMenu = () => {
      const skills = skillsOf(ally);
      const btns = skills.map(s => ({
        label: `${s.icon || ""} ${s.name}${s.mp ? ` <small>MP${s.mp}</small>` : ""}`,
        disabled: ally.mp < s.mp,
        onClick: () => chooseTarget(s, (target) => done({ type: "skill", skill: s, target }), mainMenu)
      }));
      btns.push({ label: "🎒 아이템", onClick: itemMenu });
      btns.push({ label: "🏃 도망", disabled: B.boss, onClick: () => done({ type: "flee" }) });
      setCommands(btns, `▶ ${memberName(ally)} (${ally.role})`);
    };
    const itemMenu = () => {
      const items = Object.entries(player.inventory).filter(([id, n]) => n > 0 && ["heal_hp", "heal_mp"].includes((GameData.items.items[id] || {}).type));
      const btns = items.map(([id, n]) => {
        const it = GameData.items.items[id];
        return { label: `${it.icon || ""} ${it.name} ×${n}`, onClick: () => pickAlly(`${it.name} 사용 대상`, (t) => done({ type: "item", item: id, target: t }), itemMenu) };
      });
      if (!btns.length) btns.push({ label: "사용할 아이템 없음", disabled: true, onClick: () => {} });
      btns.push({ label: "↩ 뒤로", cls: "back", onClick: mainMenu });
      setCommands(btns, "아이템");
    };
    const pickAlly = (title, onPick, back) => {
      const btns = aliveAllies().map(m => ({ label: `${escapeHtml(memberName(m))} <small>${m.hp}/${m.maxHp}</small>`, onClick: () => onPick(m) }));
      btns.push({ label: "↩ 뒤로", cls: "back", onClick: back });
      setCommands(btns, title);
    };
    const chooseTarget = (skill, onPick, back) => {
      if (skill.target === "enemy") {
        const alive = aliveEnemies();
        if (alive.length === 1) return onPick(alive[0]);
        const btns = alive.map(e => ({ label: `🎯 ${escapeHtml(e.name)}`, onClick: () => { clearTargets(); onPick(e); } }));
        btns.push({ label: "↩ 뒤로", cls: "back", onClick: () => { clearTargets(); back(); } });
        setCommands(btns, `${skill.name} — 대상 선택`);
        alive.forEach(e => { const a = bvActor(e); if (a) a.targeted = true; });
        return;
      }
      if (skill.target === "ally") return pickAlly(`${skill.name} — 대상 선택`, onPick, back);
      onPick(null); // 전체 대상
    };
    mainMenu();
  });
}

function clearTargets() { BV.actors.forEach(a => { a.targeted = false; }); }

async function performAction(ally, action) {
  const actor = bvActor(ally);
  if (action.type === "flee") {
    battleMsg(`${memberName(ally)} 일행은 도망쳤다…`);
    if (Math.random() < GameData.battle.fleeChance) {
      SFX.warp(0.6);
      for (const a of BV.actors.filter(a => a.kind === "ally")) { a.walk = true; bvMove(a, 700, a.y, 400); }
      await bvWait(500);
      return endBattle("flee");
    }
    SFX.error();
    battleMsg("도망치지 못했다!");
    await bvWait(700);
    return;
  }
  if (action.type === "item") {
    const it = GameData.items.items[action.item];
    player.inventory[action.item]--;
    battleMsg(`${memberName(ally)}: ${it.name} 사용!`);
    SFX.item();
    const t = bvActor(action.target);
    await FX.sparkle(t);
    if (it.type === "heal_hp") { const v = healHp(action.target, it.amount); bvText(t, `+${v}`, "#86efac", true); }
    else { const v = healMp(action.target, it.amount); bvText(t, `MP+${v}`, "#7dd3fc", true); }
    renderBattleParty();
    await bvWait(450);
    return;
  }
  const s = action.skill;
  ally.mp -= s.mp || 0;
  battleMsg(`${memberName(ally)}의 ${s.name}!`);
  renderBattleParty(ally.id);

  if (s.type === "physical") {
    const target = action.target && action.target.hp > 0 ? action.target : aliveEnemies()[0];
    const ta = bvActor(target);
    if (s.fx === "arrow") {
      actor.walk = true; await bvMove(actor, actor.homeX - 20, actor.homeY, 140); actor.walk = false;
      SFX.slash(0.7); await FX.arrow(actor, ta);
    } else {
      actor.walk = true;
      await bvMove(actor, ta.x + 40, ta.y + 4, 220);
      actor.walk = false;
      playSFX(s.sfx || "slash");
      FX.slash(ta, s.fx === "bigslash");
      if (s.fx === "bigslash") { bvFlash("#fff7c2", 220, .5); bvShake(8); }
    }
    await bvWait(140);
    const { dmg, crit } = physicalDamage(ally, target, s);
    damageEnemy(target, dmg, crit);
    await bvWait(260);
    actor.walk = true; await bvMove(actor, actor.homeX, actor.homeY, 200); actor.walk = false;
  } else if (s.type === "magic") {
    const targets = s.target === "all_enemies" ? aliveEnemies() : [action.target && action.target.hp > 0 ? action.target : aliveEnemies()[0]];
    await FX.cast(actor, s.fx === "wind" ? "#86efac" : "#ffb35c");
    playSFX(s.sfx || "fire");
    if (s.fx === "fire") await FX.fire(actor, bvActor(targets[0]));
    else await FX.wind(targets.map(bvActor));
    targets.forEach(t => { const { dmg, crit } = magicDamage(ally, t, s); damageEnemy(t, dmg, crit); });
    await bvWait(380);
  } else if (s.type === "heal") {
    const targets = s.target === "all_allies" ? aliveAllies() : [action.target && action.target.hp > 0 ? action.target : lowestHpAlly()];
    await FX.cast(actor, "#86efac");
    playSFX(s.sfx || "heal");
    await FX.heal(targets.map(bvActor));
    const amount = (s.base || 0) + Math.floor(ally.matk * (s.power || 0));
    targets.forEach(t => { const v = healHp(t, amount); bvText(bvActor(t), `+${v}`, "#86efac", true); });
    renderBattleParty(ally.id);
    await bvWait(300);
  } else if (s.type === "guard") {
    B.guard = true;
    playSFX(s.sfx || "guard");
    await FX.shield(aliveAllies().map(bvActor));
    battleMsg(`${memberName(ally)}이(가) 방패를 들었다! 이번 라운드 받는 피해 감소`);
    await bvWait(400);
  }
  if (aliveEnemies().length) battleMsg("");
}

// ---------- 공식 ----------
function physicalDamage(ally, enemy, s) {
  const cfg = GameData.battle;
  let raw = ally.atk * (s.power || 1) + rnd(s.variance || 0);
  const crit = Math.random() < (s.crit ?? cfg.critChance);
  if (crit) raw *= cfg.critMultiplier;
  return { dmg: Math.max(cfg.minDamage, Math.floor(raw - enemy.def)), crit };
}
function magicDamage(ally, enemy, s) {
  const cfg = GameData.battle;
  const raw = ally.matk * (s.power || 1) + rnd(s.variance || 0);
  return { dmg: Math.max(cfg.minDamage, Math.floor(raw - enemy.def * 0.5)), crit: false };
}
function enemyDamage(enemy, target, power = 1) {
  const cfg = GameData.battle;
  let d = Math.max(cfg.enemyMinDamage, Math.floor(enemy.atk * power - target.def * cfg.defenseFactor + rnd(3)));
  if (B.guard) d = Math.max(1, Math.floor(d * cfg.guardReduction));
  return d;
}
function healHp(m, n) { const before = m.hp; m.hp = Math.min(m.maxHp, m.hp + n); return m.hp - before; }
function healMp(m, n) { const before = m.mp; m.mp = Math.min(m.maxMp, m.mp + n); return m.mp - before; }
function lowestHpAlly() { return aliveAllies().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; }

function damageEnemy(e, dmg, crit) {
  e.hp = Math.max(0, e.hp - dmg);
  const a = bvActor(e);
  bvHit(a);
  bvText(a, crit ? `${dmg}!` : dmg, crit ? "#facc15" : "#ffffff", crit);
  if (crit) bvShake(6);
  if (e.hp <= 0) {
    a.dying = true;
    SFX.enemy_die();
  } else SFX.hit(0.7);
}

// ---------- 적 턴 ----------
async function enemyTurn(e) {
  const total = e.actions.reduce((s, a) => s + (a.weight || 1), 0);
  let r = Math.random() * total;
  const act = e.actions.find(a => (r -= (a.weight || 1)) < 0) || e.actions[0];
  const ea = bvActor(e);
  battleMsg(`${e.name}의 ${act.name || "공격"}!`);
  const allies = aliveAllies();
  if (!allies.length) return;
  if (act.type === "special" && act.target === "all") {
    await bvMove(ea, ea.homeX + 16, ea.homeY, 160);
    const fx = FX[act.fx] || FX.dark;
    SFX.fire(0.8);
    await fx(allies.map(bvActor));
    allies.forEach(t => hurtAlly(t, enemyDamage(e, t, act.power || 1)));
    await bvMove(ea, ea.homeX, ea.homeY, 160);
  } else {
    const t = allies[Math.floor(Math.random() * allies.length)];
    const ta = bvActor(t);
    await bvMove(ea, ta.x - 50, ta.y, 230);
    if (act.type === "special") { const fx = FX[act.fx] || FX.dark; await fx([ta]); }
    else { SFX.hit(); FX.impact(ta); }
    hurtAlly(t, enemyDamage(e, t, act.power || 1));
    await bvWait(200);
    await bvMove(ea, ea.homeX, ea.homeY, 220);
  }
  renderBattleParty();
  await bvWait(250);
}

function hurtAlly(m, dmg) {
  m.hp = Math.max(0, m.hp - dmg);
  const a = bvActor(m);
  bvHit(a);
  bvShake(5);
  bvText(a, dmg, "#fca5a5");
}

// ---------- 종료 ----------
function checkBattleEnd() {
  if (B.over) return true;
  if (!aliveEnemies().length) { victory(); return true; }
  if (!aliveAllies().length) { defeat(); return true; }
  return false;
}

async function victory() {
  B.over = true;
  await bvWait(500);
  const exp = B.enemies.reduce((s, e) => s + e.exp, 0);
  const gold = B.enemies.reduce((s, e) => s + e.gold, 0);
  const drops = [];
  B.enemies.forEach(e => e.drops.forEach(d => { if (Math.random() < d.chance) { player.inventory[d.item] = (player.inventory[d.item] || 0) + 1; drops.push(d.item); } }));
  player.exp += exp;
  player.gold += gold;
  const ups = checkLevelUp();
  stopBGM(0.3);
  SFX.fanfare();
  activeParty().forEach(m => { const a = bvActor(m); if (a && m.hp > 0) a.active = true; });
  const lines = [`🎉 승리! EXP +${exp} · ${gold}G 획득`];
  if (drops.length) lines.push(`🎁 전리품: ${drops.map(id => GameData.items.items[id].name).join(", ")}`);
  if (ups.length) { lines.push(`✨ 파티 레벨 업! Lv.${player.lv}`); setTimeout(() => SFX.levelup(), 900); }
  battleMsg(lines.join("  ·  "));
  renderBattleParty();
  setCommands([{ label: "확인", onClick: () => endBattle("win") }], lines.join("\n"));
}

async function defeat() {
  B.over = true;
  stopBGM(0.6);
  battleMsg("파티가 쓰러졌다…");
  await bvWait(1400);
  endBattle("lose");
}

async function endBattle(result) {
  setCommands([]);
  await fadeTo(1, 200);
  bvStop();
  $("battle-ui").style.display = "none";
  $("battle-msg").classList.remove("show");
  gameState = "WORLD";
  World.sinceBattle = 0;
  if (result === "lose") {
    const r = GameData.game.respawn;
    healParty();
    AudioSys.currentId = null;
    enterMap(r.map, r.x, r.y, r.dir);
    await fadeTo(0, 300);
    runScene("party_wiped");
    return;
  }
  AudioSys.currentId = null;
  playBGM(World.map.bgm);
  updateHUD();
  await fadeTo(0, 250);
  // 전투에서 벗어나면 자동 저장. 승리 장면이 이어지면 그 대화가 끝날 때 저장된다.
  if (result === "win" && B.win) runScene(B.win);
  else requestAutoSave("battle");
}
