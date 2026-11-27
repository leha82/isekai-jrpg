// ==========================================
// 화면 크기 · 레이아웃 · 전체 화면 (설정 → 화면)
//  - 게임 내부 해상도는 640x480(+테두리) 그대로 두고, 바깥 크기만 CSS transform 으로 바꾼다.
//  - size  : "fit"(창에 맞춤) 또는 배율(0.75·1·1.25·1.5·2). 창보다 크면 창에 맞게 줄인다.
//  - layout: "auto" | "pc" | "mobile-portrait" | "mobile-landscape"
//  - pad   : "auto" | "show" | "hide" (가상 패드)
// 설정은 localStorage "display_settings" 에 저장된다.
// ==========================================
const GAME_W = 648, GAME_H = 488; // 캔버스 640x480 + 테두리 4px*2

const DISPLAY_SIZES = [
  { id: "fit", label: "창에 맞춤" },
  { id: "0.75", label: "작게 (480×360)" },
  { id: "1", label: "기본 (640×480)" },
  { id: "1.25", label: "크게 (800×600)" },
  { id: "1.5", label: "더 크게 (960×720)" },
  { id: "2", label: "최대 (1280×960)" }
];
const DISPLAY_LAYOUTS = [
  { id: "auto", label: "자동" },
  { id: "pc", label: "PC" },
  { id: "mobile-portrait", label: "모바일 세로" },
  { id: "mobile-landscape", label: "모바일 가로" }
];
const DISPLAY_PADS = [
  { id: "auto", label: "자동" }, { id: "show", label: "보이기" }, { id: "hide", label: "숨기기" }
];

const Display = { settings: { size: "fit", layout: "auto", pad: "auto" }, scale: 1, layout: "pc" };

function isTouchDevice() {
  return (window.matchMedia && matchMedia("(pointer: coarse)").matches) || navigator.maxTouchPoints > 1;
}

function loadDisplaySettings() {
  try { Object.assign(Display.settings, JSON.parse(localStorage.getItem("display_settings") || "{}")); } catch (e) {}
}
function saveDisplaySettings() {
  try { localStorage.setItem("display_settings", JSON.stringify(Display.settings)); } catch (e) {}
}

function resolvedLayout() {
  const l = Display.settings.layout;
  if (l !== "auto") return l;
  if (!isTouchDevice()) return "pc";
  return window.innerWidth > window.innerHeight ? "mobile-landscape" : "mobile-portrait";
}

function padVisible(layout) {
  const p = Display.settings.pad;
  if (p === "show") return true;
  if (p === "hide") return false;
  return true; // 자동: 마우스 사용자도 패드를 쓸 수 있게 기본은 보인다
}

function applyDisplay() {
  const layout = resolvedLayout();
  Display.layout = layout;
  const body = document.body;
  body.classList.remove("layout-pc", "layout-mobile-portrait", "layout-mobile-landscape");
  body.classList.add(`layout-${layout}`);
  body.classList.toggle("pad-hidden", !padVisible(layout));
  body.classList.toggle("is-fullscreen", !!document.fullscreenElement);
  fitGameToScreen();
}

function fitGameToScreen() {
  const body = document.body;
  const inFlow = (el) => el && getComputedStyle(el).display !== "none" && getComputedStyle(el).position !== "fixed";
  // 게임 화면 아래에 쌓이는 요소(패드·안내문·광고)의 높이만큼 뺀다
  let below = 0;
  ["virtual-pad", "controls-hint-el", "ad-slot"].forEach(id => {
    const el = id === "controls-hint-el" ? document.querySelector(".controls-hint") : $(id);
    if (inFlow(el)) below += el.offsetHeight + 8;
  });
  const padX = body.classList.contains("is-fullscreen") ? 0 : 16;
  const availW = window.innerWidth - padX;
  const availH = window.innerHeight - below - (body.classList.contains("is-fullscreen") ? 0 : 16);
  const fit = Math.max(0.3, Math.min(availW / GAME_W, availH / GAME_H));
  const size = Display.settings.size;
  let s = size === "fit" || document.fullscreenElement ? fit : Math.min(+size || 1, fit);
  // 창에 맞춤은 PC에서 너무 커지지 않게 2배까지만
  s = Math.min(s, 2);
  Display.scale = s;
  $("game-container").style.transform = `scale(${s})`;
  const wrap = $("game-wrapper");
  wrap.style.width = `${GAME_W * s}px`;
  wrap.style.height = `${GAME_H * s}px`;
  // 패드·광고 폭을 게임 화면에 맞춘다 (모바일 세로는 화면 전체 폭)
  const w = Math.max(320, Math.round(GAME_W * s));
  $("virtual-pad").style.maxWidth = Display.layout === "mobile-landscape" ? "" : `${Math.max(w, Display.layout === "mobile-portrait" ? availW : 0)}px`;
}

function setDisplaySetting(key, value) {
  Display.settings[key] = value;
  saveDisplaySettings();
  applyDisplay();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch (e) {
    showToast("이 브라우저에서는 전체 화면을 쓸 수 없습니다.", true);
  }
}

loadDisplaySettings();
window.addEventListener("resize", applyDisplay);
window.addEventListener("orientationchange", () => setTimeout(applyDisplay, 200));
document.addEventListener("fullscreenchange", () => {
  applyDisplay();
  if (typeof rerenderSettingsIfOpen === "function") rerenderSettingsIfOpen();
});
