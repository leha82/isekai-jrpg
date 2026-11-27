// ==========================================
// 입력 처리 — 키보드(누르고 있으면 계속 이동) + 가상 패드(터치·마우스 누르고 있기)
// 필드 단축키 (우상단 아이콘 안에 표시): P 파티 · I 가방 · E 장비 · K 스킬 · Q 퀘스트 · M 지도 · F 저장 · N 소리 · O/Esc 설정
// ==========================================
const HOTKEYS = {
  p: () => openMenu("party"), i: () => openMenu("items"), e: () => openMenu("equip"), k: () => openMenu("skills"), m: () => openMenu("map"),
  q: () => openMenu("quests"), f: () => openSaveWindow("save"), n: () => hudMute(), o: () => openMenu("settings"),
  escape: () => openMenu("settings")
};
// 창이 열려 있을 때 같은 단축키를 누르면 닫는다 (메뉴 탭은 해당 탭으로 전환)
const HOTKEY_TAB = { p: "party", i: "items", e: "equip", k: "skills", q: "quests", m: "map", o: "settings" };
const KEY_DIR = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };

function handleActionKey() {
  initAudio();
  if (gameState === "DIALOG") advanceDialog();
  else if (gameState === "WORLD") interact();
}

window.addEventListener("keydown", (e) => {
  if (sysDialogKey(e)) return; // 알림·확인 창이 최우선
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
  initAudio();
  if (gameState === "BATTLE") { battleKey(e); return; }
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (gameState === "MODAL") {
    if (e.key === "Escape") { e.preventDefault(); closeModal(); SFX.cancel(); return; }
    if (Modal.prev !== "WORLD" || e.repeat) return;
    if (modalOpen("menu") && HOTKEY_TAB[key]) {
      e.preventDefault();
      if (menuTab === HOTKEY_TAB[key]) { closeModal(); SFX.cancel(); } else { menuTab = HOTKEY_TAB[key]; SFX.cursor(); renderMenu(); }
    } else if (modalOpen("save") && key === "f") { e.preventDefault(); closeModal(); SFX.cancel(); }
    else if (key === "n") { e.preventDefault(); hudMute(); }
    return;
  }
  if (gameState === "DIALOG") {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) advanceDialog(); }
    return;
  }
  if (gameState !== "WORLD") return;
  const dir = KEY_DIR[e.key];
  if (dir) { e.preventDefault(); pressDir(dir); return; }
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) interact(); return; }
  if (HOTKEYS[key] && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); HOTKEYS[key](); }
});

window.addEventListener("keyup", (e) => {
  const dir = KEY_DIR[e.key];
  if (dir) releaseDir(dir);
});
window.addEventListener("blur", () => releaseAllDirs());

// 가상 패드: 누르고 있는 동안 계속 이동
document.querySelectorAll("[data-dir]").forEach(btn => {
  const dir = btn.dataset.dir;
  const down = (e) => { e.preventDefault(); initAudio(); pressDir(dir); };
  const up = (e) => { e.preventDefault(); releaseDir(dir); };
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointerleave", up);
  btn.addEventListener("pointercancel", up);
});
