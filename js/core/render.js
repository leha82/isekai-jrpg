// ==========================================
// 렌더링 & HUD
// ==========================================
const canvas = document.getElementById("world-canvas");
const ctx = canvas.getContext("2d");

function drawSprite(targetCtx, spriteKey, dx, dy, size) {
  const grid = SPRITES[spriteKey];
  if (!grid) return;
  const pixelSize = size / 16;
  const offsetY = Math.floor((16 - grid.length) / 2);
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const ch = grid[r][c];
      if (PALETTE[ch]) {
        targetCtx.fillStyle = PALETTE[ch];
        targetCtx.fillRect(dx + c * pixelSize, dy + (r + offsetY) * pixelSize, Math.ceil(pixelSize), Math.ceil(pixelSize));
      }
    }
  }
}

function renderWorld() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = WORLD_MAP[y][x];
      const px = x * TILE_SIZE, py = y * TILE_SIZE;
      ctx.fillStyle = TILE_COLORS[t];
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
      if (t === 1) {
        ctx.fillStyle = "#14532d"; ctx.fillRect(px + 8, py + 6, 16, 14);
        ctx.fillStyle = "#78350f"; ctx.fillRect(px + 14, py + 20, 4, 8);
      } else if (t === 5) {
        ctx.fillStyle = "#dc2626"; ctx.fillRect(px + 6, py + 6, 20, 10);
        ctx.fillStyle = "#fff"; ctx.fillRect(px + 8, py + 16, 16, 12);
      }
    }
  }
  // 시나리오 @event 의 "* sprite" 로 지정된 NPC
  scenarioEventSprites().forEach(ev => drawSprite(ctx, ev.sprite.key, ev.x * TILE_SIZE, ev.y * TILE_SIZE, TILE_SIZE));
  drawSprite(ctx, "hero", player.x * TILE_SIZE, player.y * TILE_SIZE, TILE_SIZE);
}

function updateHUD() {
  const statusDiv = document.getElementById("party-status");
  statusDiv.innerHTML = party.filter(m => m.unlocked).map(m => `
    <div class="party-row">
      <strong>${m.name}</strong> <span style="color:#94a3b8">(${m.role})</span><br>
      HP <span style="color:#4ade80">${m.hp}/${m.maxHp}</span> | MP <span style="color:#38bdf8">${m.mp}/${m.maxMp}</span>
    </div>
  `).join("");

  document.getElementById("p-gold").innerText = player.gold;
  document.getElementById("p-lv").innerText = player.lv;
  document.getElementById("p-exp").innerText = player.exp;
  document.getElementById("p-nextexp").innerText = player.nextExp;
  document.getElementById("quest-text").innerText = scenarioQuestText();
}
