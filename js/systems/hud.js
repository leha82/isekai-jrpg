// ==========================================
// HUD & 메뉴
//  - 좌상단: 리더(맵을 걷는 캐릭터) 초상화·이름·레벨·HP/MP·EXP 게이지(숫자 없음) — 반투명 창
//            나머지 동료 HP/MP — 배경 없음 / 추적 중인 퀘스트 한 줄(▼ 펼치면 내용 + 다른 퀘스트 목록)
//  - 우상단: 아이콘 메뉴 (파티 P, 가방 I, 장비 E, 스킬 S, 퀘스트 Q, 지도 M, 저장 F, 소리 N, 설정 O)
//  - 메뉴 탭: 파티 · 가방 · 장비 · 스킬 · 퀘스트 · 지도 · 설정 (지도는 js/systems/worldmap.js)
//  - 글자 버튼에는 아이콘을 넣지 않는다. 아이콘 버튼(HUD·소리 켜기/끄기·가방 칸)은 글자를 넣지 않는다.
//  - 확인 버튼 없는 설명 팝업: showPop (js/core/ui.js) — 스탯 설명, 가방 아이템 설명·메뉴
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
let menuChar = "";          // 가방·장비·스킬 탭에서 고른 캐릭터 id (가방: 아이템을 쓸 대상, 스킬: 시전자)
let partyOrderEdit = null;  // 파티 순서 변경 모드: 저장 전 순서(합류 멤버 id 배열). null 이면 보통 모드
let skillPick = "";         // 스킬 탭: 대상 고르는 중인 스킬 id (왼쪽에 대상 캐릭터 목록이 뜬다)
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

// 창을 닫거나 다른 탭으로 가면 저장하지 않은 파티 순서·스킬 대상 고르기는 버린다
function resetMenuModes() { partyOrderEdit = null; skillPick = ""; }

function renderMenu() {
  if (menuTab !== "party") partyOrderEdit = null;
  if (menuTab !== "skills") skillPick = "";
  const html = { party: menuParty, items: menuItems, equip: menuEquip, skills: menuSkills, quests: menuQuests,
                 map: menuMap, settings: () => menuSettings(true) }[menuTab]();
  openWindow("메뉴", html, { kind: "menu", tabs: MENU_TABS, active: menuTab, onTab: (t) => { menuTab = t; renderMenu(); }, onClose: resetMenuModes });
  if (menuTab === "map") drawMapTab();
}

function bar(cls, v, max) { return `<span class="bar ${cls}"><i style="width:${pct(v, max)}"></i></span>`; }

// ---------- 능력치 표시 · 설명 팝업 ----------
// 5스탯(STR·DEX·AGI·CON·INT)과 계산값(공격력·마력·방어력·치명타·회피). 칸을 누르면 확인 버튼 없는 설명 팝업이 뜬다.
const DERIVED_KEYS = ["atk", "matk", "def", "crit", "evade"];
const DERIVED_INFO = {
  atk: { label: "공격력", desc: "물리 공격·물리 스킬의 피해. 적의 방어력만큼 줄어든다." },
  matk: { label: "마력", desc: "마법 피해와 회복 스킬의 회복량." },
  def: { label: "방어력", desc: "적에게 받는 피해를 줄인다." },
  crit: { label: "치명타", desc: "공격이 치명타가 될 확률. 치명타는 피해가 커진다." },
  evade: { label: "회피", desc: "적의 물리 공격을 피할 확률." }
};
const pctText = (v) => `${Math.round(v * 1000) / 10}%`;
function derivedValue(m, k) { return k === "crit" || k === "evade" ? pctText(m[k] || 0) : (m[k] || 0); }

