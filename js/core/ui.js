// ==========================================
// 공통 UI: 토스트, 대화창(초상화·타자 효과), 창(모달), 이름 입력, 화면 스케일링
// ==========================================
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let toastTimer = null;
function showToast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), isError ? 4000 : 1900);
}

// ---------- 대화창 ----------
const Dialog = { queue: [], onEnd: null, typing: null, full: "" };

function speakerPortrait(speaker) {
  const list = (GameData.characters && GameData.characters.speakerPortraits) || [];
  const hit = list.find(p => speaker.includes(p.match));
  return hit ? portraitUrl(hit.portrait) : null;
}

// lines: [{ speaker, text }], callback: 마지막 줄을 넘긴 뒤 호출
function startDialog(lines, callback = null) {
  gameState = "DIALOG";
  Dialog.queue = [...lines];
  Dialog.onEnd = callback;
  $("dialog-box").style.display = "flex";
  advanceDialog();
}

function advanceDialog() {
  if (gameState !== "DIALOG") return;
  if (Dialog.typing) { finishTyping(); return; } // 타자 중이면 한 번에 표시
  if (Dialog.queue.length === 0) {
    $("dialog-box").style.display = "none";
    gameState = "WORLD";
    if (Dialog.onEnd) { const cb = Dialog.onEnd; Dialog.onEnd = null; cb(); }
    return;
  }
  const cur = Dialog.queue.shift();
  const speaker = fmt(cur.speaker);
  const pic = speakerPortrait(cur.speaker);
  $("dialog-speaker").textContent = speaker;
  $("dialog-portrait").style.display = pic ? "block" : "none";
  if (pic) $("dialog-portrait").src = pic;
  typeText(fmt(cur.text));
}

function typeText(text) {
  Dialog.full = text;
  const el = $("dialog-text");
  el.textContent = "";
  let i = 0;
  clearInterval(Dialog.typing);
  Dialog.typing = setInterval(() => {
    i += 2;
    el.textContent = text.slice(0, i);
    if (i >= text.length) finishTyping();
  }, 22);
}

function finishTyping() {
  clearInterval(Dialog.typing);
  Dialog.typing = null;
  $("dialog-text").textContent = Dialog.full;
}

// ---------- 창(모달) ----------
// openWindow(제목, html, { tabs:[{id,label}], active, onTab, wide })
function openWindow(title, html, opts = {}) {
  gameState = "MODAL";
  $("modal-title").textContent = title;
  const tabs = $("modal-tabs");
  tabs.innerHTML = "";
  (opts.tabs || []).forEach(t => {
    const b = document.createElement("button");
    b.className = "tab-btn" + (t.id === opts.active ? " active" : "");
    b.textContent = t.label;
    b.onclick = () => { SFX.cursor(); opts.onTab(t.id); };
    tabs.appendChild(b);
  });
  tabs.style.display = opts.tabs ? "flex" : "none";
  $("modal-list").innerHTML = html;
  $("modal-ui").style.display = "flex";
}

function closeModal() {
  $("modal-ui").style.display = "none";
  if (gameState === "MODAL") gameState = "WORLD";
  if (typeof updateHUD === "function") updateHUD();
}

// ---------- 이름 입력 ----------
function askHeroName() {
  return new Promise(resolve => {
    const g = GameData.game;
    $("name-ui").style.display = "flex";
    const input = $("name-input");
    input.value = g.defaultHeroName;
    input.maxLength = g.heroNameMaxLength || 8;
    setTimeout(() => { input.focus(); input.select(); }, 50);
    const done = () => {
      const v = input.value.trim().replace(/[{}<>]/g, "");
      if (!v) { input.focus(); SFX.error(); return; }
      $("name-ui").style.display = "none";
      $("name-ok").onclick = null;
      input.onkeydown = null;
      SFX.confirm();
      resolve(v);
    };
    $("name-ok").onclick = done;
    input.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") done(); };
  });
}

// ---------- 반응형 스케일링 (내부 해상도 640x480 유지) ----------
const GAME_W = 648, GAME_H = 488; // 캔버스 640x480 + 테두리 4px*2
function fitGameToScreen() {
  const padArea = 190; // 하단 가상 패드 + 안내문 높이
  const s = Math.max(0.35, Math.min(1, (window.innerWidth - 16) / GAME_W, (window.innerHeight - padArea) / GAME_H));
  $("game-container").style.transform = `scale(${s})`;
  const wrap = $("game-wrapper");
  wrap.style.width = `${GAME_W * s}px`;
  wrap.style.height = `${GAME_H * s}px`;
}
window.addEventListener("resize", fitGameToScreen);

// 마우스로 누른 버튼이 포커스를 가지면 Space/Enter 가 두 번 처리된다. 버튼이 포커스를 받지 않게 막는다.
document.addEventListener("mousedown", (e) => {
  if (e.target.closest("button")) e.preventDefault();
});

const wait = (ms) => new Promise(r => setTimeout(r, ms));
