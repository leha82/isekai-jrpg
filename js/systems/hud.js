// ==========================================
// HUD & 메뉴
//  - 좌상단: 리더(맵을 걷는 캐릭터) 초상화·이름·레벨·HP/MP·EXP 게이지(숫자 없음) — 반투명 창
//            나머지 동료 HP/MP — 배경 없음 / 퀘스트 한 줄(▼ 펼치면 포커스 퀘스트 내용 + 다른 퀘스트 목록)
//  - 우상단: 아이콘 메뉴 (파티 P, 가방 I, 스킬 K, 퀘스트 Q, 저장 F, 소리 N, 설정 O)
// ==========================================
let questListOpen = false;

function pct(v, max) { return `${Math.max(0, Math.min(100, max ? v / max * 100 : 0))}%`; }

// 포커스 퀘스트: 플레이어가 고른 퀘스트가 진행 중이면 그것, 아니면 메인 → 첫 진행 중 퀘스트
function focusedQuest() {
  const active = questsByState("active");
  return active.find(q => q.id === player.focusQuest) || active.find(q => q.type === "main") || active[0] || null;
}

function updateHUD() {
  if (!player || !GameData.characters) return;
  const lead = leader();
  $("hud-portrait").src = portraitUrl(lead.portrait) || "";
  $("hud-name").textContent = memberName(lead);
  $("hud-lv").textContent = player.lv;
  $("hud-hp-bar").style.width = pct(lead.hp, lead.maxHp);
  $("hud-mp-bar").style.width = pct(lead.mp, lead.maxMp);
  $("hud-hp-text").textContent = `${Math.max(0, lead.hp)}/${lead.maxHp}`;
  $("hud-mp-text").textContent = `${lead.mp}/${lead.maxMp}`;
  $("hud-exp-bar").style.width = pct(player.exp, player.nextExp);
  $("hud-party").innerHTML = activeParty().filter(m => m !== lead).map(m => `
    <div class="mini-member"><span>${escapeHtml(memberName(m))}</span>
      <span class="bar hp"><i style="width:${pct(m.hp, m.maxHp)}"></i></span>
      <span class="bar mp"><i style="width:${pct(m.mp, m.maxMp)}"></i></span></div>`).join("");

  const active = SCN ? questsByState("active") : [];
  const fq = SCN ? focusedQuest() : null;
  const tag = $("hud-quest-tag");
  tag.className = `tag ${fq ? fq.type : "none"}`;
  tag.textContent = fq ? (fq.type === "main" ? "메인" : "서브") : "퀘스트";
  $("hud-quest-title").textContent = fq ? fmt(fq.title) : "진행 중인 퀘스트 없음";
  $("quest-toggle").textContent = questListOpen ? "▲" : "▼";
  $("hud-quest-drop").hidden = !questListOpen || !fq;
  $("hud-quest-focus").innerHTML = fq ? `<b>${escapeHtml(fmt(fq.title))}</b><p>${escapeHtml(fmt(fq.desc || ""))}</p>` : "";
  $("hud-quest-list").innerHTML = active.filter(q => q !== fq).map(q =>
    `<li onclick="focusQuest('${q.id}')" title="이 퀘스트를 위에 표시"><span class="tag ${q.type}">${q.type === "main" ? "메인" : "서브"}</span>${escapeHtml(fmt(q.title))}</li>`).join("");
  $("hud-mute").innerHTML = iconImg(AudioSys.settings.muted ? "mute" : "sound") + `<span class="key">N</span>`;
}

function toggleQuestList() { questListOpen = !questListOpen; SFX.cursor(); updateHUD(); }
function focusQuest(id) { player.focusQuest = id; SFX.cursor(); updateHUD(); }

function iconImg(name) { return `<img src="assets/img/icons/${name}.svg" alt="">`; }

function hudMute() {
  initAudio();
  const muted = toggleMute();
  showToast(muted ? "🔇 소리 끔" : "🔊 소리 켬");
  updateHUD();
  rerenderSettingsIfOpen();
}

// ---------- 메뉴 ----------
let menuTab = "party";
const MENU_TABS = [
  { id: "party", label: "파티" }, { id: "items", label: "가방" }, { id: "skills", label: "스킬" },
  { id: "quests", label: "퀘스트" }, { id: "settings", label: "설정" }
];