function statGrid(m) {
  return `<div class="stat5">${STAT_KEYS.map(k => `<button class="stat-cell" onclick="statPop(this,'${m.id}','${k}')"><em>${STAT_INFO[k].label}</em><b>${m[k]}</b></button>`).join("")}</div>
    <div class="stat5 derived">${DERIVED_KEYS.map(k => `<button class="stat-cell" onclick="statPop(this,'${m.id}','${k}')"><em>${DERIVED_INFO[k].label}</em><b>${derivedValue(m, k)}</b></button>`).join("")}</div>`;
}

// 스탯 하나의 구성: 기본·레벨 성장 + 장비 보너스
function statParts(m, k) {
  const bonus = equipBonus(m.equip)[k] || 0;
  return { base: m[k] - bonus, equip: bonus };
}

function statPop(el, memberId, k) {
  const m = partyMember(memberId);
  if (!m) return;
  const r = statRules(), u = GameData.battle.upgrade || {};
  const plus = (v) => (v >= 0 ? `+${v}` : `${v}`);
  let title, lines = [];
  if (STAT_KEYS.includes(k)) {
    const inf = STAT_INFO[k], p = statParts(m, k);
    title = `${inf.label} · ${inf.name} <b>${m[k]}</b>`;
    lines.push(`기본·레벨 ${p.base}${p.equip ? ` · 장비 ${plus(p.equip)}` : ""}`);
    const eff = {
      str: [`공격력 +${r.atkPerStr} (1당)`],
      dex: [`치명타 +${pctText(r.critPerDex)} · 회피 +${pctText(r.evadePerDex)} (1당)`],
      agi: [`회피 +${pctText(r.evadePerAgi)} · 치명타 +${pctText(r.critPerAgi)} (1당)`],
      con: [`최대 HP +${r.hpPerCon} · 방어력 +${r.defPerCon} (1당)`],
      int: [`최대 MP +${r.mpPerInt} · 마력 +${r.matkPerInt} (1당)`]
    }[k];
    lines = lines.concat(eff);
  } else {
    const inf = DERIVED_INFO[k];
    title = `${inf.label} <b>${derivedValue(m, k)}</b>`;
    lines.push(inf.desc);
    const b = equipBonus(m.equip);
    const wl = player.weaponLv - 1, al = player.armorLv - 1;
    const parts = [];
    if (k === "atk") { parts.push(`STR ${m.str}×${r.atkPerStr}`, `장비 ${plus(b.atk || 0)}`, `대장간 ${plus(wl * (u.weaponAtk || 0))}`); }
    if (k === "matk") { parts.push(`INT ${m.int}×${r.matkPerInt}`, `장비 ${plus(b.matk || 0)}`, `대장간 ${plus(wl * (u.weaponMatk || 0))}`); }
    if (k === "def") { parts.push(`CON ${m.con}×${r.defPerCon}`, `장비 ${plus(b.def || 0)}`, `대장간 ${plus(al * (u.armorDef || 0))}`); }
    if (k === "crit") { parts.push(`기본 ${pctText(r.critBase)}`, `DEX ${m.dex}×${pctText(r.critPerDex)}`, `AGI ${m.agi}×${pctText(r.critPerAgi)}`, `최대 ${pctText(r.maxCrit || 0.5)}`); }
    if (k === "evade") { parts.push(`AGI ${m.agi}×${pctText(r.evadePerAgi)}`, `DEX ${m.dex}×${pctText(r.evadePerDex)}`, `최대 ${pctText(r.maxEvade || 0.35)}`); }
    lines.push(`구성: 기본·레벨 + ${parts.join(" + ")}`);
  }
  SFX.cursor();
  showPop(`<div class="pop-title">${title}</div>${lines.map(l => `<div class="pop-line">${escapeHtml(l)}</div>`).join("")}`, el);
}

