// ==========================================
// 세이브 — 자동 저장 슬롯 1개 + 수동 저장 슬롯 5개
//  - 이 기기: localStorage "wedge_save_auto", "wedge_save_1" ~ "wedge_save_5"
//  - 클라우드(Google 로그인 시): Firestore saves/{uid}/slots/{auto|1..5}
//    로그인하면 모든 저장(자동 포함)이 클라우드에도 기록되고, 어느 기기에서든 같은 슬롯을 불러온다.
//    슬롯마다 savedAt 이 더 최근인 쪽을 쓴다 (로그인 직후 양쪽을 맞춘다).
//  - 자동 저장 시점: 전투에서 벗어날 때, 다른 맵으로 이동했을 때, NPC 대화(이벤트)가 끝났을 때, 스토리 진행(> save)
//  - 자동 저장의 클라우드 쓰기는 AUTO_CLOUD_MIN_MS 간격으로 모아서 보낸다 (Firestore 무료 쓰기 한도 보호).
// Firebase SDK 는 js/firebase/game-cloud.js (module) 가 window.cloud 로 노출한다. 못 불러와도 이 기기 저장은 동작한다.
// ==========================================
const SAVE_VERSION = 2;
const SAVE_SLOTS = ["auto", "1", "2", "3", "4", "5"];
const LOCAL_SAVE_PREFIX = "wedge_save_";
const LEGACY_SAVE_KEY = "arcadia_isekai_jrpg_save_v1";  // 슬롯 도입 전 단일 세이브 → 자동 저장 슬롯으로 옮긴다
const AUTO_CLOUD_MIN_MS = 20000;
const PLAYER_SAVE_FIELDS = ["name", "map", "x", "y", "dir", "lv", "exp", "nextExp", "gold", "weaponLv", "armorLv", "storyFlag", "quests", "vars", "focusQuest"];
const PARTY_SAVE_FIELDS = ["hp", "maxHp", "mp", "maxMp", "atk", "matk", "def", "unlocked"];

function slotLabel(id) { return id === "auto" ? "자동 저장" : `슬롯 ${id}`; }

// ---------- 데이터 만들기 / 적용 ----------
function buildSaveData() {
  const p = {};
  PLAYER_SAVE_FIELDS.forEach(k => { p[k] = (typeof player[k] === "object" && player[k]) ? JSON.parse(JSON.stringify(player[k])) : player[k]; });
  // 이동 중이면 도착할 칸이 아니라 지금 서 있는 칸(이미 확정된 좌표)을 저장한다
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    player: p,
    inventory: { ...player.inventory },
    party: party.map(m => {           // 배열 순서 = 파티 순서 (첫 번째 합류 멤버가 리더)
      const o = { id: m.id };
      PARTY_SAVE_FIELDS.forEach(k => o[k] = m[k]);
      return o;
    })
  };
}

// v1(아르카디아 연대기 시절) 세이브를 v2 로 변환한다.
function migrateSave(d) {
  if (d.version === 1) {
    const g = GameData.game;
    const flag = Math.min(2, d.player.storyFlag || 0);
    const quests = {};
    if (flag === 0) quests.main_forest = "active";
    if (flag >= 1) { quests.main_forest = "done"; quests.main_capital = flag >= 2 ? "done" : "active"; }
    if (flag >= 2) quests.main_north = "active";
    const idMap = { elf: "ria", knight: "garen" };
    d = {
      version: 2, savedAt: d.savedAt,
      player: Object.assign({}, d.player, { name: g.defaultHeroName, map: flag >= 1 ? "lucen" : g.start.map,
        x: flag >= 1 ? 16 : g.start.x, y: flag >= 1 ? 25 : g.start.y, dir: "down", storyFlag: flag, quests, vars: {} }),
      inventory: d.inventory || {},
      party: d.party.map(m => Object.assign({}, m, { id: idMap[m.id] || m.id }))
    };
  }
  return d;
}

