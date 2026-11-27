// ==========================================
// 전투 화면 렌더러 (캔버스 애니메이션)
//  - 아군: 왼쪽 아래, 오른쪽을 바라보는 옆모습(걷기 스프라이트) / 적: 오른쪽 위, 몬스터 시트
//  - 캔버스 크기는 화면 방향에 따라 다르다 (가로 640×300, 세로 모드 480×360). 배치는 비율로 계산한다.
//  - 연출: 돌진·복귀 트윈, 베기·화염구·바람·치유·방패·암흑·냉기·지진 이펙트, 떠오르는 숫자, 화면 흔들림·번쩍임
// ==========================================
const BV = {
  canvas: null, ctx: null, running: false, last: 0,
  bg: null, actors: [], effects: [], texts: [], shake: 0, flash: null
};
let BV_W = 640, BV_H = 300;

function bvInit() {
  BV.canvas = $("battle-canvas");
  BV.ctx = BV.canvas.getContext("2d");
}

function bvStart(bgKey) {
  if (!BV.ctx) bvInit();
  BV_W = BV.canvas.width; BV_H = BV.canvas.height;
  BV.bg = Images.bg[bgKey] || Images.bg.meadow;
  BV.actors = []; BV.effects = []; BV.texts = []; BV.shake = 0; BV.flash = null;
  if (!BV.running) { BV.running = true; BV.last = performance.now(); requestAnimationFrame(bvLoop); }
}
function bvStop() { BV.running = false; }

const speed = () => 1 / (GameData.battle.animationSpeed || 1);
const bvWait = (ms) => wait(ms * speed());

// ---------- 배치 ----------
// 적: 오른쪽 위 (발 위치 기준, x = 가운데). 아군: 왼쪽 아래 대각선 (x = 왼쪽 끝, y = 발). 앞줄(리더)이 적에 가장 가깝다.
function enemySlots(n) {
  const W = BV_W, H = BV_H;
  if (n === 1) return [[W * .72, H * .6]];
  if (n === 2) return [[W * .63, H * .55], [W * .84, H * .63]];
  return [[W * .6, H * .52], [W * .75, H * .63], [W * .89, H * .5]];
}
function allySlot(i) { return [Math.round(BV_W * .34 - i * BV_W * .068), Math.round(BV_H * .64 + i * BV_H * .1)]; }

function bvLayoutEnemies(enemies) {
  const slots = enemySlots(enemies.length);
  enemies.forEach((e, i) => {
    const src = monsterSrc(e.sprite);
    const scale = src && src.w > 32 ? 2.6 : 3;
    bvAddActor({ kind: "enemy", ref: e, homeX: slots[i][0], homeY: slots[i][1], src, scale });
  });
}

function bvLayoutAllies(allies) {
  allies.forEach((m, i) => {
    const [x, y] = allySlot(i);
    bvAddActor({ kind: "ally", ref: m, homeX: x, homeY: y, scale: 3 });
  });
}

// 화면 방향이 바뀌면(세로↔가로) 캔버스 크기에 맞춰 다시 배치한다
function bvRelayout() {
  if (!BV.canvas || !BV.actors.length) return;
  BV_W = BV.canvas.width; BV_H = BV.canvas.height;
  const en = BV.actors.filter(a => a.kind === "enemy"), al = BV.actors.filter(a => a.kind === "ally");
  const slots = enemySlots(en.length);
  en.forEach((a, i) => { a.homeX = slots[i][0]; a.homeY = slots[i][1]; });
  al.forEach((a, i) => { [a.homeX, a.homeY] = allySlot(i); });
  BV.actors.forEach(a => { a.tween = null; a.x = a.homeX; a.y = a.homeY; });
}

function bvAddActor(a) {
  Object.assign(a, { x: a.homeX, y: a.homeY, alpha: 1, flash: 0, tween: null, dying: false, walk: false, born: performance.now() });
  BV.actors.push(a);
  return a;
}
function bvActor(ref) { return BV.actors.find(a => a.ref === ref); }

// 액터 중심(이펙트 기준점)
function bvCenter(a) {
  if (a.kind === "enemy") {
    const h = (a.src ? a.src.h : 32) * a.scale;
    return { x: a.x, y: a.y - h / 2 };
  }
  return { x: a.x + 24, y: a.y - 24 };
}

