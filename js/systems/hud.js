// ==========================================
// HUD & 메뉴
//  - 좌상단: 리더(맵을 걷는 캐릭터) 초상화·이름·레벨·HP/MP·EXP 게이지(숫자 없음) — 반투명 창
//            나머지 동료 HP/MP — 배경 없음 / 추적 중인 퀘스트 한 줄(▼ 펼치면 내용 + 다른 퀘스트 목록)
//  - 우상단: 아이콘 메뉴 (파티 P, 가방 I, 장비 E, 스킬 K, 퀘스트 Q, 지도 M, 저장 F, 소리 N, 설정 O)
//  - 메뉴 탭: 파티 · 가방 · 장비 · 스킬 · 퀘스트 · 지도 · 설정 (지도는 js/systems/worldmap.js)
// ==========================================
let questListOpen = false;

function pct(v, max) { return `${Math.max(0, Math.min(100, max ? v / max * 100 : 0))}%`; }

// 추적 중인 퀘스트: 플레이어가 고른 퀘스트가 진행 중이면 그것, 아니면 메인 → 첫 진행 중 퀘스트
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
    `<li onclick="focusQuest('${q.id}')" title="이 퀘스트 추적하기"><span class="tag ${q.type}">${q.type === "main" ? "메인" : "서브"}</span>${escapeHtml(fmt(q.title))}</li>`).join("");
  $("hud-mute").innerHTML = iconImg(AudioSys.settings.muted ? "mute" : "sound") + `<span class="key">N</span>`;
}

function toggleQuestList() { questListOpen = !questListOpen; SFX.cursor(); updateHUD(); }
function focusQuest(id) { player.focusQuest = id; SFX.cursor(); updateHUD(); }

function iconImg(name) { return `<img src="assets/img/icons/${name}.svg" alt="">`; }

function hudMute() {
  initAudio();
  const muted = toggleMute("master");
  showToast(muted ? "🔇 소리 끔" : "🔊 소리 켬");
  updateHUD();
  rerenderSettingsIfOpen();
}

// ---------- 메뉴 ----------
let menuTab = "party";
let menuChar = "";   // 스킬·장비 탭에서 고른 캐릭터 id
const MENU_TABS = [
  { id: "party", label: "파티" }, { id: "items", label: "가방" }, { id: "equip", label: "장비" }, { id: "skills", label: "스킬" },
  { id: "quests", label: "퀘스트" }, { id: "map", label: "지도" }, { id: "settings", label: "설정" }
];

function openMenu(tab, charId) {
  if (gameState !== "WORLD" && !(gameState === "MODAL" && Modal.prev === "WORLD")) return;
  initAudio();
  if (tab) menuTab = tab;
  if (charId) menuChar = charId;
  SFX.confirm();
  renderMenu();
}

function renderMenu() {
  const html = { party: menuParty, items: menuItems, equip: menuEquip, skills: menuSkills, quests: menuQuests,
                 map: menuMap, settings: () => menuSettings(true) }[menuTab]();
  openWindow("메뉴", html, { kind: "menu", tabs: MENU_TABS, active: menuTab, onTab: (t) => { menuTab = t; renderMenu(); } });
  if (menuTab === "map") drawMapTab();
}

function bar(cls, v, max) { return `<span class="bar ${cls}"><i style="width:${pct(v, max)}"></i></span>`; }

function statGrid(m) {
  return `<div class="stat5">${STAT_KEYS.map(k => `<span title="${STAT_INFO[k].name}: ${STAT_INFO[k].desc}"><em>${STAT_INFO[k].label}</em><b>${m[k]}</b></span>`).join("")}</div>`;
}
function statLegend() {
  return `<div class="stat-legend">${STAT_KEYS.map(k => `<span><b>${STAT_INFO[k].label}</b> ${STAT_INFO[k].desc}</span>`).join("")}</div>`;
}

