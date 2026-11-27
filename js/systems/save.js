// ==========================================
// 세이브 / 불러오기 (localStorage) + 클라우드 세이브 (Google 로그인 + Firestore)
// Firebase SDK는 js/firebase/game-cloud.js (module) 가 window.cloud 로 노출한다.
// SDK를 불러오지 못해도 로컬 세이브만으로 게임은 정상 동작한다.
// ==========================================
const SAVE_KEY = "arcadia_isekai_jrpg_save_v1";
const SAVE_VERSION = 1;
const PLAYER_SAVE_FIELDS = ["x", "y", "lv", "exp", "nextExp", "gold", "weaponLv", "armorLv", "storyFlag"];
const PARTY_SAVE_FIELDS = ["hp", "maxHp", "mp", "maxMp", "atk", "matk", "def", "unlocked"];

function buildSaveData() {
  const p = {};
  PLAYER_SAVE_FIELDS.forEach(k => p[k] = player[k]);
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    player: p,
    inventory: { ...player.inventory },
    party: party.map(m => {
      const o = { id: m.id };
      PARTY_SAVE_FIELDS.forEach(k => o[k] = m[k]);
      return o;
    })
  };
}

// 손상되었거나 버전이 다른 세이브는 null을 반환한다. (로컬·클라우드 공용)
function validateSave(d) {
  if (!d || d.version !== SAVE_VERSION || !d.player || !Array.isArray(d.party)) return null;
  return d;
}

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return validateSave(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

function writeLocalSave(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

// toCloud: 로그인 상태라면 클라우드에도 저장 (수동 저장·스토리 진행 시점만 사용 — Firestore 무료 쓰기 한도 절약)
function saveGame(isAuto = false, toCloud = false) {
  const data = buildSaveData();
  let ok = true;
  try {
    writeLocalSave(data);
    showToast(isAuto ? "💾 자동 저장 완료!" : "💾 저장 완료!");
  } catch (e) {
    ok = false;
    showToast("⚠️ 저장 실패 (브라우저 저장소를 사용할 수 없습니다)", true);
  }
  if (toCloud) cloudSave(data);
  return ok;
}

function applySaveData(d) {
  PLAYER_SAVE_FIELDS.forEach(k => { if (typeof d.player[k] === "number") player[k] = d.player[k]; });
  if (d.inventory) {
    Object.keys(player.inventory).forEach(k => {
      if (typeof d.inventory[k] === "number") player.inventory[k] = d.inventory[k];
    });
  }
  d.party.forEach(s => {
    const m = partyMember(s.id);
    if (!m) return;
    PARTY_SAVE_FIELDS.forEach(k => { if (s[k] !== undefined) m[k] = s[k]; });
  });
  party[0].unlocked = true;
  // 저장 위치가 맵 밖이거나 통행 불가 타일이면 시작 지점으로 보정
  if (isBlockedTile(player.x, player.y)) { player.x = START_POS.x; player.y = START_POS.y; }
}

function manualSave() {
  if (gameState !== "WORLD") { showToast("지금은 저장할 수 없습니다. (필드에서만 가능)", true); return; }
  saveGame(false, true);
}

// 클라우드 세이브를 고르면 로컬에도 복사해 두어 오프라인에서도 이어할 수 있게 한다.
function applyPickedSave(pick) {
  applySaveData(pick.data);
  if (pick.source === "cloud") { try { writeLocalSave(pick.data); } catch (e) {} }
}

async function manualLoad() {
  if (gameState !== "WORLD") { showToast("지금은 불러올 수 없습니다. (필드에서만 가능)", true); return; }
  if (cloudBusy) return;
  cloudBusy = true;
  try { await refreshCloudCache(); } finally { cloudBusy = false; }
  const pick = latestSave();
  if (!pick) { showToast("저장된 데이터가 없습니다.", true); return; }
  if (!confirm(`Lv.${pick.data.player.lv} 저장 데이터를 불러올까요? (${saveSourceLabel(pick.source)})\n현재 진행 상황은 사라집니다.`)) return;
  if (gameState !== "WORLD") return;
  applyPickedSave(pick);
  updateHUD();
  renderWorld();
  SFX.coin();
  showToast(`📂 불러오기 완료! (Lv.${player.lv}, ${saveSourceLabel(pick.source)})`);
}

async function continueGame() {
  if (!SCN) return;
  initAudio(); // await 이후에는 사용자 입력으로 인정되지 않으므로 먼저 오디오를 깨운다
  if (cloudBusy) return;
  cloudBusy = true;
  try { await refreshCloudCache(); } finally { cloudBusy = false; }
  const pick = latestSave();
  if (!pick) { refreshTitleContinue(); showToast("저장 데이터를 읽을 수 없습니다.", true); return; }
  applyPickedSave(pick);
  startGame(true);
}

function refreshTitleContinue() {
  const btn = document.getElementById("ov-continue");
  if (gameState === "ENDING") { btn.style.display = "none"; return; }
  const pick = latestSave();
  if (pick) {
    btn.innerText = `📂 이어하기 (Lv.${pick.data.player.lv} · ${saveSourceLabel(pick.source)})`;
    btn.style.display = "inline-block";
  } else {
    btn.style.display = "none";
  }
}

// ---------- 클라우드 ----------
let cloudUser = null;       // 로그인한 Firebase 사용자
let cloudSaveCache = null;  // 마지막으로 확인한 클라우드 세이브
let cloudBusy = false;

function cloudReady() { return !!(window.cloud && cloudUser); }
function saveSourceLabel(source) { return source === "cloud" ? "☁️ 클라우드" : "💾 이 기기"; }

// 로컬과 클라우드 중 savedAt이 더 최근인 세이브를 고른다.
function latestSave() {
  const local = readSave();
  const remote = cloudReady() ? cloudSaveCache : null;
  if (local && remote) {
    return (Date.parse(remote.savedAt) || 0) > (Date.parse(local.savedAt) || 0)
      ? { data: remote, source: "cloud" } : { data: local, source: "local" };
  }
  if (remote) return { data: remote, source: "cloud" };
  if (local) return { data: local, source: "local" };
  return null;
}

async function refreshCloudCache() {
  if (!cloudReady()) return;
  try {
    cloudSaveCache = validateSave(await window.cloud.load());
  } catch (e) {
    showToast("☁️ 클라우드 연결 실패 — 이 기기의 세이브를 사용합니다.", true);
  }
}

async function cloudSave(data) {
  if (!cloudReady()) return;
  try {
    await window.cloud.save(data);
    cloudSaveCache = data;
    showToast("☁️ 클라우드 저장 완료!");
  } catch (e) {
    showToast("☁️ 클라우드 저장 실패 (이 기기에는 저장됨)", true);
  }
}

// 로그인 직후: 클라우드 세이브를 확인하고, 클라우드가 비어 있으면 이 기기의 세이브를 올린다.
async function syncOnLogin() {
  try {
    const remote = validateSave(await window.cloud.load());
    const local = readSave();
    if (!remote && local) {
      await window.cloud.save(local);
      cloudSaveCache = local;
      showToast("☁️ 이 기기의 세이브를 클라우드에 올렸습니다.");
    } else {
      cloudSaveCache = remote;
      if (remote && gameState !== "TITLE") {
        showToast(`☁️ 클라우드 세이브(Lv.${remote.player.lv})가 있습니다. 📂 불러오기로 가져올 수 있습니다.`);
      }
    }
  } catch (e) {
    showToast("☁️ 클라우드 세이브를 확인하지 못했습니다.", true);
  }
  refreshTitleContinue();
}

// game-cloud.js 의 onAuthStateChanged 에서 호출된다.
function onCloudAuthChanged(user) {
  cloudUser = user;
  cloudSaveCache = null;
  updateAuthUI();
  refreshTitleContinue();
  if (user) syncOnLogin();
}

function updateAuthUI() {
  const btn = document.getElementById("auth-btn");
  const ovBtn = document.getElementById("ov-login-btn");
  const status = document.getElementById("ov-auth-status");
  if (!window.cloud) {
    btn.innerText = "☁️ 사용 불가";
    btn.disabled = true;
    ovBtn.style.display = "none";
    status.innerText = "클라우드 세이브에 연결할 수 없습니다. 이 기기에만 저장됩니다.";
    return;
  }
  if (location.protocol === "file:") {
    // Firebase 로그인은 http(s) 페이지에서만 동작한다.
    btn.innerText = "☁️ 사용 불가";
    btn.disabled = true;
    ovBtn.style.display = "none";
    status.innerText = "파일로 직접 열면 로그인할 수 없습니다. 로컬 서버(VS Code F5 → localhost)나 배포 사이트에서 접속하세요.";
    return;
  }
  btn.disabled = false;
  ovBtn.style.display = "inline-block";
  if (cloudUser) {
    const name = cloudUser.displayName || cloudUser.email || "사용자";
    btn.innerText = "🔓 로그아웃";
    ovBtn.innerText = "🔓 로그아웃";
    status.innerText = `☁️ ${name} 님으로 로그인됨 — 클라우드에도 저장됩니다.`;
  } else {
    btn.innerText = "🔑 로그인";
    ovBtn.innerText = "🔑 Google 로그인";
    status.innerText = "로그인하면 다른 기기에서도 이어할 수 있습니다. (선택 사항)";
  }
}

async function toggleLogin() {
  initAudio();
  if (!window.cloud) { showToast("클라우드 세이브를 사용할 수 없습니다.", true); return; }
  if (cloudBusy) return;
  if (cloudUser) {
    if (!confirm("로그아웃할까요?\n로그아웃하면 이 기기에만 저장됩니다.")) return;
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
    showToast(messages[code] || `로그인 실패 (${code || "알 수 없는 오류"})`, true);
  } finally {
    cloudBusy = false;
  }
}

// Firebase SDK 로드에 실패하면 module 스크립트가 실행되지 않는다. load 시점에 확인해 UI를 '사용 불가'로 바꾼다.
window.addEventListener("load", () => { if (!window.cloud) updateAuthUI(); });
