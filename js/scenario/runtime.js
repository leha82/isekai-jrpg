// ==========================================
// 시나리오 런타임 (게임 전용)
// 1) scenario/manifest.json 과 암호화 파일을 받고
// 2) Firebase scriptKeys/{keyId} 에서 키를 받아 복호화한 뒤
// 3) 파싱·검사하여 SCN 에 보관하고, 장면(@scene)·맵 이벤트(@event)를 실행한다.
// ==========================================
let SCN = null; // 불러온 시나리오

// Firebase module 스크립트(js/firebase/game-cloud.js)가 window.cloud 를 만들 때까지 기다린다.
function waitForCloud(timeoutMs = 15000) {
  if (window.cloud) return Promise.resolve(window.cloud);
  // 페이지 로드가 끝났는데도 window.cloud 가 없으면 SDK 로드에 실패한 것이다.
  if (document.readyState === "complete") return Promise.reject(new Error("Firebase SDK를 불러오지 못했습니다. (오프라인?)"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Firebase 연결 시간이 초과되었습니다.")), timeoutMs);
    document.addEventListener("cloud-ready", () => { clearTimeout(timer); resolve(window.cloud); }, { once: true });
    window.addEventListener("load", () => {
      if (!window.cloud) { clearTimeout(timer); reject(new Error("Firebase SDK를 불러오지 못했습니다. (오프라인?)")); }
    }, { once: true });
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) { const e = new Error(`${url} 응답 ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

async function loadScenario() {
  if (location.protocol === "file:") {
    throw new Error("파일로 직접 열면 시나리오를 불러올 수 없습니다. VS Code F5(localhost) 또는 배포 사이트에서 실행하세요.");
  }
  const bust = `?t=${Date.now()}`; // GitHub Pages 캐시 회피
  let manifest;
  try {
    manifest = await fetchJson(`${SCENARIO_DIR}/manifest.json${bust}`);
  } catch (e) {
    if (e.status === 404) throw new Error("시나리오가 아직 업로드되지 않았습니다. 관리자 페이지(admin.html)에서 스크립트를 저장해 주세요.");
    throw e;
  }
  const encFiles = await Promise.all(manifest.files.map(f => fetchJson(`${SCENARIO_DIR}/${f}.enc.json${bust}`)));

  const cloud = await waitForCloud();
  const keys = {};
  for (const keyId of new Set(encFiles.map(f => f.keyId))) {
    try { keys[keyId] = await cloud.getScriptKey(keyId); }
    catch (e) { throw new Error(`복호화 키(${keyId})를 받지 못했습니다. 관리자 페이지에서 다시 저장해 주세요.`); }
  }
  const sources = await Promise.all(encFiles.map(f => ScenarioCrypto.decryptText(f, keys[f.keyId])));

  const scn = ScenarioFormat.parseAll(manifest.files.map((name, i) => ({ name, text: sources[i] })));
  ScenarioFormat.validate(scn, buildScenarioContext());
  if (scn.errors.length) {
    console.error("[시나리오 오류]", scn.errors);
    const first = scn.errors[0];
    throw new Error(`스크립트 오류 ${scn.errors.length}건 — 관리자 페이지에서 검사하세요. (${first.file}:${first.line} ${first.message})`);
  }
  if (scn.warnings.length) console.warn("[시나리오 경고]", scn.warnings);
  SCN = scn;
  return scn;
}

// ---------- 조회 ----------
function scenarioState() {
  return {
    flag: player.storyFlag, lv: player.lv, gold: player.gold, weapon: player.weaponLv, armor: player.armorLv,
    joined: id => { const m = partyMember(id); return !!(m && m.unlocked); },
    item: id => player.inventory[id] || 0
  };
}

function scnText(key, fallback = "") {
  return SCN && typeof SCN.texts[key] === "string" ? SCN.texts[key] : fallback;
}

// 현재 플래그 이하에서 가장 큰 @quest 를 HUD 목표로 쓴다.
function scenarioQuestText() {
  if (!SCN) return "";
  const flags = Object.keys(SCN.quests).map(Number).filter(f => f <= player.storyFlag);
  return flags.length ? SCN.quests[Math.max(...flags)] : "";
}

function scenarioEventSprites() {
  if (!SCN) return [];
  const st = scenarioState();
  return SCN.events.filter(ev => ev.sprite && ScenarioFormat.evalCondition(ev.sprite.cond, st));
}

// 현재 위치에 이벤트가 있으면 실행하고 true
function checkTileEvent() {
  if (!SCN) return false;
  const ev = SCN.events.find(e => e.x === player.x && e.y === player.y);
  if (!ev) return false;
  runSteps(ev.steps, 0);
  return true;
}

// ---------- 실행 ----------
function runScene(id) {
  const scene = SCN && SCN.scenes[id];
  if (!scene) { console.error(`[시나리오] 없는 장면: ${id}`); showToast(`스크립트 오류: 장면 ${id} 없음`, true); return; }
  runSteps(scene.steps, 0);
}

// 연속된 대사는 한 번의 대화창으로 묶고, 대화가 끝나면 다음 단계를 이어서 실행한다.
function runSteps(steps, start) {
  let i = start;
  while (i < steps.length) {
    const s = steps[i];
    if (s.t === "say") {
      const batch = [];
      while (i < steps.length && steps[i].t === "say") { batch.push({ speaker: steps[i].speaker, text: steps[i].text }); i++; }
      const next = i;
      startDialog(batch, () => runSteps(steps, next));
      return;
    }
    if (s.t === "jump") {
      if (ScenarioFormat.evalCondition(s.cond, scenarioState())) { runScene(s.target); return; }
      i++;
      continue;
    }
    const stop = execScenarioCommand(s);
    i++;
    if (stop) return; // shop / battle / ending 은 장면을 끝낸다
  }
}

function execScenarioCommand(c) {
  switch (c.name) {
    case "flag": player.storyFlag = c.value; break;
    case "join": case "leave": {
      const m = partyMember(c.id);
      if (m) m.unlocked = c.name === "join";
      break;
    }
    case "heal": party.forEach(m => { m.hp = m.maxHp; m.mp = m.maxMp; }); break;
    case "sfx": if (SFX[c.sound]) SFX[c.sound](); break;
    case "bgm": setBGM(c.mode.toUpperCase()); break;
    case "save": saveGame(true, true); break;
    case "weapon": case "armor": applyGearUpgrade(c.name, c.amount); break;
    case "gold": player.gold = Math.max(0, player.gold + c.amount); break;
    case "exp": {
      const before = player.lv;
      player.exp += c.amount;
      checkLevelUp();
      if (player.lv > before) showToast(`✨ 파티 레벨 업! Lv.${player.lv}`);
      break;
    }
    case "item": player.inventory[c.item] = Math.max(0, (player.inventory[c.item] || 0) + c.amount); break;
    case "move": player.x = c.x; player.y = c.y; break;
    case "shop": openTownShop(c.title); return true;
    case "battle": startBattle(c.enemy, c.boss, c.win); return true;
    case "ending": showEnding(); return true;
  }
  updateHUD();
  renderWorld();
  return false;
}

function showEnding() {
  gameState = "ENDING";
  document.getElementById("dialog-box").style.display = "none";
  document.getElementById("ov-continue").style.display = "none";
  document.getElementById("ov-title").innerText = scnText("ending_title", "THE END");
  document.getElementById("ov-desc").innerText = scnText("ending_body", "클리어 축하합니다!");
  const btn = document.getElementById("ov-btn");
  btn.innerText = "처음부터 다시 플레이";
  btn.onclick = () => location.reload();
  document.getElementById("overlay-screen").style.display = "flex";
}
