// ==========================================
// 공통 UI: 토스트, 시스템 알림·확인 창(uiAlert/uiConfirm), 대화창(초상화·타자 효과), 창(모달), 이름 입력
// 화면 크기·레이아웃은 js/core/display.js
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

// ---------- 시스템 알림·확인 창 ----------
// 브라우저 alert/confirm 은 쓰지 않는다. 모든 알림·확인은 이 창으로 띄운다.
// uiDialog(메시지, { title, buttons:[{label, value, primary, danger}], cancelValue }) → Promise<value>
const SysDialog = { open: false, resolve: null, buttons: [], focus: 0, cancelValue: null, prevState: null, queue: [] };

function uiDialog(msg, opts = {}) {
  return new Promise(resolve => {
    const req = { msg, opts, resolve };
    if (SysDialog.open) { SysDialog.queue.push(req); return; }
    showSysDialog(req);
  });
}

function showSysDialog({ msg, opts, resolve }) {
  const buttons = opts.buttons && opts.buttons.length ? opts.buttons : [{ label: "확인", value: true, primary: true }];
  Object.assign(SysDialog, { open: true, resolve, buttons, cancelValue: "cancelValue" in opts ? opts.cancelValue : buttons[buttons.length - 1].value });
  SysDialog.focus = Math.max(0, buttons.findIndex(b => b.primary));
  SysDialog.prevState = gameState;
  gameState = "SYSTEM";
  if (typeof releaseAllDirs === "function") releaseAllDirs();
  $("sys-title").textContent = opts.title || "";
  $("sys-msg").textContent = msg;
  const box = $("sys-btns");
  box.innerHTML = "";
  buttons.forEach((b, i) => {
    const el = document.createElement("button");
    el.className = "sys-btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : "");
    el.textContent = b.label;
    el.onclick = () => closeSysDialog(b.value);
    el.onmouseenter = () => { SysDialog.focus = i; paintSysFocus(); };
    box.appendChild(el);
  });
  paintSysFocus();
  $("sys-dialog").classList.add("show");
}

function paintSysFocus() {
  [...$("sys-btns").children].forEach((el, i) => el.classList.toggle("focus", i === SysDialog.focus));
}

function closeSysDialog(value) {
  if (!SysDialog.open) return;
  const r = SysDialog.resolve;
  SysDialog.open = false;
  SysDialog.resolve = null;
  $("sys-dialog").classList.remove("show");
  if (gameState === "SYSTEM") gameState = SysDialog.prevState;
  if (typeof SFX !== "undefined") (value === SysDialog.cancelValue && SysDialog.buttons.length > 1 ? SFX.cancel : SFX.cursor)();
  r(value);
  const next = SysDialog.queue.shift();
  if (next) showSysDialog(next);
}

// 키보드: ←→/Tab 이동, Enter/Space 선택, Esc 취소. input.js 가 가장 먼저 호출한다.
function sysDialogKey(e) {
  if (!SysDialog.open) return false;
  e.preventDefault();
  const n = SysDialog.buttons.length;
  if (e.key === "ArrowLeft" || e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) { SysDialog.focus = (SysDialog.focus + n - 1) % n; paintSysFocus(); }
  else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "Tab") { SysDialog.focus = (SysDialog.focus + 1) % n; paintSysFocus(); }
  else if ((e.key === "Enter" || e.key === " ") && !e.repeat) closeSysDialog(SysDialog.buttons[SysDialog.focus].value);
  else if (e.key === "Escape") closeSysDialog(SysDialog.cancelValue);
  return true;
}

function uiAlert(msg, title = "알림") {
  return uiDialog(msg, { title, buttons: [{ label: "확인", value: true, primary: true }] });
}

// → Promise<boolean>
function uiConfirm(msg, opts = {}) {
  return uiDialog(msg, {
    title: opts.title || "확인",
    buttons: [{ label: opts.ok || "확인", value: true, primary: !opts.danger, danger: !!opts.danger }, { label: opts.cancel || "취소", value: false }],
    cancelValue: false
  });
}

// ---------- 창(모달) ----------
// openWindow(제목, html, { tabs:[{id,label}], active, onTab, onClose })
// 창을 열기 전 상태(TITLE/WORLD)를 기억했다가 닫을 때 되돌린다. 창 안에서 다시 열면(탭 전환) 그대로 유지.
const Modal = { prev: "WORLD", onClose: null, kind: "" };

function openWindow(title, html, opts = {}) {
  if (gameState !== "MODAL") Modal.prev = gameState;
  gameState = "MODAL";
  Modal.onClose = opts.onClose || null;
  Modal.kind = opts.kind || "";
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

function modalOpen(kind) { return gameState === "MODAL" && (!kind || Modal.kind === kind); }

function closeModal() {
  if ($("modal-ui").style.display === "none") return;
  $("modal-ui").style.display = "none";
  if (gameState === "MODAL") gameState = Modal.prev || "WORLD";
  const cb = Modal.onClose;
  Modal.onClose = null;
  Modal.kind = "";
  if (typeof updateHUD === "function") updateHUD();
  if (cb) cb();
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

// 마우스로 누른 버튼이 포커스를 가지면 Space/Enter 가 두 번 처리된다. 버튼이 포커스를 받지 않게 막는다.
document.addEventListener("mousedown", (e) => {
  if (e.target.closest("button")) e.preventDefault();
});

const wait = (ms) => new Promise(r => setTimeout(r, ms));
