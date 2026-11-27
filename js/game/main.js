// ==========================================
// 부팅 · 타이틀 · 새 게임 (가장 마지막에 로드되는 일반 스크립트)
// ==========================================

// 새 게임: 주인공 이름 입력 → 시작 맵 → 인트로 장면
async function newGame() {
  if (!SCN) return;
  initAudio();
  SFX.confirm();
  const name = await askHeroName();
  newGameState(name);
  startGame(false);
}

// fromSave: 이어하기/불러오기로 시작 (player 는 이미 채워져 있음)
function startGame(fromSave = false) {
  if (!SCN || !player) return;
  initAudio();
  $("overlay-screen").style.display = "none";
  $("hud-left").style.display = "block";
  $("hud-right").style.display = "flex";
  gameState = "WORLD";
  AudioSys.currentId = null;
  World.fade = 1;
  enterMap(player.map, player.x, player.y, player.dir);
  fadeTo(0, 500);
  if (fromSave) { showToast(`📂 이어하기 완료! (${player.name} · Lv.${player.lv})`); return; }
  runScene("intro");
}

function setTitleButtonsEnabled(enabled) {
  $("ov-btn").disabled = !enabled;
  $("ov-continue").disabled = !enabled;
}

function applyTitleText() {
  const g = GameData.game;
  document.title = `${g.title} — ${g.subtitle}`;
  $("ov-title").textContent = g.title;
  $("ov-subtitle").textContent = g.subtitle;
}

async function boot() {
  fitGameToScreen();
  const status = $("ov-scenario-status");
  const retry = $("ov-retry");
  setTitleButtonsEnabled(false);
  retry.style.display = "none";
  status.className = "";
  try {
    if (!GameData.game) {
      if (location.protocol === "file:") throw new Error("파일로 직접 열면 실행할 수 없습니다. VS Code F5(localhost) 또는 배포 사이트에서 실행하세요.");
      await loadGameData((done, total) => { status.textContent = `🎨 리소스를 불러오는 중… ${Math.round(done / total * 100)}%`; });
      applyTitleText();
      loadViewSetting();
      requestAnimationFrame(renderLoop);
      playBGM("title");
    }
    status.textContent = "📜 시나리오를 불러오는 중…";
    await loadScenario();
    const desc = scnText("title_desc", "");
    if (desc) $("ov-desc").textContent = desc;
    status.textContent = "";
    gameState = "TITLE";
    setTitleButtonsEnabled(true);
    refreshTitleContinue();
  } catch (e) {
    console.error("[부팅 실패]", e);
    status.className = "error";
    status.textContent = `⚠️ ${e.message}`;
    retry.style.display = "inline-block";
  }
}

// 타이틀에서 아무 곳이나 클릭하면 오디오 시작 (자동재생 정책)
$("overlay-screen").addEventListener("pointerdown", () => initAudio());

boot();
