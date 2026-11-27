// ==========================================
// 공통 UI: 토스트 알림, 대화창, 화면 스케일링
// ==========================================
let toastTimer = null;
function showToast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.classList.toggle("error", isError);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), isError ? 4000 : 1800); // 오류는 읽을 시간을 더 준다
}

// ---------- 대화창 ----------
let dialogQueue = [];
let onDialogEnd = null;

// lines: [{ speaker, text }], callback: 마지막 줄을 넘긴 뒤 호출
function startDialog(lines, callback = null) {
  gameState = "DIALOG";
  dialogQueue = [...lines];
  onDialogEnd = callback;
  document.getElementById("dialog-box").style.display = "flex";
  advanceDialog();
}

function advanceDialog() {
  if (gameState !== "DIALOG") return;
  if (dialogQueue.length === 0) {
    document.getElementById("dialog-box").style.display = "none";
    gameState = "WORLD";
    if (onDialogEnd) { const cb = onDialogEnd; onDialogEnd = null; cb(); }
    return;
  }
  const current = dialogQueue.shift();
  document.getElementById("dialog-speaker").innerText = current.speaker;
  document.getElementById("dialog-text").innerText = current.text;
}

// ---------- 반응형 스케일링 (내부 해상도 640x480 유지) ----------
const GAME_W = 648, GAME_H = 488; // 캔버스 640x480 + 테두리 4px*2
function fitGameToScreen() {
  const padArea = 190; // 하단 가상 패드 + 안내문 높이
  const s = Math.max(0.35, Math.min(1, (window.innerWidth - 16) / GAME_W, (window.innerHeight - padArea) / GAME_H));
  document.getElementById("game-container").style.transform = `scale(${s})`;
  const wrap = document.getElementById("game-wrapper");
  wrap.style.width = `${GAME_W * s}px`;
  wrap.style.height = `${GAME_H * s}px`;
}
window.addEventListener("resize", fitGameToScreen);

// 마우스/터치로 누른 버튼이 포커스를 가지면, 이후 Space/Enter 입력 시 버튼 클릭과 keydown 처리가
// 동시에 일어나 대화가 두 줄씩 넘어가는 문제가 생긴다. 버튼이 포커스를 받지 않도록 막는다.
document.addEventListener("mousedown", (e) => {
  if (e.target.closest("button")) e.preventDefault();
});
