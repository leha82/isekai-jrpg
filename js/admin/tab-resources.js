// ==========================================
// 탭: 리소스 — 이미지(타일·캐릭터·몬스터·전투 배경·초상화·아이콘), 배경음, 효과음 목록과 미리보기·재생
// 목록은 data/assets.json (tools/gen_manifest.py 가 생성)
// ==========================================
import { $, esc } from "./core.js";

const R = { sub: "images", manifest: null, audio: null, playing: null };

const kb = (n) => n >= 1024 * 1024 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;

async function loadManifest() {
  if (R.manifest) return R.manifest;
  const res = await fetch(`${DATA_DIR}/assets.json?t=${Date.now()}`, { cache: "no-store" });
  R.manifest = res.ok ? await res.json() : { files: [] };
  return R.manifest;
}

function stop() {
  if (R.audio) { R.audio.pause(); R.audio = null; }
  R.playing = null;
  document.querySelectorAll("[data-play]").forEach(b => { b.textContent = "▶"; b.classList.remove("on"); });
}

function play(file, btn) {
  const same = R.playing === file;
  stop();
  if (same) return;
  R.audio = new Audio(file);
  R.audio.loop = file.includes("/bgm/");
  R.audio.play().catch(e => alert(`재생 실패: ${e.message}`));
  R.playing = file;
  btn.textContent = "■"; btn.classList.add("on");
  R.audio.onended = () => stop();
}

async function render() {
  document.querySelectorAll("#tab-resources [data-sub]").forEach(b => b.classList.toggle("on", b.dataset.sub === R.sub));
  const man = await loadManifest();
  const size = (p) => { const f = man.files.find(x => x.path === p); return f ? kb(f.size) : "-"; };
  const body = $("res-body");
  if (R.sub === "images") {
    const imgs = man.files.filter(f => /\.(png|svg)$/.test(f.path));
    body.innerHTML = `<p class="muted small">이미지 ${imgs.length}개 · 클릭하면 크게 봅니다. 도트 그림은 tools/gen_assets.py, 초상화·아이콘은 tools/gen_svg.py 로 다시 생성할 수 있습니다.</p>
      <div class="res-grid">${imgs.map(f => `<div class="res-card" data-img="${esc(f.path)}"><div class="res-thumb"><img src="${esc(f.path)}" loading="lazy"></div><b>${esc(f.path.split("/").pop())}</b><small>${esc(f.path)} · ${kb(f.size)}</small></div>`).join("")}</div>`;
    body.querySelectorAll("[data-img]").forEach(el => el.onclick = () => showImage(el.dataset.img));
  } else if (R.sub === "tiles") {
    const tiles = GameData.tiles.tiles;
    body.innerHTML = `<p class="muted small">타일 ${tiles.length}종 — 스크립트의 <code>* tile 타일id</code>, 맵 디자인 팔레트에서 씁니다.</p>
      <div class="tile-grid">${tiles.map((t, i) => `<div class="tile-card${t.hidden ? " muted" : ""}"><canvas data-t="${i}" width="32" height="32"></canvas><b>${esc(t.label || t.id)}</b><small>${esc(t.id)} · ${t.layer === "ground" ? "지형" : "오브젝트"}${t.walk ? "" : " · 막힘"}${t.enc ? " · 인카운트" : ""}</small></div>`).join("")}</div>`;
    body.querySelectorAll("[data-t]").forEach(cv => {
      const s = tileSrc(+cv.dataset.t), c = cv.getContext("2d");
      c.imageSmoothingEnabled = false;
      c.drawImage(Images.tiles, s.sx, s.sy, s.size, s.size, 0, 0, 32, 32);
    });
  } else {
    const kind = R.sub; // bgm | sfx
    const list = Object.entries(GameData.audio[kind]);
    const usage = (id) => kind === "bgm" ? Object.values(GameData.maps).filter(m => m.bgm === id).map(m => m.name).join(", ") : "";
    body.innerHTML = `<p class="muted small">${kind === "bgm" ? "배경음" : "효과음"} ${list.length}개 (MP3) — 스크립트의 <code>&gt; ${kind} ID</code> 로 씁니다. 음원은 tools/gen_audio.py 로 다시 생성할 수 있습니다.</p>
      <table class="mini-table wide-table"><tr><th></th><th>ID</th><th>제목</th><th>파일</th><th>크기</th>${kind === "bgm" ? "<th>루프</th><th>BPM</th><th>사용 맵</th>" : ""}</tr>
      ${list.map(([id, a]) => `<tr><td><button class="btn small" data-play="${esc(a.file)}">▶</button></td><td>${esc(id)}</td><td>${esc(a.title)}</td><td class="small">${esc(a.file)}</td><td>${size(a.file)}</td>
        ${kind === "bgm" ? `<td>${a.loop.toFixed(1)}초</td><td>${a.bpm}</td><td class="small">${esc(usage(id))}</td>` : ""}</tr>`).join("")}</table>`;
    body.querySelectorAll("[data-play]").forEach(b => b.onclick = () => play(b.dataset.play, b));
  }
}

function showImage(path) {
  const ov = $("img-viewer");
  ov.innerHTML = `<div class="img-viewer-box"><div class="row"><b>${esc(path)}</b><span><button class="btn small" data-z="1">1x</button><button class="btn small" data-z="2">2x</button><button class="btn small" data-z="4">4x</button><button class="btn small" id="iv-close">닫기</button></span></div><div class="img-viewer-scroll"><img id="iv-img" src="${esc(path)}"></div></div>`;
  ov.hidden = false;
  const img = $("iv-img");
  img.onload = () => { img.style.width = `${img.naturalWidth * (path.endsWith(".svg") ? 2 : 3)}px`; };
  ov.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { img.style.width = `${img.naturalWidth * +b.dataset.z}px`; });
  $("iv-close").onclick = () => { ov.hidden = true; };
}

export function initResourcesTab() {
  document.querySelectorAll("#tab-resources [data-sub]").forEach(b => b.onclick = () => { stop(); R.sub = b.dataset.sub; render(); });
}
export function showResourcesTab() { render(); }
export function hideResourcesTab() { stop(); }