function openMenu(tab) {
  if (gameState !== "WORLD" && !(gameState === "MODAL" && Modal.prev === "WORLD")) return;
  initAudio();
  if (tab) menuTab = tab;
  SFX.confirm();
  renderMenu();
}

function renderMenu() {
  const html = { party: menuParty, items: menuItems, skills: menuSkills, quests: menuQuests, settings: () => menuSettings(true) }[menuTab]();
  openWindow("메뉴", html, { kind: "menu", tabs: MENU_TABS, active: menuTab, onTab: (t) => { menuTab = t; renderMenu(); } });
}

function bar(cls, v, max) { return `<span class="bar ${cls}"><i style="width:${pct(v, max)}"></i></span>`; }

function menuParty() {
  const act = activeParty();
  const lead = leader();
  return `<div class="gear-line">⚔️ 무기 Lv.${player.weaponLv} · 🛡️ 방어구 Lv.${player.armorLv} · 파티 Lv.${player.lv} · 💰 ${player.gold.toLocaleString()}G</div>
    <div class="muted small">맨 위 캐릭터가 <b>리더</b>로 맵을 걸어 다닙니다. ▲▼ 로 순서를 바꾸면 전투 행동 순서도 바뀝니다.</div>` +
    act.map((m, i) => {
      const def = memberDef(m.id);
      const pic = portraitUrl(m.portrait);
      const order = act.length > 1 ? `<div class="order-btns">
          <button class="item-btn" title="위로" onclick="partyMove('${m.id}',-1)" ${i === 0 ? "disabled" : ""}>▲</button>
          <button class="item-btn" title="리더로" onclick="partyMove('${m.id}','top')" ${i === 0 ? "disabled" : ""}>👑</button>
          <button class="item-btn" title="아래로" onclick="partyMove('${m.id}',1)" ${i === act.length - 1 ? "disabled" : ""}>▼</button></div>` : "";
      return `<div class="card">
        ${pic ? `<img class="card-portrait" src="${pic}" alt="">` : ""}
        <div class="card-body">
          <div class="card-title">${escapeHtml(memberName(m))} <small>${escapeHtml(m.role)}</small>${m === lead ? `<span class="leader-badge">👑 리더</span>` : ""}</div>
          <div class="stat-line">HP ${bar("hp", m.hp, m.maxHp)} ${Math.max(0, m.hp)}/${m.maxHp}</div>
          <div class="stat-line">MP ${bar("mp", m.mp, m.maxMp)} ${m.mp}/${m.maxMp}</div>
          <div class="stat-grid"><span>공격 <b>${m.atk}</b></span><span>마력 <b>${m.matk}</b></span><span>방어 <b>${m.def}</b></span></div>
          <div class="muted small">${escapeHtml(fmt(def ? def.desc : ""))}</div>
        </div>${order}</div>`;
    }).join("");
}

function partyMove(id, delta) {
  if (!moveMember(id, delta)) return;
  SFX.cursor();
  if (delta === "top") showToast(`👑 ${memberName(leader())}이(가) 리더가 되었습니다.`);
  updateHUD();
  renderMenu();
}

function menuItems() {
  const rows = Object.entries(player.inventory).filter(([, n]) => n > 0).map(([id, n]) => {
    const it = GameData.items.items[id];
    if (!it) return "";
    const usable = it.type === "heal_hp" || it.type === "heal_mp";
    const targets = usable ? activeParty().map(m => `<button class="item-btn" onclick="useFieldItem('${id}','${m.id}')">${escapeHtml(memberName(m))}</button>`).join("") : `<span class="tag key">중요</span>`;
    return `<div class="item-row"><div><b>${it.icon || ""} ${escapeHtml(it.name)}</b> ×${n}<br><span class="muted small">${escapeHtml(it.desc || "")}</span></div><div class="btn-group">${targets}</div></div>`;
  }).join("");
  return `<div class="gear-line">💰 ${player.gold.toLocaleString()} G</div>` + (rows || `<p class="muted">가방이 비어 있습니다.</p>`);
}