// ---------- 캐릭터 고르기 (가방·장비·스킬 공용, 파티 창과 같은 모양의 작은 카드) ----------
function charPicker(label = "") {
  const act = activeParty();
  if (!act.some(m => m.id === menuChar)) menuChar = act[0] ? act[0].id : "";
  return `${label ? `<div class="picker-label">${label}</div>` : ""}<div class="char-picker">${act.map(m => `
    <button class="char-card${m.id === menuChar ? " on" : ""}" onclick="pickMenuChar('${m.id}')">
      <img src="${portraitUrl(m.portrait) || ""}" alt="">
      <span class="cc-body"><b>${escapeHtml(memberName(m))}</b><small>${escapeHtml(m.role)}</small>
        <span class="cc-bar">${bar("hp", m.hp, m.maxHp)}<i>${Math.max(0, m.hp)}/${m.maxHp}</i></span>
        <span class="cc-bar">${bar("mp", m.mp, m.maxMp)}<i>${m.mp}/${m.maxMp}</i></span></span>
    </button>`).join("")}</div>`;
}
function pickMenuChar(id) { menuChar = id; skillPick = ""; SFX.cursor(); renderMenu(); }

// ---------- 파티 ----------
function menuParty() {
  const editing = !!partyOrderEdit;
  const list = editing ? partyOrderEdit.map(partyMember).filter(Boolean) : activeParty();
  const orderBtn = activeParty().length > 1
    ? `<button class="item-btn${editing ? " on" : ""}" onclick="${editing ? "partyOrderDone()" : "partyOrderStart()"}">${editing ? "완료" : "순서 변경"}</button>` : "";
  return `<div class="party-head"><span class="gear-line">파티 Lv.${player.lv} · ${player.gold.toLocaleString()}G · 대장간 강화 무기 Lv.${player.weaponLv} · 방어구 Lv.${player.armorLv}</span>${orderBtn}</div>
    <div class="muted small">${editing ? "화살표로 순서를 바꾸고 <b>완료</b>를 누르면 저장됩니다. 맨 위 캐릭터가 리더입니다." : "맨 위 캐릭터가 <b>리더</b>로 맵을 걸어 다니고, 전투 행동도 이 순서입니다. 능력치를 누르면 설명이 나옵니다."}</div>` +
    list.map((m, i) => {
      const def = memberDef(m.id);
      const pic = portraitUrl(m.portrait);
      const order = editing ? `<div class="order-btns">
          <button class="item-btn" title="위로" onclick="partyDraftMove('${m.id}',-1)" ${i === 0 ? "disabled" : ""}>▲</button>
          <button class="item-btn" onclick="partyDraftMove('${m.id}','top')" ${i === 0 ? "disabled" : ""}>리더</button>
          <button class="item-btn" title="아래로" onclick="partyDraftMove('${m.id}',1)" ${i === list.length - 1 ? "disabled" : ""}>▼</button></div>` : "";
      return `<div class="card${editing ? " editing" : ""}">
        <div class="card-side">
          ${pic ? `<img class="card-portrait" src="${pic}" alt="">` : ""}
          <button class="item-btn" onclick="openMenu('equip','${m.id}')">장비</button>
          <button class="item-btn" onclick="openMenu('skills','${m.id}')">스킬</button>
        </div>
        <div class="card-body">
          <div class="card-title">${escapeHtml(memberName(m))} <small>${escapeHtml(m.role)} · Lv.${player.lv}</small>${i === 0 ? `<span class="leader-badge">리더</span>` : ""}</div>
          <div class="stat-line"><span class="k">HP</span>${bar("hp", m.hp, m.maxHp)} ${Math.max(0, m.hp)}/${m.maxHp}</div>
          <div class="stat-line"><span class="k">MP</span>${bar("mp", m.mp, m.maxMp)} ${m.mp}/${m.maxMp}</div>
          <div class="stat-line"><span class="k">EXP</span>${bar("exp", player.exp, player.nextExp)} ${player.exp}/${player.nextExp}</div>
          ${statGrid(m)}
          <div class="muted small">${escapeHtml(fmt(def ? def.desc : ""))}</div>
        </div>${order}</div>`;
    }).join("");
}

