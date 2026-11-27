// ==========================================
// 입력 처리 — 키보드(누르고 있으면 계속 이동) + 가상 패드(터치·마우스 누르고 있기)
// ==========================================
const KEY_DIR = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };

function handleActionKey() {
  initAudio();
  if (gameState === "DIALOG") advanceDialog();
  else if (gameState === "WORLD") interact();
}

window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  initAudio();
  if (gameState === "BATTLE") { battleKey(e); return; }
  if (gameState === "MODAL") {
    if (e.key === "Escape") { e.preventDefault(); closeModal(); SFX.cancel(); }
    return;
  }
  if (gameState === "DIALOG") {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) advanceDialog(); }
    return;
  }
  if (gameState !== "WORLD") return;
  const dir = KEY_DIR[e.key];
  if (dir) { e.preventDefault(); pressDir(dir); return; }
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) interact(); }
  else if (e.key === "i" || e.key === "I") { e.preventDefault(); openMenu("items"); }
  else if (e.key === "q" || e.key === "Q") { e.preventDefault(); openMenu("quests"); }
  else if (e.key === "Escape" || e.key === "m" || e.key === "M") { e.preventDefault(); openMenu("party"); }
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