function useFieldItem(id, memberId) {
  const it = GameData.items.items[id], m = partyMember(memberId);
  if (!it || !m || (player.inventory[id] || 0) <= 0) return;
  const before = it.type === "heal_hp" ? m.hp : m.mp;
  if (it.type === "heal_hp") m.hp = Math.min(m.maxHp, m.hp + it.amount); else m.mp = Math.min(m.maxMp, m.mp + it.amount);
  const gained = (it.type === "heal_hp" ? m.hp : m.mp) - before;
  if (gained <= 0) { SFX.error(); showToast(`${memberName(m)}은(는) 이미 가득 차 있습니다.`, true); return; }
  player.inventory[id]--;
  SFX.heal();
  showToast(`${memberName(m)} ${it.type === "heal_hp" ? "HP" : "MP"} +${gained}`);
  renderMenu();
}

function menuSkills() {
  return activeParty().map(m => {
    const list = skillsOf(m).map(s => {
      let use = "";
      if (s.type === "heal") {
        use = s.target === "all_allies"
          ? `<button class="item-btn" onclick="useFieldSkill('${m.id}','${s.id}','')" ${m.mp < s.mp ? "disabled" : ""}>전체</button>`
          : activeParty().map(t => `<button class="item-btn" onclick="useFieldSkill('${m.id}','${s.id}','${t.id}')" ${m.mp < s.mp ? "disabled" : ""}>${escapeHtml(memberName(t))}</button>`).join("");
      }
      return `<div class="item-row"><div><b>${s.icon || ""} ${escapeHtml(s.name)}</b> <small>MP ${s.mp}</small><br><span class="muted small">${escapeHtml(s.desc || "")}</span></div><div class="btn-group">${use}</div></div>`;
    }).join("");
    return `<div class="section-title">${escapeHtml(memberName(m))} <small>MP ${m.mp}/${m.maxMp}</small></div>${list}`;
  }).join("");
}

function useFieldSkill(casterId, skillId, targetId) {
  const c = partyMember(casterId), s = GameData.skills[skillId];
  if (!c || !s || c.mp < s.mp) return;
  const targets = targetId ? [partyMember(targetId)] : activeParty();
  const amount = (s.base || 0) + Math.floor(c.matk * (s.power || 0));
  let healed = 0;
  targets.forEach(t => { const b = t.hp; t.hp = Math.min(t.maxHp, t.hp + amount); healed += t.hp - b; });
  if (!healed) { SFX.error(); showToast("회복할 대상이 없습니다.", true); return; }
  c.mp -= s.mp;
  SFX.heal();
  showToast(`${s.name}! HP +${healed}`);
  renderMenu();
}

function menuQuests() {
  const fq = focusedQuest();
  const block = (title, list, done) => `<div class="section-title">${title} <small>${list.length}</small></div>` +
    (list.length ? list.map(q => `<div class="quest-card${done ? " done" : ""}"><span class="tag ${q.type}">${q.type === "main" ? "메인" : "서브"}</span>
      <b>${escapeHtml(fmt(q.title))}</b>${!done ? (q === fq ? ` <span class="leader-badge">📌 HUD 표시 중</span>` : ` <button class="item-btn" onclick="focusQuest('${q.id}'); renderMenu()">📌 HUD에 표시</button>`) : ""}
      <p>${escapeHtml(fmt(q.desc)).replace(/\n/g, "<br>")}</p></div>`).join("")
      : `<p class="muted small">없음</p>`);
  return block("진행 중", questsByState("active"), false) + block("완료", questsByState("done"), true);
}

// ---------- 설정 (게임 중: 메뉴의 설정 탭 / 타이틀: 설정 창) ----------
function btnRow(list, current, onclick) {
  return list.map(o => `<button class="item-btn${String(o.id) === String(current) ? " on" : ""}" onclick="${onclick(o)}">${o.label}</button>`).join("");
}

