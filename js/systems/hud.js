// ==========================================
// HUD & 메뉴
//  - 좌상단: 주인공 초상화(그림)·이름·레벨·골드·EXP 바·파티 HP / 퀘스트 수·메인 퀘스트·진행 중 퀘스트 드롭다운
//  - 우상단: 아이콘 메뉴 (파티, 가방, 스킬, 퀘스트, 저장, 설정)
// ==========================================
let questListOpen = false;

function updateHUD() {
  if (!player || !GameData.characters) return;
  $("hud-portrait").src = portraitUrl("hero") || "";
  $("hud-name").textContent = player.name;
  $("hud-lv").textContent = player.lv;
  $("hud-gold").textContent = player.gold.toLocaleString();
  $("hud-exp-bar").style.width = `${Math.min(100, player.exp / player.nextExp * 100)}%`;
  $("hud-exp-text").textContent = `${player.exp} / ${player.nextExp}`;
  $("hud-party").innerHTML = activeParty().map(m => `
    <div class="mini-member"><span>${escapeHtml(memberName(m))}</span>
      <span class="bar hp"><i style="width:${Math.max(0, m.hp) / m.maxHp * 100}%"></i></span>
      <span class="bar mp"><i style="width:${m.mp / m.maxMp * 100}%"></i></span></div>`).join("");

  const active = SCN ? questsByState("active") : [];
  const main = SCN ? mainQuest() : null;
  $("hud-quest-count").textContent = active.length;
  $("hud-main-quest").innerHTML = main
    ? `<b>${escapeHtml(fmt(main.title))}</b><span>${escapeHtml(fmt(main.desc.split("\n")[0] || ""))}</span>`
    : `<span class="muted">진행 중인 메인 퀘스트 없음</span>`;
  $("quest-toggle").textContent = questListOpen ? "▲" : "▼";
  $("hud-quest-list").hidden = !questListOpen;
  $("hud-quest-list").innerHTML = active.length
    ? active.map(q => `<li onclick="openMenu('quests')"><span class="tag ${q.type}">${q.type === "main" ? "메인" : "서브"}</span>${escapeHtml(fmt(q.title))}</li>`).join("")
    : `<li class="muted">진행 중인 퀘스트가 없습니다</li>`;
  $("hud-mute").innerHTML = iconImg(AudioSys.settings.muted ? "mute" : "sound");
}

function toggleQuestList() { questListOpen = !questListOpen; SFX.cursor(); updateHUD(); }

function iconImg(name) { return `<img src="assets/img/icons/${name}.svg" alt="">`; }

function hudMute() {
  initAudio();
  const muted = toggleMute();
  showToast(muted ? "🔇 소리 끔" : "🔊 소리 켬");
  updateHUD();
}

// ---------- 메뉴 ----------
let menuTab = "party";
const MENU_TABS = [
  { id: "party", label: "파티" }, { id: "items", label: "가방" }, { id: "skills", label: "스킬" },
  { id: "quests", label: "퀘스트" }, { id: "settings", label: "설정" }
];

function openMenu(tab) {
  if (gameState !== "WORLD" && gameState !== "MODAL") return;
  initAudio();
  if (tab) menuTab = tab;
  SFX.confirm();
  renderMenu();
}

function renderMenu() {
  const html = { party: menuParty, items: menuItems, skills: menuSkills, quests: menuQuests, settings: menuSettings }[menuTab]();
  openWindow("메뉴", html, { tabs: MENU_TABS, active: menuTab, onTab: (t) => { menuTab = t; renderMenu(); } });
}

function bar(cls, v, max) { return `<span class="bar ${cls}"><i style="width:${Math.max(0, v) / max * 100}%"></i></span>`; }