// ---------- 파티 ----------
function menuParty() {
  const act = activeParty();
  const lead = leader();
  return `<div class="gear-line">파티 Lv.${player.lv} · 💰 ${player.gold.toLocaleString()}G · 대장간 강화 ⚔️${player.weaponLv} 🛡️${player.armorLv}</div>
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
          <div class="card-title">${escapeHtml(memberName(m))} <small>${escapeHtml(m.role)} · Lv.${player.lv}</small>${m === lead ? `<span class="leader-badge">👑 리더</span>` : ""}</div>
          <div class="stat-line"><span class="k">HP</span>${bar("hp", m.hp, m.maxHp)} ${Math.max(0, m.hp)}/${m.maxHp}</div>
          <div class="stat-line"><span class="k">MP</span>${bar("mp", m.mp, m.maxMp)} ${m.mp}/${m.maxMp}</div>
          <div class="stat-line"><span class="k">EXP</span>${bar("exp", player.exp, player.nextExp)} ${player.exp}/${player.nextExp}</div>
          ${statGrid(m)}
          <div class="btn-group">
            <button class="item-btn" onclick="openMenu('skills','${m.id}')">${iconImg("skill")} 스킬</button>
            <button class="item-btn" onclick="openMenu('equip','${m.id}')">${iconImg("equip")} 장비</button>
          </div>
          <div class="muted small">${escapeHtml(fmt(def ? def.desc : ""))}</div>
        </div>${order}</div>`;
    }).join("") + statLegend();
}

function partyMove(id, delta) {
  if (!moveMember(id, delta)) return;
  SFX.cursor();
  if (delta === "top") showToast(`👑 ${memberName(leader())}이(가) 리더가 되었습니다.`);
  updateHUD();
  renderMenu();
}

// 스킬·장비 탭의 캐릭터 고르기
function charPicker() {
  const act = activeParty();
  if (!act.some(m => m.id === menuChar)) menuChar = act[0] ? act[0].id : "";
  return `<div class="char-picker">${act.map(m => `<button class="char-btn${m.id === menuChar ? " on" : ""}" onclick="menuChar='${m.id}'; SFX.cursor(); renderMenu()">
      <img src="${portraitUrl(m.portrait) || ""}" alt=""><span>${escapeHtml(memberName(m))}</span></button>`).join("")}</div>`;
}

// ---------- 가방 ----------
const ITEM_KIND = { heal_hp: "회복", heal_mp: "회복", key: "중요", weapon: "무기", armor: "방어구", accessory: "장신구" };

