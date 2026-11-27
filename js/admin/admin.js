// ==========================================
// 관리자 페이지 진입점 (admin.html, ES module)
//
// 접근 제어: Google 로그인 → Firestore admin/github 읽기 시도(서버 규칙 검사: 최고 관리자 또는 config/admins 목록)
//            보안 규칙이 관리자가 아니면 거부하므로 화면 조작으로는 우회할 수 없다.
// 탭: 시나리오 · 이벤트 · 맵 디자인 · 캐릭터·몬스터 · 전투 설정 · 리소스 · 관리자 지정
// ==========================================
import { $, S, backend, setStatus, setBusy, loadAllData, createGithubApi, bus } from "./core.js";
import { initScenarioTab, loadScenarioFromRepo, isScenarioDirty, SC, importTexts, validateAll, saveScenario } from "./tab-scenario.js";
import { initEventsTab, showEventsTab } from "./tab-events.js";
import { initMapsTab, showMapsTab, isMapsDirty, drawMap } from "./tab-maps.js";
import { initActorsTab, showActorsTab, isActorsDirty } from "./tab-actors.js";
import { initBattleTab, showBattleTab, isBattleDirty } from "./tab-battle.js";
import { initResourcesTab, showResourcesTab, hideResourcesTab } from "./tab-resources.js";
import { initAdminsTab, showAdminsTab } from "./tab-admins.js";

const TABS = [
  { id: "scenario", label: "📜 시나리오", show: () => {} },
  { id: "events", label: "📍 이벤트", show: showEventsTab },
  { id: "maps", label: "🗺️ 맵 디자인", show: showMapsTab },
  { id: "actors", label: "🧙 캐릭터·몬스터", show: showActorsTab },
  { id: "battle", label: "⚔️ 전투 설정", show: showBattleTab },
  { id: "resources", label: "🎵 리소스", show: showResourcesTab },
  { id: "admins", label: "👑 관리자 지정", show: showAdminsTab }
];
let currentTab = "scenario";

function openTab(id) {
  if (currentTab === "resources" && id !== "resources") hideResourcesTab();
  currentTab = id;
  TABS.forEach(t => { $(`tab-${t.id}`).hidden = t.id !== id; });
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === id));
  const t = TABS.find(x => x.id === id);
  if (t && GameData.game) t.show();
}
bus.openTab = openTab;

function anyDirty() {
  return isScenarioDirty() || (GameData.game && (isMapsDirty() || isActorsDirty() || isBattleDirty()));
}

function showGate(icon, msg, showLogin) {
  $("gate").hidden = false;
  $("app").hidden = true;
  $("gate-icon").textContent = icon;
  $("gate-msg").textContent = msg;
  $("btn-login").hidden = !showLogin;
}

// ---------- GitHub 토큰 ----------
function showTokenPanel(cancelable) {
  $("token-panel").hidden = false;
  $("btn-token-cancel").hidden = !cancelable;
  $("token-input").focus();
}

async function saveToken() {
  const token = $("token-input").value.trim();
  if (!token) return;
  setBusy(true);
  setStatus("토큰 확인 중...");
  const hadToken = backend.github.hasToken();
  try {
    const probe = backend.github.probe ? backend.github.probe(token) : (() => { const a = createGithubApi(); a.setToken(token); return a; })();
    await probe.checkAccess();
    await backend.writeToken(token);
    backend.github.setToken(token);
    $("token-input").value = "";
    $("token-panel").hidden = true;
    setStatus("GitHub 토큰을 저장했습니다.", "ok");
    if (!hadToken) { setBusy(false); await loadEverything(); }
  } catch (e) {
    setStatus(`토큰 확인 실패: ${e.message}`, "error");
  } finally {
    setBusy(false);
  }
}

// ---------- 데이터 + 시나리오 로드 ----------
async function loadEverything() {
  setBusy(true);
  setStatus("게임 데이터를 불러오는 중...");
  try {
    await loadAllData();
    $("data-source").textContent = S.dataSource === "repo" ? "GitHub 최신본" : "배포 사이트 (토큰 설정 전, 읽기 전용)";
  } catch (e) {
    setStatus(`게임 데이터를 불러오지 못했습니다: ${e.message}`, "error");
    setBusy(false);
    return;
  }
  setBusy(false);
  if (backend.github.hasToken()) await loadScenarioFromRepo(true);
  else validateAll();
  openTab(currentTab);
}

async function enterApp(token) {
  $("gate").hidden = true;
  $("app").hidden = false;
  $("role-label").textContent = S.isMaster ? "최고 관리자" : "관리자";
  if (token) backend.github.setToken(token);
  else { showTokenPanel(false); setStatus("처음 사용하려면 GitHub 토큰을 설정하세요. (데이터는 배포 사이트 기준으로 표시)", "error"); }
  await loadEverything();
}

// ---------- 로그인 ----------
backend.onAuth(async (user) => {
  S.user = user;
  $("user-label").textContent = user ? (user.email || "") : "";
  $("btn-logout").hidden = !user;
  if (!user) { showGate("🔒", "관리자 계정으로 로그인하세요.\n최고 관리자 또는 지정된 관리자만 사용할 수 있습니다.", true); return; }
  S.isMaster = (user.email || "").toLowerCase() === MASTER_EMAIL.toLowerCase();
  showGate("⏳", "서버에서 관리자 권한을 확인하는 중...", false);
  let token;
  try {
    token = await backend.readToken();
  } catch (e) {
    console.error(e);
    const denied = (e.code || "").includes("permission");
    showGate("⛔", denied
      ? `${user.email} 계정에는 관리자 권한이 없습니다.\n최고 관리자에게 '관리자 지정'을 요청하거나 다른 계정으로 로그인하세요.`
      : `서버에서 관리자 권한을 확인하지 못했습니다. (${e.code || e.message})\nFirebase 콘솔 → Firestore → 규칙에 최신 firestore.rules 가 게시되었는지 확인하세요.`, false);
    return;
  }
  await enterApp(token);
});

$("btn-login").onclick = async () => {
  try { await backend.signIn(); }
  catch (e) {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      showGate("⚠️", `로그인 실패: ${e.code || e.message}\n${location.protocol === "file:" ? "파일로 직접 열면 로그인할 수 없습니다. 배포 사이트나 localhost 에서 여세요." : ""}`, true);
    }
  }
};
$("btn-logout").onclick = async () => {
  if (anyDirty() && !confirm("저장하지 않은 변경 사항이 있습니다. 로그아웃할까요?")) return;
  await backend.signOut();
};

// ---------- 초기화 ----------
$("tabs").innerHTML = TABS.map(t => `<button data-tab="${t.id}">${t.label}</button>`).join("");
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => openTab(b.dataset.tab));
$("btn-token-save").onclick = saveToken;
$("btn-token-change").onclick = () => showTokenPanel(true);
$("btn-token-cancel").onclick = () => { $("token-panel").hidden = true; };
initScenarioTab(); initEventsTab(); initMapsTab(); initActorsTab(); initBattleTab(); initResourcesTab(); initAdminsTab();
bus.scenarioChanged.push(() => { if (currentTab === "maps") drawMap(); });
window.addEventListener("beforeunload", (e) => { if (anyDirty()) { e.preventDefault(); e.returnValue = ""; } });

window.adminApp = { S, SC, openTab, importTexts, validateAll, saveScenario, loadScenarioFromRepo, isDirty: anyDirty };
