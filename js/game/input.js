// ==========================================
// 입력 처리 (키보드 + 터치/마우스 패드)
// ==========================================
function movePlayer(dx, dy) {
  initAudio();
  if (gameState !== "WORLD") return;
  const nx = player.x + dx;
  const ny = player.y + dy;
  if (isBlockedTile(nx, ny)) return;

  player.x = nx;
  player.y = ny;
  SFX.step();
  renderWorld();

  if (!checkTileEvent()) {
    triggerRandomEncounter(WORLD_MAP[ny][nx]);
  }
}

function handleActionKey() {
  initAudio();
  if (gameState === "DIALOG") advanceDialog();
  else if (gameState === "WORLD") checkTileEvent();
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && gameState === "MODAL") { closeModal(); return; }
  if (gameState === "DIALOG") {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); advanceDialog(); }
    return;
  }
  if (gameState !== "WORLD") return;

  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { e.preventDefault(); movePlayer(0, -1); }
  else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { e.preventDefault(); movePlayer(0, 1); }
  else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); movePlayer(-1, 0); }
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); movePlayer(1, 0); }
  else if (e.key === " " || e.key === "Enter") { e.preventDefault(); checkTileEvent(); }
  else if (e.key === "i" || e.key === "I") { e.preventDefault(); openInventory(); }
});