function menuItems() {
  const rows = Object.entries(player.inventory).filter(([, n]) => n > 0).map(([id, n]) => {
    const it = GameData.items.items[id];
    if (!it) return "";
    const usable = it.type === "heal_hp" || it.type === "heal_mp";
    let right;
    if (usable) right = activeParty().map(m => `<button class="item-btn" onclick="useFieldItem('${id}','${m.id}')">${escapeHtml(memberName(m))}</button>`).join("");
    else if (isEquipItem(it)) right = `<span class="tag side">${ITEM_KIND[it.type]}</span><button class="item-btn" onclick="openMenu('equip')">장비 메뉴</button>`;
    else right = `<span class="tag key">중요</span>`;
    const extra = isEquipItem(it) ? ` <span class="bonus">${escapeHtml(bonusText(it.bonus))}</span>` : "";
    return `<div class="item-row">${iconTag(it.icon, "ico big")}<div class="grow"><b>${escapeHtml(it.name)}</b> ×${n}${extra}<br><span class="muted small">${escapeHtml(it.desc || "")}</span></div><div class="btn-group wrap end">${right}</div></div>`;
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

// ---------- 장비 ----------
function menuEquip() {
  const picker = charPicker();
  const m = partyMember(menuChar);
  if (!m) return picker;
  const slots = EQUIP_SLOTS.map(slot => {
    const curId = m.equip[slot];
    const cur = curId ? GameData.items.items[curId] : null;
    const options = Object.entries(player.inventory).filter(([id, n]) => n > 0 && GameData.items.items[id] && GameData.items.items[id].type === slot && canEquip(m, id))
      .map(([id, n]) => {
        const it = GameData.items.items[id];
        return `<div class="equip-opt">${iconTag(it.icon)}<span class="grow"><b>${escapeHtml(it.name)}</b> ×${n} <span class="bonus">${escapeHtml(bonusText(it.bonus))}</span>${statPreview(m, slot, id)}</span>
          <button class="item-btn" onclick="menuEquipSet('${m.id}','${slot}','${id}')">장착</button></div>`;
      }).join("");
    return `<div class="equip-slot">
      <div class="equip-cur"><span class="slot-label">${SLOT_INFO[slot].label}</span>
        ${cur ? `${iconTag(cur.icon, "ico big")}<span class="grow"><b>${escapeHtml(cur.name)}</b><br><span class="bonus">${escapeHtml(bonusText(cur.bonus))}</span></span>
          <button class="item-btn" onclick="menuEquipSet('${m.id}','${slot}','')">해제</button>`
        : `<span class="grow muted">없음</span>`}</div>
      ${options ? `<div class="equip-opts">${options}</div>` : `<div class="muted small equip-none">가방에 바꿔 낄 수 있는 ${SLOT_INFO[slot].label}가 없습니다.</div>`}
    </div>`;
  }).join("");
  return picker + `<div class="card-title">${escapeHtml(memberName(m))} <small>${escapeHtml(m.role)}</small></div>${statGrid(m)}` + slots +
    `<p class="muted small">장비는 상점·대장간에서 사고, 캐릭터마다 장착할 수 있는 무기·방어구가 다릅니다. 대장간 강화는 파티 전원의 무기·방어구에 더해집니다.</p>`;
}

// 바꿔 끼우면 5스탯이 어떻게 달라지는지 (달라지는 것만)
function statPreview(m, slot, itemId) {
  const def = memberDef(m.id);
  const now = calcMemberStats(def, player.lv, m.equip);
  const next = calcMemberStats(def, player.lv, Object.assign({}, m.equip, { [slot]: itemId }));
  const diff = STAT_KEYS.filter(k => next[k] !== now[k]).map(k => `<span class="${next[k] > now[k] ? "up" : "down"}">${STAT_INFO[k].label} ${now[k]}→${next[k]}</span>`);
  return diff.length ? `<br><span class="small preview">${diff.join(" ")}</span>` : "";
}

function menuEquipSet(memberId, slot, itemId) {
  if (!equipItem(memberId, slot, itemId)) { SFX.error(); return; }
  SFX.confirm();
  const m = partyMember(memberId);
  showToast(itemId ? `🛡️ ${memberName(m)}: ${GameData.items.items[itemId].name} 장착` : `${memberName(m)}: ${SLOT_INFO[slot].label} 해제`);
  updateHUD();
  renderMenu();
}

// ---------- 스킬 ----------
const SKILL_KIND = { physical: "물리", magic: "마법", heal: "회복", guard: "방어" };
const SKILL_TARGET = { enemy: "적 하나", all_enemies: "적 전체", ally: "아군 하나", all_allies: "아군 전체" };

function menuSkills() {
  const picker = charPicker();
  const m = partyMember(menuChar);
  if (!m) return picker;
  const list = skillsOf(m).map(s => {
    let use = "";
    if (s.type === "heal") { // 필드에서 쓸 수 있는 스킬만 사용 버튼
      use = s.target === "all_allies"
        ? `<button class="item-btn" onclick="useFieldSkill('${m.id}','${s.id}','')" ${m.mp < s.mp ? "disabled" : ""}>사용</button>`
        : activeParty().map(t => `<button class="item-btn" onclick="useFieldSkill('${m.id}','${s.id}','${t.id}')" ${m.mp < s.mp ? "disabled" : ""}>${escapeHtml(memberName(t))}</button>`).join("");
    }
    return `<div class="item-row">${iconTag(s.icon, "ico big")}<div class="grow"><b>${escapeHtml(s.name)}</b> <small class="mp-cost">MP ${s.mp || 0}</small>
        <span class="tag none">${SKILL_KIND[s.type] || s.type}</span><span class="tag none">${SKILL_TARGET[s.target] || ""}</span>
        <br><span class="muted small">${escapeHtml(s.desc || "")}</span>${s.type === "heal" ? `<br><span class="small field-ok">필드에서 사용 가능</span>` : ""}</div>
      <div class="btn-group wrap end">${use}</div></div>`;
  }).join("");
  return picker + `<div class="section-title">${escapeHtml(memberName(m))}의 스킬 <small>MP ${m.mp}/${m.maxMp}</small></div>${list}`;
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
  updateHUD();
  renderMenu();
}

// ---------- 퀘스트 ----------
function menuQuests() {
  const fq = focusedQuest();
  const block = (title, list, done) => `<div class="section-title">${title} <small>${list.length}</small></div>` +
    (list.length ? list.map(q => `<div class="quest-card${done ? " done" : ""}"><span class="tag ${q.type}">${q.type === "main" ? "메인" : "서브"}</span>
      <b>${escapeHtml(fmt(q.title))}</b>${!done ? (q === fq ? ` <span class="leader-badge">🎯 추적 중</span>` : ` <button class="item-btn" onclick="focusQuest('${q.id}'); renderMenu()">🎯 추적하기</button>`) : ""}
      <p>${escapeHtml(fmt(q.desc)).replace(/\n/g, "<br>")}</p></div>`).join("")
      : `<p class="muted small">없음</p>`);
  return `<div class="muted small">추적 중인 퀘스트는 화면 왼쪽 위에 한 줄로 표시됩니다.</div>` +
    block("진행 중", questsByState("active"), false) + block("완료", questsByState("done"), true);
}

// ---------- 설정 (게임 중: 메뉴의 설정 탭 / 타이틀: 설정 창) ----------
// 순서: 저장/로드 · 타이틀로 (게임 중만) → 사운드 → 화면 모드 → 화면 크기 → 가상 패드 · 맵 크기 → 계정 · AI
function btnRow(list, current, onclick) {
  return list.map(o => `<button class="item-btn${String(o.id) === String(current) ? " on" : ""}" onclick="${onclick(o)}">${o.label}</button>`).join("");
}

function menuSettings(inGame) {
  const views = GameData.game.views.map(v => ({ id: v.cols, label: `${v.label} (${v.cols}칸)` }));
  const s = AudioSys.settings, d = Display.settings;
  const vol = (kind, label) => {
    const muted = isMuted(kind);
    return `<div class="setting-row"><label>${label}</label>
    <input type="range" min="0" max="100" value="${Math.round(s[kind] * 100)}" oninput="setVolume('${kind}', this.value/100); this.nextElementSibling.textContent=this.value" onchange="SFX.coin()"><span class="val">${Math.round(s[kind] * 100)}</span>
    <button class="item-btn mute-btn${muted ? " off" : ""}" onclick="settingsMute('${kind}')">${muted ? "🔇 꺼짐" : "🔊 켜짐"}</button></div>`;
  };
  const login = !window.cloud ? `<span class="muted">클라우드를 사용할 수 없습니다</span>`
    : cloudUser ? `<span>☁️ ${escapeHtml(cloudUser.displayName || cloudUser.email || "")} 로그인됨</span> <button class="item-btn" onclick="toggleLogin()">로그아웃</button>`
    : `<span class="muted">로그인하면 수동 저장과 클라우드 저장을 쓸 수 있습니다</span> <button class="item-btn" onclick="toggleLogin()">🔑 Google 로그인</button>`;
  const curSize = sizeLabel(Display.scale);
  return `
    ${inGame ? `<div class="setting-row top-actions">
      <button class="item-btn big" onclick="openSaveWindow('save')">💾 저장</button>
      <button class="item-btn big" onclick="openSaveWindow('load')">📂 로드</button>
      <button class="item-btn big" onclick="returnToTitle()">🏠 타이틀로</button></div>` : ""}
    <div class="section-title">사운드</div>
    ${vol("master", "전체")}${vol("bgm", "배경음")}${vol("sfx", "효과음")}
    <div class="section-title">화면 모드 <small>지금: ${(DISPLAY_MODES.find(m => m.id === d.mode) || {}).label || ""}</small></div>
    <div class="btn-group wrap">${btnRow(DISPLAY_MODES, d.mode, o => `setDisplaySetting('mode','${o.id}').then(rerenderSettingsIfOpen)`)}</div>
    <div class="section-title">화면 크기 <small>지금 ${curSize}${d.size === "fit" ? " (창에 맞춤)" : ""}</small></div>
    <div class="btn-group wrap">${btnRow(displaySizes(), d.size, o => `setDisplaySetting('size','${o.id}'); rerenderSettingsIfOpen()`)}</div>
    <div class="section-title">가상 패드 <small>PC: 화면 아래 · 모바일: 필드 위에 겹쳐 표시(전투·대화 중 숨김)</small></div>
    <div class="btn-group wrap">${btnRow(DISPLAY_PADS, d.pad, o => `setDisplaySetting('pad','${o.id}'); rerenderSettingsIfOpen()`)}</div>
    <div class="section-title">화면에 보이는 맵 크기</div>
    <div class="btn-group wrap">${btnRow(views, View.cols, o => `changeView(${o.id})`)}</div>
    <div class="section-title">계정 · AI</div>
    <div class="setting-row wrap">${login}</div>
    ${cloudUser ? `<div class="setting-row wrap">${playerIdHtml()}</div>` : ""}
    <div class="setting-row"><button class="item-btn" onclick="openAIMenu()">🤖 AI 연결 (Claude · Gemini · ChatGPT)</button></div>`;
}

function settingsMute(kind) {
  initAudio();
  const off = toggleMute(kind);
  SFX.cursor();
  showToast(`${{ master: "전체 소리", bgm: "배경음", sfx: "효과음" }[kind]} ${off ? "끔" : "켬"}`);
  updateHUD();
  rerenderSettingsIfOpen();
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
