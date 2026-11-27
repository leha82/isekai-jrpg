// ==========================================
// 화면 모드 · 화면 크기 · 가상 패드 (설정 → 화면 모드 / 화면 크기)
//  - mode : "pc-full"(PC 전체화면) | "pc-window"(PC 창 모드) | "mobile-portrait"(모바일 세로) | "mobile-landscape"(모바일 가로)
//           처음 실행하면 기기에 맞춰 고른다 (터치 기기면 화면 방향에 따라 모바일 세로/가로, 아니면 PC 창 모드).
//  - 게임 내부 해상도: 가로 화면 640×480, **세로 모드 480×640** (캔버스 크기 자체가 바뀐다).
//    바깥 크기는 CSS transform 배율로만 바꾼다.
//  - size : "fit"(창에 맞춤) 또는 배율(0.75·1·1.25·1.5·2). 지금 창(전체화면이면 화면)보다 큰 크기를 고르면
//           알림을 띄우고 창에 맞춤으로 바꾼다. 전체화면에서도 크기를 고를 수 있다.
//  - pad  : "show" | "hide" (가상 패드). PC 모드는 게임 화면 아래, 모바일 모드는 게임 화면(필드) 위에 겹쳐 보이고
//           모바일 모드에서는 필드가 아닐 때(전투·대화·메뉴) 자동으로 숨긴다.
// 설정은 localStorage "display_settings" 에 저장된다.
// ==========================================
const BORDER = 8; // 테두리 4px × 2
let GAME_W = 648, GAME_H = 488; // 지금 방향의 게임 화면 크기(테두리 포함)

const DISPLAY_SCALES = [0.75, 1, 1.25, 1.5, 2];
const DISPLAY_MODES = [
  { id: "pc-full", label: "PC (전체화면)" },
  { id: "pc-window", label: "PC (창 모드)" },
  { id: "mobile-portrait", label: "모바일 (세로 모드)" },
  { id: "mobile-landscape", label: "모바일 (가로 모드)" }
];
const DISPLAY_PADS = [{ id: "show", label: "보이기" }, { id: "hide", label: "숨기기" }];

const Display = { settings: { size: "fit", mode: "", pad: "show" }, scale: 1, fit: 1, layout: "pc", portrait: false };

function isTouchDevice() {
  return (window.matchMedia && matchMedia("(pointer: coarse)").matches) || navigator.maxTouchPoints > 1;
}

function autoMode() {
  if (!isTouchDevice()) return "pc-window";
  return window.innerWidth > window.innerHeight ? "mobile-landscape" : "mobile-portrait";
}

function loadDisplaySettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("display_settings") || "{}"); } catch (e) {}
  const s = Display.settings;
  if (saved.size) s.size = String(saved.size);
  if (saved.pad) s.pad = saved.pad === "hide" ? "hide" : "show";
  // 예전 설정(layout: auto/pc/mobile-*)을 화면 모드로 옮긴다
  const old = { pc: "pc-window", "mobile-portrait": "mobile-portrait", "mobile-landscape": "mobile-landscape" };
  s.mode = DISPLAY_MODES.some(m => m.id === saved.mode) ? saved.mode : (old[saved.layout] || autoMode());
  // 전체화면은 클릭으로만 들어갈 수 있으므로 새로 열면 창 모드로 시작한다
  if (s.mode === "pc-full") s.mode = "pc-window";
  if (s.size !== "fit" && !DISPLAY_SCALES.includes(+s.size)) s.size = "fit";
}
function saveDisplaySettings() {
  try { localStorage.setItem("display_settings", JSON.stringify(Display.settings)); } catch (e) {}
}

function isMobileMode() { return Display.settings.mode.startsWith("mobile"); }

// 배율 → "800×600" (세로 모드면 "600×800")
function sizeLabel(scale) {
  const w = Math.round(640 * scale), h = Math.round(480 * scale);
  return Display.portrait ? `${h}×${w}` : `${w}×${h}`;
}
function displaySizes() {
  return [{ id: "fit", label: "창에 맞춤" }].concat(DISPLAY_SCALES.map(s => ({ id: String(s), label: sizeLabel(s) })));
}

// 세로/가로에 따라 내부 해상도(캔버스)를 바꾼다
function applyOrientation(portrait) {
  if (Display.portrait === portrait && GAME_W === (portrait ? 488 : 648)) return false;
  Display.portrait = portrait;
  const w = portrait ? 480 : 640, h = portrait ? 640 : 480;
  GAME_W = w + BORDER; GAME_H = h + BORDER;
  const c = $("game-container");
  c.style.width = `${GAME_W}px`; c.style.height = `${GAME_H}px`;
  const wc = $("world-canvas");
  wc.width = w; wc.height = h;
  const bc = $("battle-canvas");
  bc.width = w; bc.height = portrait ? 360 : 300;
  bc.style.width = `${bc.width}px`; bc.style.height = `${bc.height}px`;
  if (typeof View !== "undefined" && typeof setViewCols === "function" && GameData.game) setViewCols(View.cols);
  if (typeof bvRelayout === "function") bvRelayout();
  return true;
}