// 손상되었거나 알 수 없는 버전의 세이브는 null (로컬·클라우드 공용)
function validateSave(d) {
  if (!d || (d.version !== 1 && d.version !== SAVE_VERSION) || !d.player || !Array.isArray(d.party)) return null;
  return d;
}

// 새 게임 상태를 만든 뒤 세이브 값을 덮어쓴다.
function applySaveData(raw) {
  const d = migrateSave(raw);
  newGameState(d.player.name);
  PLAYER_SAVE_FIELDS.forEach(k => {
    const v = d.player[k];
    if (v === undefined || v === null) return;
    if (typeof v === typeof player[k]) player[k] = typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v;
  });
  if (d.inventory) Object.keys(d.inventory).forEach(k => { if (typeof d.inventory[k] === "number") player.inventory[k] = d.inventory[k]; });
  d.party.forEach(s => {
    const m = partyMember(s.id);
    if (!m) return;
    PARTY_SAVE_FIELDS.forEach(k => { if (s[k] !== undefined) m[k] = s[k]; });
  });
  // 파티 순서 복원 (세이브에 없는 멤버는 뒤로)
  const order = d.party.map(s => s.id);
  const rank = (id) => { const i = order.indexOf(id); return i < 0 ? 99 : i; };
  party.sort((a, b) => rank(a.id) - rank(b.id));
  const hero = partyMember("hero");
  if (hero) hero.unlocked = true;
  // 없는 맵이거나 지나갈 수 없는 칸이면 시작 지점으로 보정
  const m = GameData.maps[player.map];
  if (!m || !tileWalkable(m, player.x, player.y)) {
    console.warn("[세이브] 저장 위치를 쓸 수 없어 시작 지점으로 보정:", player.map, player.x, player.y);
    const st = GameData.game.start;
    Object.assign(player, { map: st.map, x: st.x, y: st.y, dir: st.dir });
  }
}

// ---------- 이 기기(localStorage) ----------
function readLocalSlot(id) {
  try {
    const raw = localStorage.getItem(LOCAL_SAVE_PREFIX + id);
    return raw ? validateSave(JSON.parse(raw)) : null;
  } catch (e) { return null; }
}
function writeLocalSlot(id, data) { localStorage.setItem(LOCAL_SAVE_PREFIX + id, JSON.stringify(data)); }
function deleteLocalSlot(id) { try { localStorage.removeItem(LOCAL_SAVE_PREFIX + id); } catch (e) {} }