function partyOrderStart() { partyOrderEdit = activeParty().map(m => m.id); SFX.cursor(); renderMenu(); }

// 순서 변경 모드에서는 초안만 바꾼다 (완료를 누르기 전에는 실제 파티 순서가 그대로)
function partyDraftMove(id, delta) {
  const o = partyOrderEdit;
  if (!o) return;
  const i = o.indexOf(id);
  const j = delta === "top" ? 0 : i + delta;
  if (i < 0 || j < 0 || j >= o.length || j === i) return;
  o.splice(j, 0, o.splice(i, 1)[0]);
  SFX.cursor();
  renderMenu();
}

function partyOrderDone() {
  const before = leader();
  if (partyOrderEdit) setPartyOrder(partyOrderEdit);
  partyOrderEdit = null;
  SFX.confirm();
  if (leader() !== before) showToast(`${memberName(leader())}이(가) 리더가 되었습니다.`);
  updateHUD();
  renderMenu();
}

// ---------- 가방 ----------
const ITEM_KIND = { heal_hp: "회복", heal_mp: "회복", key: "퀘스트", map: "지도", weapon: "무기", armor: "방어구", accessory: "장신구" };
const ITEM_ORDER = { heal_hp: 0, heal_mp: 1, weapon: 2, armor: 3, accessory: 4, map: 5, key: 6 };
const isUsableItem = (it) => !!it && (it.type === "heal_hp" || it.type === "heal_mp");

function bagItems() {
  return Object.entries(player.inventory).filter(([id, n]) => n > 0 && GameData.items.items[id])
    .map(([id, n]) => ({ id, n, it: GameData.items.items[id] }))
    .sort((a, b) => (ITEM_ORDER[a.it.type] ?? 9) - (ITEM_ORDER[b.it.type] ?? 9));
}

// 격자: 아이콘 + 개수. 누르면 설명·메뉴 팝업, 두 번 누르면(더블클릭) 위에서 고른 캐릭터에게 바로 사용
function menuItems() {
  const items = bagItems();
  const cells = items.map(({ id, n, it }) => `<button class="bag-cell${isUsableItem(it) ? " usable" : ""}" onclick="bagPop(this,'${id}')" ondblclick="bagUse('${id}')" title="${escapeHtml(it.name)}">
      ${it.icon ? `<img src="${it.icon}" alt="">` : `<span class="no-ico">${escapeHtml(it.name.slice(0, 2))}</span>`}<span class="cnt">${n}</span></button>`).join("");
  return charPicker("사용할 캐릭터") + `<div class="gear-line">${player.gold.toLocaleString()} G · 아이템을 누르면 설명, 두 번 누르면 고른 캐릭터에게 사용</div>` +
    (cells ? `<div class="bag-grid">${cells}</div>` : `<p class="muted">가방이 비어 있습니다.</p>`);
}

function bagPop(el, id) {
  const it = GameData.items.items[id];
  if (!it) return;
  const m = partyMember(menuChar);
  const n = player.inventory[id] || 0;
  let extra = "", btns = "";
  if (isUsableItem(it)) {
    btns = `<button class="item-btn" onclick="bagUse('${id}')">사용</button><span class="muted small">대상: ${escapeHtml(m ? memberName(m) : "-")}</span>`;
  } else if (isEquipItem(it)) {
    const who = it.for && it.for.length ? it.for.map(c => { const d = memberDef(c); return d ? fmt(d.name) : c; }).join("·") : "누구나";
    extra = `<div class="pop-line bonus">${escapeHtml(bonusText(it.bonus))}</div><div class="pop-line muted">장착: ${escapeHtml(who)}</div>`;
    const target = m && canEquip(m, id) ? m.id : "";
    btns = `<button class="item-btn" onclick="closePop(); openMenu('equip'${target ? `,'${target}'` : ""})">장비 메뉴</button>`;
  } else if (it.type === "map") {
    extra = `<div class="pop-line muted">지역: ${escapeHtml(mapItemNodes(it).map(nid => (GameData.maps[nid] || {}).name || nid).join(" · "))}</div>`;
    btns = `<button class="item-btn" onclick="closePop(); mapRegion='${id}'; openMenu('map')">지도 보기</button>`;
  }
  SFX.cursor();
  showPop(`<div class="pop-title">${iconTag(it.icon)}${escapeHtml(it.name)} <small>×${n}</small> <span class="tag ${it.type === "key" || it.type === "map" ? "key" : "none"}">${ITEM_KIND[it.type] || it.type}</span></div>
    <div class="pop-line">${escapeHtml(it.desc || "")}</div>${extra}${btns ? `<div class="pop-btns">${btns}</div>` : ""}`, el);
}