// ---------- 트윈 ----------
// 진행은 타이머로 보장 (rAF 가 멈춰도 전투가 멈추지 않게), 그리기는 rAF
function bvMove(a, x, y, ms) {
  return new Promise(resolve => {
    const tw = { fx: a.x, fy: a.y, tx: x, ty: y, t0: performance.now(), dur: ms * speed(), resolve };
    a.tween = tw;
    setTimeout(() => { if (a.tween === tw) { a.x = x; a.y = y; a.tween = null; resolve(); } }, tw.dur + 30);
  });
}

// ---------- 루프 ----------
function bvLoop(now) {
  if (!BV.running) return;
  const dt = now - BV.last;
  BV.last = now;
  BV.actors.forEach(a => {
    if (a.tween) {
      const p = Math.min(1, (now - a.tween.t0) / a.tween.dur);
      const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      a.x = a.tween.fx + (a.tween.tx - a.tween.fx) * e;
      a.y = a.tween.fy + (a.tween.ty - a.tween.fy) * e;
      if (p >= 1) { const r = a.tween.resolve; a.tween = null; r(); }
    }
    if (a.flash > 0) a.flash = Math.max(0, a.flash - dt);
    if (a.dying) a.alpha = Math.max(0, a.alpha - dt / 600);
  });
  BV.shake = Math.max(0, BV.shake - dt * 0.02);
  bvDraw(now);
  requestAnimationFrame(bvLoop);
}

function bvDraw(now) {
  const c = BV.ctx;
  c.save();
  c.imageSmoothingEnabled = false;
  const sx = BV.shake ? (Math.random() - .5) * BV.shake * 2 : 0, sy = BV.shake ? (Math.random() - .5) * BV.shake : 0;
  c.translate(sx, sy);
  // 배경 (320x120 → 화면 폭에 맞춰 늘림) + 아래쪽 바닥
  c.fillStyle = "#1a1626";
  c.fillRect(-10, -10, BV_W + 20, BV_H + 20);
  const bgH = Math.round(BV_H * .8);
  if (BV.bg) {
    // 세로 모드는 화면이 좁으므로 배경 가운데를 잘라 쓴다
    const srcW = Math.min(BV.bg.width, BV.bg.height * BV_W / bgH);
    const sx = (BV.bg.width - srcW) / 2;
    c.drawImage(BV.bg, sx, 0, srcW, BV.bg.height, 0, 0, BV_W, bgH);
    c.drawImage(BV.bg, sx, BV.bg.height - 2, srcW, 2, 0, bgH, BV_W, BV_H - bgH + 10);
  }
  const grad = c.createLinearGradient(0, BV_H * .66, 0, BV_H);
  grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,0.45)");
  c.fillStyle = grad; c.fillRect(0, BV_H * .66, BV_W, BV_H * .34);

  // 액터 (y 순)
  BV.actors.slice().sort((a, b) => a.y - b.y).forEach(a => bvDrawActor(c, a, now));
  // 이펙트
  BV.effects = BV.effects.filter(ef => {
    const p = (now - ef.t0) / ef.dur;
    if (p >= 1) { if (ef.resolve) ef.resolve(); return false; }
    if (p >= 0) ef.draw(c, p);
    return true;
  });
  // 숫자
  BV.texts = BV.texts.filter(t => {
    const p = (now - t.t0) / 900;
    if (p >= 1) return false;
    c.globalAlpha = p < .7 ? 1 : 1 - (p - .7) / .3;
    c.font = `bold ${t.big ? 26 : 20}px 'Malgun Gothic', sans-serif`;
    c.textAlign = "center";
    c.lineWidth = 4; c.strokeStyle = "#14121c";
    const y = t.y - 30 * Math.min(1, p * 2.5) + (p > .4 ? 0 : 0);
    c.strokeText(t.text, t.x, y);
    c.fillStyle = t.color; c.fillText(t.text, t.x, y);
    c.globalAlpha = 1;
    return true;
  });
  c.restore();
  if (BV.flash) {
    const p = (now - BV.flash.t0) / BV.flash.dur;
    if (p >= 1) BV.flash = null;
    else { c.fillStyle = BV.flash.color; c.globalAlpha = (1 - p) * BV.flash.alpha; c.fillRect(0, 0, BV_W, BV_H); c.globalAlpha = 1; }
  }
}