function menuParty() {
  return `<div class="gear-line">⚔️ 무기 Lv.${player.weaponLv} · 🛡️ 방어구 Lv.${player.armorLv} · 파티 Lv.${player.lv} · 💰 ${player.gold}G</div>` +
    activeParty().map(m => {
      const def = memberDef(m.id);
      const pic = portraitUrl(m.portrait);
      return `<div class="card">
        ${pic ? `<img class="card-portrait" src="${pic}" alt="">` : ""}
        <div class="card-body">
          <div class="card-title">${escapeHtml(memberName(m))} <small>${escapeHtml(m.role)}</small></div>
          <div class="stat-line">HP ${bar("hp", m.hp, m.maxHp)} ${Math.max(0, m.hp)}/${m.maxHp}</div>
          <div class="stat-line">MP ${bar("mp", m.mp, m.maxMp)} ${m.mp}/${m.maxMp}</div>
          <div class="stat-grid"><span>공격 <b>${m.atk}</b></span><span>마력 <b>${m.matk}</b></span><span>방어 <b>${m.def}</b></span></div>
          <div class="muted small">${escapeHtml(fmt(def ? def.desc : ""))}</div>
        </div></div>`;
    }).join("");
}

function menuItems() {
  const rows = Object.entries(player.inventory).filter(([, n]) => n > 0).map(([id, n]) => {
    const it = GameData.items.items[id];
    if (!it) return "";
    const usable = it.type === "heal_hp" || it.type === "heal_mp";
    const targets = usable ? activeParty().map(m => `<button class="item-btn" onclick="useFieldItem('${id}','${m.id}')">${escapeHtml(memberName(m))}</button>`).join("") : `<span class="tag key">중요</span>`;
    return `<div class="item-row"><div><b>${it.icon || ""} ${escapeHtml(it.name)}</b> ×${n}<br><span class="muted small">${escapeHtml(it.desc || "")}</span></div><div class="btn-group">${targets}</div></div>`;
  }).join("");
  return rows || `<p class="muted">가방이 비어 있습니다.</p>`;
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
  const block = (title, list, done) => `<div class="section-title">${title} <small>${list.length}</small></div>` +
    (list.length ? list.map(q => `<div class="quest-card${done ? " done" : ""}"><span class="tag ${q.type}">${q.type === "main" ? "메인" : "서브"}</span>
      <b>${escapeHtml(fmt(q.title))}</b><p>${escapeHtml(fmt(q.desc)).replace(/\n/g, "<br>")}</p></div>`).join("")
      : `<p class="muted small">없음</p>`);
  return block("진행 중", questsByState("active"), false) + block("완료", questsByState("done"), true);
}

function menuSettings() {
  const views = GameData.game.views.map(v =>
    `<button class="item-btn${v.cols === View.cols ? " on" : ""}" onclick="changeView(${v.cols})">${v.label} (${v.cols}칸)</button>`).join("");
  const s = AudioSys.settings;
  const login = !window.cloud ? `<span class="muted">클라우드를 사용할 수 없습니다</span>`
    : cloudUser ? `<span>☁️ ${escapeHtml(cloudUser.displayName || cloudUser.email || "")} 로그인됨</span> <button class="item-btn" onclick="toggleLogin()">로그아웃</button>`
    : `<span class="muted">로그인하면 다른 기기에서도 이어할 수 있습니다</span> <button class="item-btn" onclick="toggleLogin()">🔑 Google 로그인</button>`;
  return `
    <div class="section-title">화면에 보이는 맵 크기</div><div class="btn-group wrap">${views}</div>
    <div class="section-title">사운드</div>
    <div class="setting-row">배경음 <input type="range" min="0" max="100" value="${Math.round(s.bgm * 100)}" oninput="setVolume('bgm', this.value/100)"></div>
    <div class="setting-row">효과음 <input type="range" min="0" max="100" value="${Math.round(s.sfx * 100)}" oninput="setVolume('sfx', this.value/100)" onchange="SFX.coin()"></div>
    <div class="setting-row"><button class="item-btn" onclick="hudMute(); renderMenu()">${s.muted ? "🔊 소리 켜기" : "🔇 소리 끄기"}</button></div>
    <div class="section-title">저장</div>
    <div class="setting-row"><button class="item-btn" onclick="closeModal(); manualSave()">💾 저장</button>
      <button class="item-btn" onclick="closeModal(); manualLoad()">📂 불러오기</button></div>
    <div class="setting-row">${login}</div>
    <div class="section-title">기타</div>
    <div class="setting-row"><button class="item-btn" onclick="if(confirm('타이틀로 돌아갈까요? 저장하지 않은 진행은 사라집니다.')) location.reload()">🏠 타이틀로</button></div>`;
}

function changeView(cols) { setViewCols(cols); SFX.cursor(); renderMenu(); }