function applyDisplay() {
  const mode = Display.settings.mode || autoMode();
  const layout = mode.startsWith("pc") ? "pc" : mode;
  Display.layout = layout;
  const body = document.body;
  body.classList.remove("layout-pc", "layout-mobile-portrait", "layout-mobile-landscape");
  body.classList.add(`layout-${layout}`);
  body.classList.toggle("pad-hidden", Display.settings.pad === "hide");
  body.classList.toggle("is-fullscreen", !!document.fullscreenElement);
  body.classList.toggle("portrait", mode === "mobile-portrait");
  applyOrientation(mode === "mobile-portrait");
  placePad();
  fitGameToScreen();
}

// 가상 패드 위치: PC = 게임 화면 아래 / 모바일 = 게임 화면 안(필드 위에 겹침)
function placePad() {
  const pad = $("virtual-pad"), wrap = $("game-wrapper");
  if (isMobileMode()) { if (pad.parentElement !== wrap) wrap.appendChild(pad); }
  else if (pad.parentElement === wrap) wrap.after(pad);
}

function availableSize() {
  const body = document.body;
  const full = body.classList.contains("is-fullscreen");
  const inFlow = (el) => el && el.parentElement !== $("game-wrapper") && getComputedStyle(el).display !== "none" && getComputedStyle(el).position !== "fixed";
  // 게임 화면 아래에 쌓이는 요소(PC 패드·안내문·광고)의 높이만큼 뺀다
  let below = 0;
  [$("virtual-pad"), document.querySelector(".controls-hint"), $("ad-slot")].forEach(el => { if (inFlow(el)) below += el.offsetHeight + 8; });
  return { w: window.innerWidth - (full ? 0 : 16), h: window.innerHeight - below - (full ? 0 : 16) };
}

function fitGameToScreen() {
  const a = availableSize();
  const full = !!document.fullscreenElement;
  // 창에 맞춤: PC 창 모드에서는 너무 커지지 않게 2배까지 (전체화면은 4배까지)
  const fit = Math.max(0.3, Math.min(a.w / GAME_W, a.h / GAME_H, full ? 4 : 2));
  Display.fit = fit;
  const size = Display.settings.size;
  const s = size === "fit" ? fit : Math.min(+size || 1, fit);
  Display.scale = s;
  $("game-container").style.transform = `scale(${s})`;
  const wrap = $("game-wrapper");
  wrap.style.width = `${GAME_W * s}px`;
  wrap.style.height = `${GAME_H * s}px`;
  // PC 패드·광고 폭을 게임 화면에 맞춘다
  const pad = $("virtual-pad");
  pad.style.maxWidth = isMobileMode() ? "" : `${Math.max(320, Math.round(GAME_W * s))}px`;
}

// 화면 크기 선택. 지금 창보다 크면 알림 후 '창에 맞춤'
function setDisplaySize(id) {
  if (id !== "fit") {
    const sc = +id;
    // 패드·광고를 뺀 지금 쓸 수 있는 공간 기준
    const a = availableSize();
    const maxScale = Math.min(a.w / GAME_W, a.h / GAME_H);
    if (sc > maxScale + 0.001) {
      Display.settings.size = "fit";
      saveDisplaySettings();
      applyDisplay();
      uiAlert(`${sizeLabel(sc)} 은(는) 지금 ${document.fullscreenElement ? "화면" : "창"}보다 커서 표시할 수 없습니다.\n'창에 맞춤'으로 바꿨습니다. (지금 ${sizeLabel(Display.scale)})`, "화면 크기");
      return;
    }
  }
  Display.settings.size = String(id);
  saveDisplaySettings();
  applyDisplay();
}

async function setDisplayMode(mode) {
  if (!DISPLAY_MODES.some(m => m.id === mode)) return;
  Display.settings.mode = mode;
  saveDisplaySettings();
  try {
    if (mode === "pc-full" && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    else if (mode !== "pc-full" && document.fullscreenElement) await document.exitFullscreen();
  } catch (e) {
    showToast("이 브라우저에서는 전체화면을 쓸 수 없습니다.", true);
    Display.settings.mode = "pc-window";
    saveDisplaySettings();
  }
  applyDisplay();
}

function setDisplaySetting(key, value) {
  if (key === "size") return setDisplaySize(value);
  if (key === "mode") return setDisplayMode(value);
  Display.settings[key] = value;
  saveDisplaySettings();
  applyDisplay();
}

// 모바일 모드: 필드(WORLD)에서만 가상 패드를 보인다 (전투·대화·메뉴 중에는 숨김)
let lastPadState = "";
setInterval(() => {
  const st = typeof gameState === "string" ? gameState : "";
  if (st === lastPadState) return;
  lastPadState = st;
  document.body.classList.toggle("st-world", st === "WORLD");
}, 120);

loadDisplaySettings();
window.addEventListener("resize", applyDisplay);
window.addEventListener("orientationchange", () => setTimeout(applyDisplay, 200));
document.addEventListener("fullscreenchange", () => {
  // Esc 등으로 전체화면이 풀리면 창 모드로
  if (!document.fullscreenElement && Display.settings.mode === "pc-full") { Display.settings.mode = "pc-window"; saveDisplaySettings(); }
  if (document.fullscreenElement && Display.settings.mode === "pc-window") { Display.settings.mode = "pc-full"; saveDisplaySettings(); }
  applyDisplay();
  if (typeof rerenderSettingsIfOpen === "function") rerenderSettingsIfOpen();
});
