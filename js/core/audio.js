// ==========================================
// 오디오 엔진 — MP3 배경음(BGM)·효과음(SFX)을 Web Audio 로 재생
//  - BGM 은 loopStart/loopEnd 로 끊김 없이 반복 (data/audio.json 의 loop 길이 + 디코더 지연)
//  - 브라우저 자동재생 정책 때문에 AudioContext 는 첫 클릭/키 입력 때 만든다 (initAudio)
// 볼륨: 전체(master) × 배경음(bgm)/효과음(sfx). 설정 메뉴에서 조절하고, 각 게이지 오른쪽 버튼으로 따로 켜고 끈다.
// 전체 켜고 끄기(muted)는 HUD 아이콘(N)과 같다. 배경음·효과음만 끄기: bgmMuted / sfxMuted
// 시나리오의 "> sfx id" / "> bgm id" 는 data/audio.json 의 id 를 쓴다.
// ==========================================
const AudioSys = {
  ctx: null, bgmGain: null, sfxGain: null,
  buffers: {}, loading: {},
  current: null, currentId: null, wantedId: null,
  settings: { master: 1, bgm: 0.55, sfx: 0.8, muted: false, bgmMuted: false, sfxMuted: false }
};

function loadAudioSettings() {
  try { Object.assign(AudioSys.settings, JSON.parse(localStorage.getItem("audio_settings") || "{}")); } catch (e) {}
}
function saveAudioSettings() {
  try { localStorage.setItem("audio_settings", JSON.stringify(AudioSys.settings)); } catch (e) {}
}
loadAudioSettings();

function initAudio() {
  try {
    if (!AudioSys.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      AudioSys.ctx = new AC();
      AudioSys.bgmGain = AudioSys.ctx.createGain();
      AudioSys.sfxGain = AudioSys.ctx.createGain();
      AudioSys.bgmGain.connect(AudioSys.ctx.destination);
      AudioSys.sfxGain.connect(AudioSys.ctx.destination);
      applyVolumes();
      if (AudioSys.wantedId) { const id = AudioSys.wantedId; AudioSys.wantedId = null; playBGM(id); }
      preloadSfx();
    }
    if (AudioSys.ctx.state === "suspended") { const p = AudioSys.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
  } catch (e) {
    AudioSys.ctx = null; // 오디오를 쓸 수 없는 환경이면 무음으로 진행
  }
}

function applyVolumes() {
  if (!AudioSys.ctx) return;
  const m = AudioSys.settings.muted ? 0 : (AudioSys.settings.master ?? 1);
  AudioSys.bgmGain.gain.value = AudioSys.settings.bgmMuted ? 0 : AudioSys.settings.bgm * m;
  AudioSys.sfxGain.gain.value = AudioSys.settings.sfxMuted ? 0 : AudioSys.settings.sfx * m;
}

function setVolume(kind, value) {
  AudioSys.settings[kind] = value;
  applyVolumes();
  saveAudioSettings();
}

// kind: "master"(전체) | "bgm" | "sfx" → 바뀐 뒤 꺼져 있으면 true
const MUTE_KEY = { master: "muted", bgm: "bgmMuted", sfx: "sfxMuted" };
function toggleMute(kind = "master") {
  const k = MUTE_KEY[kind] || "muted";
  AudioSys.settings[k] = !AudioSys.settings[k];
  applyVolumes();
  saveAudioSettings();
  return AudioSys.settings[k];
}
function isMuted(kind = "master") { return !!AudioSys.settings[MUTE_KEY[kind] || "muted"]; }

async function loadAudioBuffer(path) {
  if (AudioSys.buffers[path]) return AudioSys.buffers[path];
  if (AudioSys.loading[path]) return AudioSys.loading[path];
  AudioSys.loading[path] = (async () => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    const data = await res.arrayBuffer();
    const buf = await new Promise((ok, fail) => AudioSys.ctx.decodeAudioData(data, ok, fail));
    AudioSys.buffers[path] = buf;
    return buf;
  })();
  try { return await AudioSys.loading[path]; } finally { delete AudioSys.loading[path]; }
}

function preloadSfx() {
  if (!AudioSys.ctx || !GameData.audio) return;
  Object.values(GameData.audio.sfx).forEach(s => loadAudioBuffer(s.file).catch(() => {}));
}

async function playBGM(id) {
  if (!GameData.audio || !GameData.audio.bgm[id]) return;
  if (AudioSys.currentId === id) return;
  if (!AudioSys.ctx) { AudioSys.wantedId = id; return; }
  AudioSys.currentId = id;
  const meta = GameData.audio.bgm[id];
  stopBGM(0.4, true);
  try {
    const buf = await loadAudioBuffer(meta.file);
    if (AudioSys.currentId !== id) return; // 로딩 중에 다른 곡으로 바뀜
    const ctx = AudioSys.ctx;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    src.loop = true;
    const delay = (GameData.audio.decoderDelay || 0) / buf.sampleRate;
    src.loopStart = delay;
    src.loopEnd = Math.min(buf.duration, delay + meta.loop);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6);
    src.connect(g); g.connect(AudioSys.bgmGain);
    src.start(0, delay);
    AudioSys.current = { src, gain: g };
  } catch (e) {
    console.warn("[BGM]", id, e);
  }
}

function stopBGM(fade = 0.4, keepId = false) {
  const cur = AudioSys.current;
  if (!keepId) AudioSys.currentId = null;
  AudioSys.current = null;
  if (!cur || !AudioSys.ctx) return;
  const t = AudioSys.ctx.currentTime;
  try {
    cur.gain.gain.cancelScheduledValues(t);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
    cur.gain.gain.linearRampToValueAtTime(0, t + fade);
    cur.src.stop(t + fade + 0.05);
  } catch (e) {}
}

function playSFX(id, volume = 1) {
  if (!AudioSys.ctx || !GameData.audio) return;
  const meta = GameData.audio.sfx[id];
  if (!meta) return;
  const play = (buf) => {
    try {
      const src = AudioSys.ctx.createBufferSource();
      const g = AudioSys.ctx.createGain();
      g.gain.value = volume;
      src.buffer = buf;
      src.connect(g); g.connect(AudioSys.sfxGain);
      src.start(0, (GameData.audio.decoderDelay || 0) / buf.sampleRate);
    } catch (e) {}
  };
  const buf = AudioSys.buffers[meta.file];
  if (buf) play(buf); else loadAudioBuffer(meta.file).then(play).catch(() => {});
}

// 편의: SFX.hit() 처럼 호출
const SFX = new Proxy({}, { get: (_, id) => (vol) => playSFX(String(id), vol) });