// 슬롯 도입 전 세이브를 자동 저장 슬롯으로 옮긴다 (한 번만)
(function migrateLegacyLocal() {
  try {
    const raw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return;
    const d = validateSave(JSON.parse(raw));
    if (d && !localStorage.getItem(LOCAL_SAVE_PREFIX + "auto")) localStorage.setItem(LOCAL_SAVE_PREFIX + "auto", raw);
    localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch (e) {}
})();

// ---------- 슬롯 조회 (이 기기 + 클라우드 중 최신) ----------
let cloudUser = null;      // 로그인한 Firebase 사용자
let cloudSlots = {};       // 클라우드 슬롯 캐시: id → data
let cloudBusy = false;

function cloudReady() { return !!(window.cloud && cloudUser); }
const savedTime = (d) => (d && Date.parse(d.savedAt)) || 0;

// → { id, data, source:"local"|"cloud" } | null
function slotSave(id) {
  const local = readLocalSlot(id);
  const remote = cloudReady() ? cloudSlots[id] || null : null;
  if (local && remote) return savedTime(remote) > savedTime(local) ? { id, data: remote, source: "cloud" } : { id, data: local, source: "local" };
  if (remote) return { id, data: remote, source: "cloud" };
  if (local) return { id, data: local, source: "local" };
  return null;
}
function allSlotSaves() { return SAVE_SLOTS.map(slotSave); }
function latestAnySave() {
  return allSlotSaves().filter(Boolean).sort((a, b) => savedTime(b.data) - savedTime(a.data))[0] || null;
}
function hasAnySave() { return !!latestAnySave(); }

function saveSourceLabel(source) { return source === "cloud" ? "☁️ 클라우드" : (cloudReady() ? "☁️ 동기화됨" : "💾 이 기기"); }
function saveSummary(d) {
  const p = d.player;
  const map = GameData.maps[p.map];
  const t = new Date(d.savedAt);
  const when = isNaN(t) ? "" : `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  return { who: `${p.name || "?"} · Lv.${p.lv}`, where: map ? map.name : p.map, when };
}

// ---------- 저장 ----------
let autoCloud = { timer: null, last: 0, pending: null };

// 슬롯에 저장. opts.auto: 자동 저장(표시를 작게), opts.cloudNow: 클라우드 즉시 쓰기
function saveToSlot(id, opts = {}) {
  if (!player) return false;
  const data = buildSaveData();
  try {
    writeLocalSlot(id, data);
  } catch (e) {
    showToast("⚠️ 저장 실패 (브라우저 저장소를 사용할 수 없습니다)", true);
    return false;
  }
  if (opts.auto) flashAutoSaveMark(); else showToast(`💾 ${slotLabel(id)}에 저장했습니다.`);
  if (cloudReady()) {
    if (id === "auto" && !opts.cloudNow) queueAutoCloud(data);
    else { if (id === "auto") cancelAutoCloud(); cloudWriteSlot(id, data, !opts.auto); }
  }
  return true;
}

// 자동 저장 요청. 연출·대화가 끝나 필드에 돌아왔을 때만 저장한다. 여러 번 불려도 한 번만 저장.
let autoSaveTimer = null;
function requestAutoSave(reason = "") {
  if (!player) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    if (gameState !== "WORLD" || World.transitioning) return; // 이어지는 대화·전투가 끝날 때 다시 요청된다
    saveToSlot("auto", { auto: true });
  }, 250);
}

// 스토리 진행 시점(> save): 바로 저장하고 클라우드도 즉시 기록
function saveGame() { return saveToSlot("auto", { auto: true, cloudNow: true }); }

let autoMarkTimer = null;
function flashAutoSaveMark() {
  const el = $("autosave-mark");
  if (!el) return;
  el.classList.add("show");
  clearTimeout(autoMarkTimer);
  autoMarkTimer = setTimeout(() => el.classList.remove("show"), 1400);
}

function queueAutoCloud(data) {
  autoCloud.pending = data;
  if (autoCloud.timer) return;
  const wait = Math.max(0, autoCloud.last + AUTO_CLOUD_MIN_MS - Date.now());
  autoCloud.timer = setTimeout(flushAutoCloud, wait);
}
function cancelAutoCloud() { clearTimeout(autoCloud.timer); autoCloud.timer = null; autoCloud.pending = null; }
function flushAutoCloud() {
  clearTimeout(autoCloud.timer);
  autoCloud.timer = null;
  const data = autoCloud.pending;
  autoCloud.pending = null;
  return data && cloudReady() ? cloudWriteSlot("auto", data, false) : Promise.resolve();
}
// 탭을 닫거나 숨기면 모아 둔 자동 저장을 바로 보낸다
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && autoCloud.pending) flushAutoCloud(); });

async function cloudWriteSlot(id, data, notify) {
  if (!cloudReady()) return;
  if (id === "auto") autoCloud.last = Date.now();
  try {
    await window.cloud.saveSlot(id, data);
    cloudSlots[id] = data;
    if (notify) showToast(`☁️ ${slotLabel(id)} 클라우드 저장 완료`);
  } catch (e) {
    console.error("[클라우드 저장 실패]", id, e);
    showToast(`☁️ 클라우드 저장 실패 — 이 기기에는 저장됨 (${(e && e.code) || "오류"})`, true);
  }
}

async function deleteSlot(id) {
  deleteLocalSlot(id);
  if (id === "auto") cancelAutoCloud();
  delete cloudSlots[id];
  if (cloudReady()) {
    try { await window.cloud.deleteSlot(id); } catch (e) { showToast("☁️ 클라우드 슬롯 삭제 실패", true); }
  }
}

// ---------- 클라우드 동기화 ----------
async function refreshCloudSlots() {
  if (!cloudReady()) return;
  try {
    const raw = await window.cloud.loadSlots();
    cloudSlots = {};
    Object.entries(raw).forEach(([id, d]) => { const v = validateSave(d); if (v && SAVE_SLOTS.includes(id)) cloudSlots[id] = v; });
  } catch (e) {
    console.error("[클라우드 읽기 실패]", e);
    showToast("☁️ 클라우드 연결 실패 — 이 기기의 세이브를 사용합니다.", true);
  }
}

// 로그인 직후: 슬롯마다 최신본으로 양쪽을 맞춘다. (예전 단일 클라우드 세이브는 자동 저장 슬롯 후보로 본다)
async function syncOnLogin() {
  try {
    await refreshCloudSlots();
    let legacy = null;
    if (!cloudSlots.auto) {
      legacy = validateSave(await window.cloud.loadLegacy());
      if (legacy) cloudSlots.auto = legacy;
    }
    let up = 0;
    for (const id of SAVE_SLOTS) {
      const local = readLocalSlot(id), remote = cloudSlots[id];
      if (local && (!remote || savedTime(local) > savedTime(remote))) {
        await window.cloud.saveSlot(id, local); cloudSlots[id] = local; up++;
      } else if (remote && (!local || savedTime(remote) > savedTime(local))) {
        try { writeLocalSlot(id, remote); } catch (e) {}
      }
    }
    // 예전 단일 세이브가 그대로 자동 저장 슬롯이 되었으면 슬롯 문서로 옮겨 적는다
    if (legacy && cloudSlots.auto === legacy) await window.cloud.saveSlot("auto", legacy);
    if (up) showToast(`☁️ 이 기기의 세이브 ${up}개를 클라우드에 올렸습니다.`);
  } catch (e) {
    console.error("[클라우드 동기화 실패]", e);
    showToast("☁️ 클라우드 세이브를 확인하지 못했습니다.", true);
  }
  refreshTitleContinue();
}

// game-cloud.js 의 onAuthStateChanged 에서 호출된다.
function onCloudAuthChanged(user) {
  if (cloudUser && !user && autoCloud.pending) cancelAutoCloud();
  cloudUser = user;
  cloudSlots = {};
  updateAuthUI();
  refreshTitleContinue();
  if (user) syncOnLogin();
}

// ---------- 불러오기 ----------
// 클라우드 슬롯을 고르면 이 기기에도 복사해 둔다
function applyPickedSave(pick) {
  applySaveData(pick.data);
  if (pick.source === "cloud") { try { writeLocalSlot(pick.id, pick.data); } catch (e) {} }
}

async function loadSlot(id) {
  if (cloudBusy) return;
  const fromTitle = Modal.prev === "TITLE" || gameState === "TITLE";
  const pick = slotSave(id);
  if (!pick) { showToast("빈 슬롯입니다.", true); return; }
  const s = saveSummary(pick.data);
  if (!fromTitle && !(await uiConfirm(`${slotLabel(id)} (${s.who} · ${s.where})을(를) 불러올까요?\n지금 진행 중인 내용 중 저장하지 않은 것은 사라집니다.`, { ok: "불러오기" }))) return;
  closeModal();
  applyPickedSave(pick);
  if (fromTitle) { startGame(true); return; }
  AudioSys.currentId = null;
  World.map = null;
  enterMap(player.map, player.x, player.y, player.dir);
  SFX.coin();
  showToast(`📂 불러오기 완료! (${slotLabel(id)} · Lv.${player.lv})`);
}

// 타이틀 '이어하기' = 가장 최근에 저장된 슬롯
async function continueGame() {
  if (!SCN) return;
  initAudio(); // await 이후에는 사용자 입력으로 인정되지 않으므로 먼저 오디오를 깨운다
  if (cloudBusy) return;
  cloudBusy = true;
  try { await refreshCloudSlots(); } finally { cloudBusy = false; }
  const pick = latestAnySave();
  if (!pick) { refreshTitleContinue(); showToast("저장 데이터를 읽을 수 없습니다.", true); return; }
  applyPickedSave(pick);
  startGame(true);
}

function refreshTitleContinue() {
  const btn = document.getElementById("ov-continue");
  if (!btn) return;
  if (gameState === "ENDING") { btn.style.display = "none"; return; }
  const pick = latestAnySave();
  if (pick) {
    const s = saveSummary(pick.data);
    btn.textContent = `▶ 이어하기 (${s.who} · ${slotLabel(pick.id)})`;
    btn.style.display = "inline-block";
  } else {
    btn.style.display = "none";
  }
}

// ---------- 저장·불러오기 창 ----------
let saveWindowTab = "save";

async function openSaveWindow(tab = "save") {
  initAudio();
  const inGame = gameState === "WORLD" || (gameState === "MODAL" && Modal.prev === "WORLD");
  if (!inGame && gameState !== "TITLE" && !(gameState === "MODAL" && Modal.prev === "TITLE")) return;
  if (!inGame) tab = "load";
  saveWindowTab = tab;
  SFX.confirm();
  renderSaveWindow(true);
  if (cloudReady()) {
    cloudBusy = true;
    try { await refreshCloudSlots(); } finally { cloudBusy = false; }
    if (modalOpen("save")) renderSaveWindow();
  }
}

function renderSaveWindow(loading = false) {
  const inGame = (gameState === "MODAL" ? Modal.prev : gameState) === "WORLD";
  const tab = inGame ? saveWindowTab : "load";
  const rows = SAVE_SLOTS.map(id => {
    const pick = slotSave(id);
    const info = pick ? (() => { const s = saveSummary(pick.data); return `<b>${escapeHtml(s.who)}</b> · ${escapeHtml(s.where)}<br><small>${s.when} · ${saveSourceLabel(pick.source)}</small>`; })()
      : `<span class="muted">비어 있음</span>`;
    let btn = "";
    if (tab === "save") btn = id === "auto" ? `<span class="muted small">자동</span>` : `<button class="item-btn" onclick="saveSlotClick('${id}')">저장</button>`;
    else btn = `<button class="item-btn" onclick="loadSlot('${id}')" ${pick ? "" : "disabled"}>불러오기</button>`;
    return `<div class="slot-row${pick ? "" : " empty"}"><span class="slot-name">${id === "auto" ? "🔄 " : "💾 "}${slotLabel(id)}</span><div class="slot-info">${info}</div>${btn}</div>`;
  }).join("");
  const cloudLine = !window.cloud ? `<p class="muted small">클라우드를 사용할 수 없어 이 기기에만 저장됩니다.</p>`
    : cloudReady() ? `<p class="muted small">☁️ ${escapeHtml(cloudUser.displayName || cloudUser.email || "")} — 모든 슬롯이 클라우드에 저장되어 다른 기기에서도 불러올 수 있습니다.${loading ? " (클라우드 확인 중…)" : ""}</p>`
    : `<p class="muted small">로그인하지 않아 <b>이 기기에만</b> 저장됩니다. Google 로그인하면 모든 저장이 클라우드에 올라갑니다. <button class="item-btn" onclick="toggleLogin()">🔑 로그인</button></p>`;
  const help = tab === "save" ? `<p class="muted small" style="margin:0">자동 저장: 전투가 끝났을 때 · 다른 맵으로 이동했을 때 · NPC 대화가 끝났을 때</p>` : "";
  openWindow(inGame ? "💾 저장 · 불러오기" : "📂 불러오기", help + rows + cloudLine, inGame ? {
    kind: "save", tabs: [{ id: "save", label: "저장" }, { id: "load", label: "불러오기" }], active: tab,
    onTab: (t) => { saveWindowTab = t; renderSaveWindow(); }
  } : { kind: "save" });
}

async function saveSlotClick(id) {
  if (Modal.prev !== "WORLD") return;
  const cur = slotSave(id);
  if (cur) {
    const s = saveSummary(cur.data);
    if (!(await uiConfirm(`${slotLabel(id)}에 이미 저장된 데이터가 있습니다.\n(${s.who} · ${s.where} · ${s.when})\n덮어쓸까요?`, { ok: "덮어쓰기", danger: true }))) return;
  }
  saveToSlot(id);
  SFX.coin();
  renderSaveWindow();
}

// ---------- 로그인 ----------
// 타이틀 화면의 로그인 버튼·상태 문구 (게임 중에는 설정 메뉴에서 로그인)
function updateAuthUI() {
  const ovBtn = document.getElementById("ov-login-btn");
  const status = document.getElementById("ov-auth-status");
  if (!window.cloud || location.protocol === "file:") {
    ovBtn.style.display = "none";
    status.textContent = location.protocol === "file:"
      ? "파일로 직접 열면 로그인할 수 없습니다. 배포 사이트나 localhost 에서 접속하세요."
      : "클라우드 세이브에 연결할 수 없습니다. 이 기기에만 저장됩니다.";
    return;
  }
  ovBtn.style.display = "inline-block";
  if (cloudUser) {
    ovBtn.textContent = "🔓 로그아웃";
    status.textContent = `☁️ ${cloudUser.displayName || cloudUser.email || "사용자"} 님 — 모든 저장이 클라우드에 기록됩니다.`;
  } else {
    ovBtn.textContent = "🔑 Google 로그인";
    status.textContent = "로그인하면 모든 저장이 클라우드에 올라가 다른 기기에서도 이어할 수 있습니다.";
  }
  if (typeof rerenderSettingsIfOpen === "function") rerenderSettingsIfOpen();
  if (modalOpen("save")) renderSaveWindow();
}

async function toggleLogin() {
  initAudio();
  if (!window.cloud) { showToast("클라우드 세이브를 사용할 수 없습니다.", true); return; }
  if (cloudBusy) return;
  if (cloudUser) {
    if (!(await uiConfirm("로그아웃할까요?\n로그아웃하면 이 기기에만 저장됩니다.", { ok: "로그아웃" }))) return;
    if (autoCloud.pending) flushAutoCloud();
    try { await window.cloud.signOut(); showToast("로그아웃했습니다."); }
    catch (e) { showToast("로그아웃 실패", true); }
    return;
  }
  cloudBusy = true;
  try {
    await window.cloud.signIn(); // 팝업은 클릭 직후 동기적으로 열려야 하므로 앞에 await를 두지 않는다
    showToast("🔑 로그인 완료!");
  } catch (e) {
    const code = (e && e.code) || "";
    console.error("[로그인 실패]", code, e); // F12 콘솔에서 상세 원인 확인용
    const messages = {
      "auth/popup-closed-by-user": "로그인 창이 닫혔습니다. 다시 시도해 주세요.",
      "auth/cancelled-popup-request": "로그인을 취소했습니다.",
      "auth/popup-blocked": "팝업이 차단되었습니다. 주소창의 팝업 차단 아이콘에서 허용해 주세요.",
      "auth/unauthorized-domain": `승인되지 않은 주소(${location.hostname})입니다. Firebase 승인된 도메인에 추가하거나 localhost로 접속하세요.`,
      "auth/operation-not-supported-in-this-environment": "이 환경에서는 로그인할 수 없습니다. http://localhost 또는 배포 사이트에서 접속하세요.",
      "auth/operation-not-allowed": "Firebase에서 Google 로그인이 꺼져 있습니다.",
      "auth/network-request-failed": "네트워크 오류로 로그인하지 못했습니다.",
      "auth/web-storage-unsupported": "브라우저 저장소(쿠키)가 차단되어 로그인할 수 없습니다."
    };
    uiAlert(messages[code] || `로그인 실패 (${code || "알 수 없는 오류"})`, "로그인 실패");
  } finally {
    cloudBusy = false;
  }
}

// Firebase SDK 로드에 실패하면 module 스크립트가 실행되지 않는다. load 시점에 확인해 UI를 '사용 불가'로 바꾼다.
window.addEventListener("load", () => { if (!window.cloud) updateAuthUI(); });