function bvDrawActor(c, a, now) {
  if (a.alpha <= 0) return;
  const t = (now - a.born) / 1000;
  c.globalAlpha = a.alpha;
  if (a.kind === "enemy") {
    const s = a.src; if (!s) return;
    const w = s.w * a.scale, h = s.h * a.scale;
    const breathe = a.dying ? 0 : Math.sin(t * 2.4 + a.homeX) * 2;
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath(); c.ellipse(a.x, a.y + 2, w * .36, 7, 0, 0, Math.PI * 2); c.fill();
    const dx = Math.round(a.x - w / 2), dy = Math.round(a.y - h + breathe);
    c.drawImage(Images.monsters, s.x, s.y, s.w, s.h, dx, dy, w, h);
    if (a.flash > 0) bvTintFlash(c, Images.monsters, s.x, s.y, s.w, s.h, dx, dy, w, h);
    // HP 바
    if (!a.dying) {
      const e = a.ref, bw = Math.min(110, Math.max(70, w * .8));
      c.fillStyle = "rgba(10,10,20,.8)"; c.fillRect(a.x - bw / 2 - 1, dy - 14, bw + 2, 8);
      c.fillStyle = e.hp / e.maxHp > .5 ? "#4ade80" : e.hp / e.maxHp > .2 ? "#facc15" : "#f87171";
      c.fillRect(a.x - bw / 2, dy - 13, bw * Math.max(0, e.hp) / e.maxHp, 6);
      c.font = "bold 12px 'Malgun Gothic', sans-serif"; c.textAlign = "center";
      c.lineWidth = 3; c.strokeStyle = "#14121c"; c.strokeText(e.name, a.x, dy - 18);
      c.fillStyle = "#fff"; c.fillText(e.name, a.x, dy - 18);
      if (a.targeted) {
        c.fillStyle = "#facc15";
        const ty = dy - 34 + Math.sin(t * 8) * 3;
        c.beginPath(); c.moveTo(a.x - 8, ty); c.lineTo(a.x + 8, ty); c.lineTo(a.x, ty + 10); c.fill();
      }
    }
  } else {
    const m = a.ref;
    const down = m.hp <= 0;
    const frame = a.walk ? (Math.floor(t * 8) % 2 ? 0 : 2) : 1;
    const s = charSrc(m.sprite, "right", frame); // 적(오른쪽)을 바라보는 옆모습
    if (!s) return;
    const size = 16 * a.scale;
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath(); c.ellipse(a.x + size / 2, a.y + 1, size * .32, 6, 0, 0, Math.PI * 2); c.fill();
    c.save();
    if (down) {
      c.translate(a.x + size / 2, a.y - 10); c.rotate(Math.PI / 2); c.globalAlpha = .55 * a.alpha;
      c.drawImage(Images.characters, s.sx, s.sy, s.size, s.size, -size / 2, -size / 2, size, size);
    } else {
      const bob = a.active ? Math.sin(t * 6) * 2 : 0;
      c.drawImage(Images.characters, s.sx, s.sy, s.size, s.size, Math.round(a.x), Math.round(a.y - size + bob), size, size);
      if (a.flash > 0) bvTintFlash(c, Images.characters, s.sx, s.sy, s.size, s.size, Math.round(a.x), Math.round(a.y - size), size, size);
    }
    c.restore();
    if (a.active && !down) {
      c.fillStyle = "#facc15";
      const ty = a.y - size - 14 + Math.sin(t * 8) * 3;
      c.beginPath(); c.moveTo(a.x + size / 2 - 7, ty); c.lineTo(a.x + size / 2 + 7, ty); c.lineTo(a.x + size / 2, ty + 9); c.fill();
    }
  }
  c.globalAlpha = 1;
}

// 맞았을 때 하얗게 번쩍임
const _flashCanvas = document.createElement("canvas");
function bvTintFlash(c, img, sx, sy, sw, sh, dx, dy, dw, dh) {
  _flashCanvas.width = sw; _flashCanvas.height = sh;
  const f = _flashCanvas.getContext("2d");
  f.clearRect(0, 0, sw, sh);
  f.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  f.globalCompositeOperation = "source-in";
  f.fillStyle = "#ffffff"; f.fillRect(0, 0, sw, sh);
  f.globalCompositeOperation = "source-over";
  c.save(); c.globalAlpha = 0.85; c.imageSmoothingEnabled = false;
  c.drawImage(_flashCanvas, 0, 0, sw, sh, dx, dy, dw, dh);
  c.restore();
}

// ---------- 이펙트 ----------
function bvEffect(dur, draw, delay = 0) {
  return new Promise(resolve => {
    const ef = { t0: performance.now() + delay * speed(), dur: dur * speed(), draw, resolve };
    BV.effects.push(ef);
    setTimeout(resolve, (delay + dur) * speed() + 40);
  });
}
function bvText(a, text, color = "#ffffff", big = false) {
  const p = bvCenter(a);
  BV.texts.push({ x: p.x + (Math.random() - .5) * 16, y: p.y - 10, text: String(text), color, big, t0: performance.now() });
}
function bvHit(a) { a.flash = 180; }
function bvShake(power = 6) { BV.shake = Math.max(BV.shake, power); }
function bvFlash(color, dur = 300, alpha = .6) { BV.flash = { color, dur: dur * speed(), alpha, t0: performance.now() }; }