function menuSettings(inGame) {
  const views = GameData.game.views.map(v => ({ id: v.cols, label: `${v.label} (${v.cols}칸)` }));
  const s = AudioSys.settings, d = Display.settings;
  const vol = (kind, label) => `<div class="setting-row"><label>${label}</label>
    <input type="range" min="0" max="100" value="${Math.round(s[kind] * 100)}" oninput="setVolume('${kind}', this.value/100); this.nextElementSibling.textContent=this.value" onchange="SFX.coin()"><span class="val">${Math.round(s[kind] * 100)}</span></div>`;
  const login = !window.cloud ? `<span class="muted">클라우드를 사용할 수 없습니다</span>`
    : cloudUser ? `<span>☁️ ${escapeHtml(cloudUser.displayName || cloudUser.email || "")} 로그인됨</span> <button class="item-btn" onclick="toggleLogin()">로그아웃</button>`
    : `<span class="muted">로그인하면 모든 저장이 클라우드에 올라갑니다</span> <button class="item-btn" onclick="toggleLogin()">🔑 Google 로그인</button>`;
  return `
    <div class="section-title">화면 크기 <small>현재 ${Math.round(GAME_W * Display.scale)}×${Math.round(GAME_H * Display.scale)}</small></div>
    <div class="btn-group wrap">${btnRow(DISPLAY_SIZES, d.size, o => `setDisplaySetting('size','${o.id}'); rerenderSettingsIfOpen()`)}
      <button class="item-btn${document.fullscreenElement ? " on" : ""}" onclick="toggleFullscreen()">⛶ 전체 화면</button></div>
    <div class="section-title">레이아웃 <small>자동 = PC/모바일·가로/세로를 알아서 고름 (지금: ${(DISPLAY_LAYOUTS.find(l => l.id === Display.layout) || {}).label})</small></div>
    <div class="btn-group wrap">${btnRow(DISPLAY_LAYOUTS, d.layout, o => `setDisplaySetting('layout','${o.id}'); rerenderSettingsIfOpen()`)}</div>
    <div class="section-title">가상 패드</div>
    <div class="btn-group wrap">${btnRow(DISPLAY_PADS, d.pad, o => `setDisplaySetting('pad','${o.id}'); rerenderSettingsIfOpen()`)}</div>
    <div class="section-title">화면에 보이는 맵 크기</div>
    <div class="btn-group wrap">${btnRow(views, View.cols, o => `changeView(${o.id})`)}</div>
    <div class="section-title">사운드 <small>켜고 끄기는 우상단 🔊 아이콘(N)</small></div>
    ${vol("master", "전체")}${vol("bgm", "배경음")}${vol("sfx", "효과음")}
    <div class="setting-row"><button class="item-btn" onclick="hudMute()">${s.muted ? "🔊 소리 켜기" : "🔇 소리 끄기"}</button></div>
    ${inGame ? `<div class="section-title">저장</div>
    <div class="setting-row"><button class="item-btn" onclick="openSaveWindow('save')">💾 저장</button>
      <button class="item-btn" onclick="openSaveWindow('load')">📂 불러오기</button></div>` : ""}
    <div class="section-title">계정 · AI</div>
    <div class="setting-row wrap">${login}</div>
    <div class="setting-row"><button class="item-btn" onclick="openAIMenu()">🤖 AI 연결 (Claude · Gemini · ChatGPT)</button></div>
    ${inGame ? `<div class="section-title">기타</div>
    <div class="setting-row"><button class="item-btn" onclick="returnToTitle()">🏠 타이틀로</button></div>` : ""}`;
}

function openTitleSettings() {
  initAudio();
  SFX.confirm();
  openWindow("⚙️ 설정", menuSettings(false), { kind: "settings" });
}

// 설정 창이 열려 있으면 다시 그린다 (로그인 상태·전체 화면 변경 등)
function rerenderSettingsIfOpen() {
  if (modalOpen("settings")) openWindow("⚙️ 설정", menuSettings(false), { kind: "settings" });
  else if (modalOpen("menu") && menuTab === "settings") renderMenu();
}

function changeView(cols) { setViewCols(cols); SFX.cursor(); rerenderSettingsIfOpen(); }

async function returnToTitle() {
  if (!(await uiConfirm("타이틀로 돌아갈까요?\n마지막 저장 이후의 진행은 사라집니다.", { ok: "타이틀로" }))) return;
  if (autoCloud.pending) await flushAutoCloud(); // 모아 둔 자동 저장을 클라우드에 보낸 뒤 이동
  location.reload();
}