// 더블클릭·사용 버튼: 쓸 수 있는 아이템이면 고른 캐릭터에게 사용, 아니면 아무 일도 없다
function bagUse(id) {
  const it = GameData.items.items[id];
  if (!isUsableItem(it)) return;
  useFieldItem(id, menuChar);
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
  updateHUD();
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
        ${cur ? `${iconTag(cur.icon, "ico big")}<span class="grow"><b>${escapeHtml(cur.name)}</b><br><span class="bonus">${escapeHtml(bonusText(cur.bonus))}</span>${statPreview(m, slot, "")}</span>
          <button class="item-btn" onclick="menuEquipSet('${m.id}','${slot}','')">해제</button>`
        : `<span class="grow muted">없음</span>`}</div>
      ${options ? `<div class="equip-opts">${options}</div>` : `<div class="muted small equip-none">가방에 바꿔 낄 수 있는 ${SLOT_INFO[slot].label}가 없습니다.</div>`}
    </div>`;
  }).join("");
  return picker + `<div class="card-title">${escapeHtml(memberName(m))} <small>${escapeHtml(m.role)} · HP ${m.maxHp} · MP ${m.maxMp}</small></div>${statGrid(m)}` + slots +
    `<p class="muted small">장비는 상점·대장간에서 사고, 캐릭터마다 장착할 수 있는 무기·방어구가 다릅니다. 대장간 강화는 파티 전원의 무기·방어구에 더해집니다.</p>`;
}

// 바꿔 끼우면(itemId "" = 해제) 능력치가 어떻게 달라지는지 (달라지는 것만)
const PREVIEW_KEYS = [...STAT_KEYS, "maxHp", "maxMp", "atk", "matk", "def", "crit", "evade"];
const PREVIEW_LABEL = (k) => STAT_INFO[k] ? STAT_INFO[k].label : DERIVED_INFO[k] ? DERIVED_INFO[k].label : { maxHp: "HP", maxMp: "MP" }[k];
function statPreview(m, slot, itemId) {
  const def = memberDef(m.id);
  const now = calcMemberStats(def, player.lv, m.equip);
  const next = calcMemberStats(def, player.lv, Object.assign({}, m.equip, { [slot]: itemId }));
  const show = (k, v) => (k === "crit" || k === "evade" ? pctText(v) : v);
  const diff = PREVIEW_KEYS.filter(k => Math.abs(next[k] - now[k]) > 1e-9).map(k => `<span class="${next[k] > now[k] ? "up" : "down"}">${PREVIEW_LABEL(k)} ${show(k, now[k])}→${show(k, next[k])}</span>`);
  return diff.length ? `<br><span class="small preview">${itemId ? "" : "해제하면 "}${diff.join(" ")}</span>` : "";
}

// 장착·해제는 메시지 없이 바로 능력치에 반영된다
function menuEquipSet(memberId, slot, itemId) {
  if (!equipItem(memberId, slot, itemId)) { SFX.error(); return; }
  SFX.confirm();
  updateHUD();
  renderMenu();
}

// ---------- 스킬 ----------
const SKILL_KIND = { physical: "물리", magic: "마법", heal: "회복", guard: "방어" };
const SKILL_TARGET = { enemy: "적 하나", all_enemies: "적 전체", ally: "아군 하나", all_allies: "아군 전체" };
const fieldUsable = (s) => s.type === "heal"; // 필드에서 쓸 수 있는 스킬 (회복)

function menuSkills() {
  const picker = charPicker("시전자");
  const m = partyMember(menuChar);
  if (!m) return picker;
  const skills = skillsOf(m);
  const picking = skills.find(s => s.id === skillPick && fieldUsable(s));
  if (!picking) skillPick = "";
  const list = skills.map(s => {
    const use = fieldUsable(s)
      ? `<button class="item-btn${s.id === skillPick ? " on" : ""}" onclick="skillUseClick('${s.id}')" ${m.mp < s.mp ? "disabled" : ""}>사용</button>` : "";
    return `<div class="item-row${s.id === skillPick ? " picking" : ""}">${iconTag(s.icon, "ico big")}<div class="grow"><b>${escapeHtml(s.name)}</b> <small class="mp-cost">MP ${s.mp || 0}</small>
        <span class="tag none">${SKILL_KIND[s.type] || s.type}</span><span class="tag none">${SKILL_TARGET[s.target] || ""}</span>
        <br><span class="muted small">${escapeHtml(s.desc || "")}</span>${fieldUsable(s) ? `<br><span class="small field-ok">필드에서 사용 가능</span>` : ""}</div>
      <div class="btn-group end">${use}</div></div>`;
  }).join("");
  // 사용을 누르면 왼쪽에 대상 캐릭터가 뜬다
  const targets = picking ? `<div class="skill-targets">
      <div class="section-title">${escapeHtml(picking.name)} 대상</div>
      ${activeParty().map(t => `<button class="target-card" onclick="useFieldSkill('${m.id}','${picking.id}','${t.id}')">
        <img src="${portraitUrl(t.portrait) || ""}" alt=""><span class="cc-body"><b>${escapeHtml(memberName(t))}</b>
        <span class="cc-bar">${bar("hp", t.hp, t.maxHp)}<i>${Math.max(0, t.hp)}/${t.maxHp}</i></span></span></button>`).join("")}
      <button class="item-btn ghost" onclick="skillPick=''; SFX.cancel(); renderMenu()">취소</button></div>` : "";
  return picker + `<div class="section-title">${escapeHtml(memberName(m))}의 스킬 <small>MP ${m.mp}/${m.maxMp}</small></div>
    <div class="skill-wrap">${targets}<div class="skill-list">${list}</div></div>`;
}

function skillUseClick(skillId) {
  const c = partyMember(menuChar), s = GameData.skills[skillId];
  if (!c || !s || c.mp < s.mp) return;
  if (s.target === "all_allies") { useFieldSkill(c.id, skillId, ""); return; } // 전체 대상은 고를 필요 없이 바로
  skillPick = skillPick === skillId ? "" : skillId;
  SFX.cursor();
  renderMenu();
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
  skillPick = "";
  updateHUD();
  renderMenu();
}

// ---------- 퀘스트 ----------
function menuQuests() {
  const fq = focusedQuest();
  const block = (title, list, done) => `<div class="section-title">${title} <small>${list.length}</small></div>` +
    (list.length ? list.map(q => `<div class="quest-card${done ? " done" : ""}"><span class="tag ${q.type}">${q.type === "main" ? "메인" : "서브"}</span>
      <b>${escapeHtml(fmt(q.title))}</b>${!done ? (q === fq ? ` <span class="leader-badge">추적 중</span>` : ` <button class="item-btn" onclick="focusQuest('${q.id}'); renderMenu()">추적하기</button>`) : ""}
      <p>${escapeHtml(fmt(q.desc)).replace(/\n/g, "<br>")}</p></div>`).join("")
      : `<p class="muted small">없음</p>`);
  return `<div class="muted small">추적 중인 퀘스트는 화면 왼쪽 위에 한 줄로 표시됩니다.</div>` +
    block("진행 중", questsByState("active"), false) + block("완료", questsByState("done"), true);
}

// ---------- 설정 (게임 중: 메뉴의 설정 탭 / 타이틀: 설정 창) ----------
// 순서: 저장/로드 · 타이틀로 (게임 중만) → 사운드 → 화면 모드 → 화면 크기 → 가상 패드 · 맵 크기 → 계정 · AI
// 버튼은 글자만. 사운드의 켜짐/꺼짐만 아이콘 버튼(글자 없음, 파란색이 아닌 배경).
function btnRow(list, current, onclick) {
  return list.map(o => `<button class="item-btn${String(o.id) === String(current) ? " on" : ""}" onclick="${onclick(o)}">${o.label}</button>`).join("");
}

function menuSettings(inGame) {
  const views = GameData.game.views.map(v => ({ id: v.cols, label: v.label }));
  const s = AudioSys.settings, d = Display.settings;
  const vol = (kind, label) => {
    const muted = isMuted(kind);
    return `<div class="setting-row"><label>${label}</label>
    <input type="range" min="0" max="100" value="${Math.round(s[kind] * 100)}" oninput="setVolume('${kind}', this.value/100); this.nextElementSibling.textContent=this.value" onchange="SFX.coin()"><span class="val">${Math.round(s[kind] * 100)}</span>
    <button class="sound-btn${muted ? " off" : ""}" title="${label} ${muted ? "꺼짐 (누르면 켜기)" : "켜짐 (누르면 끄기)"}" onclick="settingsMute('${kind}')">${iconImg(muted ? "mute" : "sound")}</button></div>`;
  };
  const gIcon = `<img class="g-ico" src="assets/img/icons/google.svg" alt="Google">`;
  const login = !window.cloud ? `${gIcon}<span class="muted">클라우드를 사용할 수 없습니다</span>`
    : cloudUser ? `${gIcon}<span>${escapeHtml(cloudUser.displayName || cloudUser.email || "")} 로그인됨</span> <button class="item-btn" onclick="toggleLogin()">로그아웃</button>`
    : `${gIcon}<span class="muted">로그인하면 수동 저장과 클라우드 저장을 쓸 수 있습니다</span> <button class="item-btn" onclick="toggleLogin()">Google 로그인</button>`;
  const curSize = sizeLabel(Display.scale);
  return `
    ${inGame ? `<div class="setting-row top-actions">
      <button class="item-btn big" onclick="openSaveWindow('save')">저장</button>
      <button class="item-btn big" onclick="openSaveWindow('load')">로드</button>
      <button class="item-btn big" onclick="returnToTitle()">타이틀로</button></div>` : ""}
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
    <div class="setting-row wrap"><span>AI : <b class="ai-now">${escapeHtml(AI.label())}</b></span><button class="item-btn" onclick="openAIMenu()">AI 연결</button></div>`;
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
  openWindow("설정", menuSettings(false), { kind: "settings" });
}

// 설정 창이 열려 있으면 다시 그린다 (로그인 상태·전체 화면 변경 등)
function rerenderSettingsIfOpen() {
  if (modalOpen("settings")) openWindow("설정", menuSettings(false), { kind: "settings" });
  else if (modalOpen("menu") && menuTab === "settings") renderMenu();
}

function changeView(cols) { setViewCols(cols); SFX.cursor(); rerenderSettingsIfOpen(); }

async function returnToTitle() {
  if (!(await uiConfirm("타이틀로 돌아갈까요?\n마지막 저장 이후의 진행은 사라집니다.", { ok: "타이틀로" }))) return;
  if (autoCloud.pending) await flushAutoCloud(); // 모아 둔 자동 저장을 클라우드에 보낸 뒤 이동
  location.reload();
}