function particles(c, p, cx, cy, n, colors, spread, rise = 0, size = 4) {
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + i;
    const r = spread * p * (0.5 + ((i * 37) % 10) / 20);
    c.fillStyle = colors[i % colors.length];
    c.globalAlpha = 1 - p;
    c.fillRect(cx + Math.cos(ang) * r - size / 2, cy + Math.sin(ang) * r - rise * p - size / 2, size, size);
  }
  c.globalAlpha = 1;
}

const FX = {
  slash(target, gold = false) {
    const pt = bvCenter(target);
    return bvEffect(320, (c, p) => {
      c.save(); c.lineCap = "round";
      for (let i = 0; i < (gold ? 3 : 2); i++) {
        const q = Math.min(1, Math.max(0, p * 1.6 - i * 0.25));
        if (q <= 0) continue;
        c.strokeStyle = gold ? (i % 2 ? "#fff7c2" : "#facc15") : "#ffffff";
        c.globalAlpha = 1 - Math.max(0, (p - .6) / .4);
        c.lineWidth = gold ? 6 : 4;
        const r = gold ? 70 : 48, off = (i - .5) * 16;
        c.beginPath();
        c.arc(pt.x + off, pt.y + off * .4, r, -2.4 + i * .3, -2.4 + i * .3 + 2.6 * q);
        c.stroke();
      }
      c.restore();
    });
  },
  // 화살: 날아가는 방향으로 회전
  arrow(from, target) {
    const a = bvCenter(from), b = bvCenter(target);
    return bvEffect(260, (c, p) => {
      const pos = (q) => [a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q - Math.sin(q * Math.PI) * 30];
      const [x, y] = pos(p), [x2, y2] = pos(Math.min(1, p + .02));
      c.save(); c.translate(x, y); c.rotate(Math.atan2(y2 - y, x2 - x));
      c.strokeStyle = "#f4e4c0"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-16, 0); c.lineTo(6, 0); c.stroke();
      c.fillStyle = "#cfd6e0"; c.beginPath(); c.moveTo(11, 0); c.lineTo(4, -4); c.lineTo(4, 4); c.fill();
      c.restore();
    });
  },
  // 새총 돌멩이
  stone(from, target, delay = 0) {
    const a = bvCenter(from), b = bvCenter(target);
    return bvEffect(240, (c, p) => {
      const x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p - Math.sin(p * Math.PI) * 22;
      c.fillStyle = "#1a1626"; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#9a9aa6"; c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#e4e4ec"; c.fillRect(x - 2.5, y - 2.5, 2, 2);
    }, delay);
  },
  async fire(from, target) {
    const a = bvCenter(from), b = bvCenter(target);
    await bvEffect(380, (c, p) => {
      const x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p - Math.sin(p * Math.PI) * 24;
      for (let i = 0; i < 6; i++) {
        const q = Math.max(0, p - i * .05);
        c.globalAlpha = .7 - i * .1;
        c.fillStyle = i < 2 ? "#ffe27a" : "#ff8a2a";
        c.beginPath(); c.arc(a.x + (b.x - a.x) * q, a.y + (b.y - a.y) * q - Math.sin(q * Math.PI) * 24, 12 - i * 1.5, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
      c.fillStyle = "#fff6c8"; c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
    });
    bvShake(6);
    FX.explode(target, ["#ffe27a", "#ff8a2a", "#ff4a2a", "#fff"]);
  },
  explode(target, colors) {
    const pt = bvCenter(target);
    return bvEffect(450, (c, p) => {
      c.globalAlpha = 1 - p;
      c.fillStyle = colors[1];
      c.beginPath(); c.arc(pt.x, pt.y, 10 + 50 * p, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
      particles(c, p, pt.x, pt.y, 18, colors, 70, 10, 5);
    });
  },
  wind(targets) {
    return Promise.all(targets.map((t, k) => {
      const pt = bvCenter(t);
      return bvEffect(650, (c, p) => {
        c.save(); c.lineWidth = 3; c.lineCap = "round";
        for (let i = 0; i < 4; i++) {
          c.strokeStyle = i % 2 ? "rgba(220,255,230,.9)" : "rgba(120,230,170,.9)";
          c.globalAlpha = 1 - p;
          const r = 20 + i * 10 + p * 15, start = p * 12 + i * 1.6;
          c.beginPath(); c.arc(pt.x, pt.y + (i - 2) * 8, r, start, start + 2.2); c.stroke();
        }
        c.restore();
      }, k * 60);
    }));
  },
  heal(targets) {
    return Promise.all(targets.map(t => {
      const pt = bvCenter(t);
      return bvEffect(700, (c, p) => {
        c.globalAlpha = 1 - p;
        c.strokeStyle = "#86efac"; c.lineWidth = 3;
        c.beginPath(); c.ellipse(pt.x, pt.y + 22, 16 + 26 * p, 6 + 8 * p, 0, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
        for (let i = 0; i < 8; i++) {
          const x = pt.x - 22 + (i * 13) % 44, y = pt.y + 20 - p * 60 - (i % 3) * 10;
          c.fillStyle = i % 2 ? "#ffffff" : "#86efac";
          c.globalAlpha = 1 - p;
          c.fillRect(x, y, 4, 4); c.fillRect(x - 2, y + 1, 8, 2);
        }
        c.globalAlpha = 1;
      });
    }));
  },
  shield(targets) {
    return Promise.all(targets.map(t => {
      const pt = bvCenter(t);
      return bvEffect(700, (c, p) => {
        c.globalAlpha = (1 - p) * .8;
        c.strokeStyle = "#7dd3fc"; c.lineWidth = 4;
        c.fillStyle = "rgba(125,211,252,.18)";
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = i / 6 * Math.PI * 2 + p;
          const r = 34 + Math.sin(p * Math.PI) * 6;
          i ? c.lineTo(pt.x + Math.cos(ang) * r, pt.y + Math.sin(ang) * r) : c.moveTo(pt.x + Math.cos(ang) * r, pt.y + Math.sin(ang) * r);
        }
        c.closePath(); c.fill(); c.stroke();
        c.globalAlpha = 1;
      });
    }));
  },
  impact(target, color = "#ff6b6b") {
    const pt = bvCenter(target);
    return bvEffect(260, (c, p) => {
      c.save(); c.translate(pt.x, pt.y); c.rotate(p);
      c.fillStyle = color; c.globalAlpha = 1 - p;
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 10 + 14 * p : 22 + 26 * p, ang = i / 10 * Math.PI * 2;
        i ? c.lineTo(Math.cos(ang) * r, Math.sin(ang) * r) : c.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      c.closePath(); c.fill(); c.restore();
    });
  },
  dark(targets) {
    bvFlash("#5b21b6", 500, .55);
    bvShake(10);
    return Promise.all(targets.map(t => {
      const pt = bvCenter(t);
      return bvEffect(600, (c, p) => particles(c, p, pt.x, pt.y, 16, ["#a855f7", "#1e1030", "#f0abfc"], 60, -20, 6));
    }));
  },
  frost(targets) {
    bvFlash("#bae6fd", 300, .4);
    return Promise.all(targets.map(t => {
      const pt = bvCenter(t);
      return bvEffect(600, (c, p) => {
        for (let i = 0; i < 7; i++) {
          const x = pt.x - 30 + i * 10, y = pt.y - 70 + p * 80 + (i % 3) * 8;
          c.fillStyle = i % 2 ? "#e0f7ff" : "#7dd3fc"; c.globalAlpha = 1 - p * .7;
          c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 4, y); c.lineTo(x, y + 9); c.lineTo(x - 4, y); c.fill();
        }
        c.globalAlpha = 1;
      });
    }));
  },
  quake(targets) {
    bvShake(14);
    return Promise.all(targets.map(t => {
      const pt = bvCenter(t);
      return bvEffect(500, (c, p) => particles(c, p, pt.x, pt.y + 24, 14, ["#a68e78", "#6a5848", "#d6c4ae"], 50, 30, 6));
    }));
  },
  sparkle(target) {
    const pt = bvCenter(target);
    return bvEffect(500, (c, p) => particles(c, p, pt.x, pt.y, 12, ["#fff7c2", "#facc15", "#ffffff"], 40, 20, 4));
  },
  cast(actor, color) {
    const pt = bvCenter(actor);
    return bvEffect(380, (c, p) => {
      c.globalAlpha = (1 - p) * .9;
      c.strokeStyle = color; c.lineWidth = 3;
      c.beginPath(); c.arc(pt.x, pt.y + 4, 14 + p * 24, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(pt.x, pt.y + 4, 6 + p * 12, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    });
  }
};
