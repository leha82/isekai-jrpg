// ==========================================
// 시나리오 런타임 (게임 전용)
// 1) scenario/manifest.json 과 암호화 파일을 받고
// 2) Firebase scriptKeys/{keyId} 에서 키를 받아(Firestore REST, 공개 읽기) 복호화한 뒤
// 3) 파싱·검사하여 SCN 에 보관하고, 장면(@scene)·맵 이벤트(@event)를 실행한다.
// ==========================================
let SCN = null; // 불러온 시나리오

// 복호화 키는 공개 읽기 문서라 Firebase SDK 없이 Firestore REST 로 받는다.
// (SDK 를 못 불러와도 게임은 시작되고, 클라우드 세이브만 꺼진다)
async function fetchScriptKey(keyId) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/scriptKeys/${encodeURIComponent(keyId)}?key=${FIREBASE_CONFIG.apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`키 응답 ${res.status}`);
  const doc = await res.json();
  const key = doc.fields && doc.fields.key && doc.fields.key.stringValue;
  if (!key) throw new Error("키 형식 오류");
  return key;
}

async function loadScenario() {
  if (location.protocol === "file:") {
    throw new Error("파일로 직접 열면 실행할 수 없습니다. VS Code F5(localhost) 또는 배포 사이트에서 실행하세요.");
  }
  let manifest;
  try {
    manifest = await fetchJsonFile(`${SCENARIO_DIR}/manifest.json`);
  } catch (e) {
    if (e.status === 404) throw new Error("시나리오가 아직 업로드되지 않았습니다. 관리자 페이지(admin.html)에서 스크립트를 저장해 주세요.");
    throw e;
  }
  const encFiles = await Promise.all(manifest.files.map(f => fetchJsonFile(`${SCENARIO_DIR}/${f}.enc.json`)));
  const keys = {};
  for (const keyId of new Set(encFiles.map(f => f.keyId))) {
    try { keys[keyId] = await fetchScriptKey(keyId); }
    catch (e) { throw new Error(`복호화 키(${keyId})를 받지 못했습니다. (${e.message}) 관리자 페이지에서 다시 저장해 주세요.`); }
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
    item: id => player.inventory[id] || 0,
    quest: id => questState(id),
    v: name => player.vars[name] || 0
  };
}

function scnText(key, fallback = "") {
  return SCN && typeof SCN.texts[key] === "string" ? fmt(SCN.texts[key]) : fallback;
}

// ---------- 퀘스트 ----------
function questState(id) { return (player && player.quests[id]) || "none"; }
function questDef(id) { return SCN && SCN.quests[id]; }
function questsByState(state) {
  if (!SCN) return [];
  return Object.values(SCN.quests).filter(q => questState(q.id) === state)
    .sort((a, b) => (a.type === b.type ? a.order - b.order : a.type === "main" ? -1 : 1));
}
function mainQuest() { return questsByState("active").find(q => q.type === "main") || null; }

function setQuest(id, state) {
  const q = questDef(id);
  if (!q) return;
  if (questState(id) === state) return;
  player.quests[id] = state;
  showToast(state === "done" ? `✅ 퀘스트 완료: ${fmt(q.title)}` : `📜 새 퀘스트: ${fmt(q.title)}`);
}

// ---------- 실행 ----------
function runEvent(ev) { runSteps(ev.steps, 0); }

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
    if (stop) return; // shop / battle / warp / ending 은 장면을 끝낸다 (상점 닫기·전투 종료·맵 이동 때 자동 저장)
  }
  requestAutoSave("event"); // NPC 대화·이벤트가 끝나면 자동 저장
}

function execScenarioCommand(c) {
  switch (c.name) {
    case "flag": player.storyFlag = c.value; break;
    case "set": player.vars[c.key] = c.value; break;
    case "join": case "leave": {
      const m = partyMember(c.id);
      if (m) m.unlocked = c.name === "join";
      break;
    }
    case "quest": setQuest(c.id, c.action === "start" ? "active" : "done"); break;
    case "heal": healParty(); break;
    case "sfx": playSFX(c.id); break;
    case "bgm": playBGM(c.id); break;
    case "save": saveGame(); break;
    case "weapon": case "armor": applyGearUpgrade(c.name, c.amount); break;
    case "gold": player.gold = Math.max(0, player.gold + c.amount); break;
    case "exp": {
      player.exp += c.amount;
      const ups = checkLevelUp();
      if (ups.length) { SFX.levelup(); showToast(`✨ 파티 레벨 업! Lv.${player.lv}`); }
      break;
    }
    case "item": player.inventory[c.item] = Math.max(0, (player.inventory[c.item] || 0) + c.amount); break;
    case "move": player.x = c.x; player.y = c.y; if (c.dir) player.dir = c.dir; break;
    case "warp": doWarp(c.map, c.x, c.y, c.dir); return true;
    case "shop": openShop(c.shop); return true;
    case "battle": startBattle(c.enemies, { boss: c.boss, win: c.win }); return true;
    case "ending": showEnding(); return true;
  }
  updateHUD();
  return false;
}

function showEnding() {
  gameState = "ENDING";
  playBGM("ending");
  $("dialog-box").style.display = "none";
  $("hud-left").style.display = "none";
  $("hud-right").style.display = "none";
  $("ov-continue").style.display = "none";
  $("ov-load").style.display = "none";
  $("ov-auth").style.display = "none";
  $("ov-title").textContent = scnText("ending_title", "THE END");
  $("ov-subtitle").textContent = `${player.name} · Lv.${player.lv}`;
  $("ov-desc").textContent = scnText("ending_body", "클리어 축하합니다!");
  const btn = $("ov-btn");
  btn.textContent = "처음부터 다시 플레이";
  btn.onclick = () => location.reload();
  $("overlay-screen").style.display = "flex";
}
