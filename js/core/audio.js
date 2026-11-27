// ==========================================
// 8비트 Web Audio 사운드 엔진
// 시나리오 스크립트의 "> sfx <이름>" 은 SFX 키, "> bgm field|battle" 은 setBGM 을 호출한다.
// ==========================================
let audioCtx = null;
let isMuted = false;
let bgmTimer = null;
let bgmStep = 0;
let currentBgmMode = "NONE";

// 브라우저 자동재생 정책: AudioContext는 사용자 첫 클릭/키 입력 시점에만 생성·resume 한다.
function initAudio() {
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      const p = audioCtx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) {
    audioCtx = null; // 오디오를 쓸 수 없는 환경이면 무음으로 진행
  }
}

function playTone(freq, duration, type = "square", vol = 0.05) {
  if (isMuted || !audioCtx || audioCtx.state !== "running") return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

const SFX = {
  step: () => playTone(140, 0.04, "triangle", 0.02),
  hit: () => { playTone(180, 0.08, "sawtooth", 0.07); setTimeout(() => playTone(110, 0.12, "square", 0.07), 50); },
  magic: () => { playTone(520, 0.1, "sine", 0.06); setTimeout(() => playTone(780, 0.16, "triangle", 0.06), 70); },
  heal: () => { playTone(440, 0.1, "sine", 0.06); setTimeout(() => playTone(660, 0.18, "sine", 0.06), 90); },
  coin: () => { playTone(987, 0.07, "square", 0.05); setTimeout(() => playTone(1318, 0.16, "square", 0.05), 70); },
  levelup: () => [523, 659, 783, 1046].forEach((f, i) => setTimeout(() => playTone(f, 0.14, "square", 0.06), i * 90))
};

const FIELD_MELODY = [261.6, 329.6, 392.0, 329.6, 293.7, 349.2, 440.0, 349.2, 261.6, 329.6, 392.0, 523.3, 493.9, 392.0, 329.6, 293.7];
const BATTLE_MELODY = [164.8, 164.8, 196.0, 220.0, 164.8, 164.8, 246.9, 220.0, 196.0, 196.0, 220.0, 261.6, 246.9, 220.0, 196.0, 146.8];

function setBGM(mode) {
  if (currentBgmMode === mode) return;
  currentBgmMode = mode;
  if (bgmTimer) clearInterval(bgmTimer);
  bgmStep = 0;
  if (mode === "NONE") return;
  const speed = mode === "BATTLE" ? 170 : 310;
  bgmTimer = setInterval(() => {
    if (isMuted || !audioCtx || gameState === "TITLE" || gameState === "ENDING") return;
    const notes = mode === "BATTLE" ? BATTLE_MELODY : FIELD_MELODY;
    playTone(notes[bgmStep % notes.length], mode === "BATTLE" ? 0.13 : 0.24, mode === "BATTLE" ? "sawtooth" : "triangle", 0.025);
    bgmStep++;
  }, speed);
}

function toggleAudio() {
  initAudio();
  isMuted = !isMuted;
  document.getElementById("bgm-btn").innerText = isMuted ? "🔇 소리 OFF" : "🔊 소리 ON";
}
