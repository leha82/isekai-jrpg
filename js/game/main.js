// ==========================================
// 게임 시작 & 부팅 (가장 마지막에 로드되는 일반 스크립트)
// ==========================================
function startGame(fromSave = false) {
  if (!SCN) return;
  initAudio();
  document.getElementById("overlay-screen").style.display = "none";
  gameState = "WORLD";
  updateHUD();
  renderWorld();
  setBGM("FIELD");
  if (fromSave) {
    showToast(`📂 이어하기 완료! (Lv.${player.lv})`);
    return;
  }
  runScene("intro");
}

function setTitleButtonsEnabled(enabled) {
  document.getElementById("ov-btn").disabled = !enabled;
  document.getElementById("ov-continue").disabled = !enabled;
}

// 암호화된 시나리오를 받아 복호화한 뒤 타이틀 버튼을 활성화한다.
async function bootScenario() {
  const status = document.getElementById("ov-scenario-status");
  const retry = document.getElementById("ov-retry");
  setTitleButtonsEnabled(false);
  retry.style.display = "none";
  status.className = "";
  status.innerText = "📜 시나리오를 불러오는 중...";
  try {
    await loadScenario();
    const desc = scnText("title_desc", "");
    if (desc) document.getElementById("ov-desc").innerText = desc;
    status.innerText = "";
    setTitleButtonsEnabled(true);
  } catch (e) {
    console.error("[시나리오 로드 실패]", e);
    status.className = "error";
    status.innerText = `⚠️ ${e.message}`;
    retry.style.display = "inline-block";
  }
}

fitGameToScreen();
refreshTitleContinue();
bootScenario();
