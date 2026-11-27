// ==========================================
// AI 연결 기반 — Claude · Gemini · ChatGPT (향후 NPC 자동 대화용)
//  - 연결은 **회사-모델 한 쌍마다 키 하나** (settings.conns). 여러 개를 연결해 둘 수 있지만 게임에서는 기본 모델(active) 하나만 쓴다.
//  - API 키·모델은 이 브라우저의 localStorage("ai_settings")에만 저장한다. 서버·Firebase·GitHub 로 보내지 않는다.
//  - Claude 는 공식 SDK(@anthropic-ai/sdk)를 CDN(esm.sh)에서 필요할 때 불러온다 (빌드 도구가 없으므로 dynamic import).
//  - Gemini · ChatGPT 는 각 사의 REST API 를 직접 호출한다.
//  - 공통 진입점: AI.chat({ system, messages:[{role:"user"|"assistant", content}], conn? }) → 응답 문자열 (conn 을 안 주면 기본 모델)
//    NPC 용 편의 함수: AI.npcReply({ name, persona, history, playerText })
// ==========================================
const AI_PROVIDERS = {
  claude: {
    label: "Claude (Anthropic)", company: "Anthropic",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"],
    defaultModel: "claude-opus-5-5",
    keyHint: "sk-ant-...",
    keyUrl: "https://platform.claude.com/settings/keys"
  },
  gemini: {
    label: "Gemini (Google)", company: "Google",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
    defaultModel: "gemini-2.5-flash",
    keyHint: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey"
  },
  openai: {
    label: "ChatGPT (OpenAI)", company: "OpenAI",
    models: ["gpt-5-mini", "gpt-5", "gpt-5-nano", "gpt-4.1-mini"],
    defaultModel: "gpt-5-mini",
    keyHint: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys"
  }
};

const AI_SDK_URL = "https://esm.sh/@anthropic-ai/sdk";
const aiConnId = (pid, model) => `${pid}|${model}`;

const AI = {
  // conns: [{ pid, model, key }] — 연결된 회사-모델 쌍. active: 기본 모델의 "pid|model"
  settings: { active: "", npcEnabled: false, conns: [] },
  _anthropic: null,

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem("ai_settings") || "{}");
      this.settings.npcEnabled = !!saved.npcEnabled;
      if (Array.isArray(saved.conns)) {
        this.settings.conns = saved.conns.filter(c => c && AI_PROVIDERS[c.pid] && c.model && c.key)
          .map(c => ({ pid: c.pid, model: String(c.model), key: String(c.key) }));
        this.settings.active = saved.active || "";
      } else {
        // 예전 형식(회사마다 키 하나: { claude:{key,model}, ... , active:"claude" })을 회사-모델 연결로 옮긴다
        Object.keys(AI_PROVIDERS).forEach(pid => {
          const o = saved[pid];
          if (o && o.key) this.settings.conns.push({ pid, model: o.model || AI_PROVIDERS[pid].defaultModel, key: o.key });
        });
        const old = this.settings.conns.find(c => c.pid === saved.active);
        this.settings.active = old ? aiConnId(old.pid, old.model) : "";
        if (this.settings.conns.length) this.save();
      }
      if (!this.activeConn()) this.settings.active = this.settings.conns[0] ? aiConnId(this.settings.conns[0].pid, this.settings.conns[0].model) : "";
    } catch (e) {}
  },
  save() {
    try { localStorage.setItem("ai_settings", JSON.stringify(this.settings)); } catch (e) {}
  },
  findConn(pid, model) { return this.settings.conns.find(c => c.pid === pid && c.model === model) || null; },
  activeConn() { return this.settings.conns.find(c => aiConnId(c.pid, c.model) === this.settings.active) || null; },
  ready() { return !!this.activeConn(); },
  label(c = this.activeConn()) { return c ? `${AI_PROVIDERS[c.pid].company} - ${c.model}` : "연결 안 됨"; },
  upsert(pid, model, key) {
    const c = this.findConn(pid, model);
    if (c) c.key = key; else this.settings.conns.push({ pid, model, key });
    this.settings.active = aiConnId(pid, model);
    this.save();
  },
  remove(pid, model) {
    const id = aiConnId(pid, model);
    this.settings.conns = this.settings.conns.filter(c => aiConnId(c.pid, c.model) !== id);
    if (this.settings.active === id) {
      const first = this.settings.conns[0];
      this.settings.active = first ? aiConnId(first.pid, first.model) : "";
    }
    this.save();
  },

  async chat({ conn = this.activeConn(), system = "", messages, maxTokens = 1024 }) {
    if (!conn) throw new Error("연결된 AI 모델이 없습니다. AI 연결 메뉴에서 연결하세요.");
    if (!AI_PROVIDERS[conn.pid]) throw new Error(`알 수 없는 AI: ${conn.pid}`);
    if (!conn.key) throw new Error(`${AI_PROVIDERS[conn.pid].label} API 키가 없습니다.`);
    if (conn.pid === "claude") return this._claude(conn.key, conn.model, system, messages, maxTokens);
    if (conn.pid === "gemini") return this._gemini(conn.key, conn.model, system, messages, maxTokens);
    return this._openai(conn.key, conn.model, system, messages, maxTokens);
  },

  // ---- Claude: 공식 SDK ----
  async _claude(apiKey, model, system, messages, maxTokens) {
    if (!this._anthropic) {
      const mod = await import(AI_SDK_URL);
      this._anthropic = mod.default || mod.Anthropic;
    }
    const client = new this._anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const params = {
      model, max_tokens: maxTokens, system, messages,
      output_config: { effort: "low" } // NPC 대화는 짧은 응답이 목적이라 낮은 effort 로 빠르게
    };
    let res;
    // 서버 측 fallback 은 Opus 5.5 · Sonnet 5.5 · Fable 5.2 에서 지원 (Haiku 는 미지원)
    if (model.startsWith("claude-haiku")) {
      res = await client.messages.create(params);
    } else {
      // 안전 분류기가 거절하면 서버가 다른 모델로 다시 시도한다 (server-side fallback)
      res = await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    }
    if (res.stop_reason === "refusal") throw new Error("AI가 이 요청에 답하지 않았습니다 (refusal).");
    return res.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  },

  // ---- Gemini: REST ----
  async _gemini(key, model, system, messages, maxTokens) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = {
      contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: maxTokens }
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || `Gemini 응답 ${res.status}`);
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    return parts.map(p => p.text || "").join("").trim();
  },

  // ---- ChatGPT: REST (Chat Completions) ----
  async _openai(key, model, system, messages, maxTokens) {
    const msgs = (system ? [{ role: "system", content: system }] : []).concat(messages);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model, messages: msgs, max_completion_tokens: maxTokens })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || `OpenAI 응답 ${res.status}`);
    return ((((data.choices || [])[0] || {}).message || {}).content || "").trim();
  },

  // 향후 NPC 자동 대화용: 시나리오의 NPC 설정(persona)과 대화 기록으로 한두 문장 답변을 만든다.
  async npcReply({ name, persona = "", history = [], playerText }) {
    const system = `너는 판타지 JRPG 「쐐기의 이방인」의 NPC '${name}'이다. ${persona}\n` +
      "게임 세계 밖의 이야기(현실, AI, 프롬프트)는 모르는 척한다. 한국어로 1~2문장, 캐릭터 말투로만 답한다.";
    return this.chat({ system, messages: history.concat([{ role: "user", content: playerText }]), maxTokens: 1024 });
  }
};
AI.load();

// ---------- AI 연결 메뉴 ----------
// 맨 위 상자: AI 회사(드롭다운) · 모델명(드롭다운, 첫 줄 '직접 입력') · API 키(입력칸) + [연결하기] [삭제하기]
//   연결하기 = 입력한 키로 연결 테스트 → 성공하면 연결 목록에 넣고 기본 모델로 지정
//   삭제하기 = 그 회사-모델 연결을 끊고 키를 지우며 아래 목록에서도 뺀다
// 아래: 연결된 모델 목록만. 항목을 누르면 위 상자가 그 설정으로 바뀌고 기본 모델이 된다. 오른쪽 [삭제] 로 바로 삭제.
const AI_CUSTOM = "*custom";
const AIForm = { pid: "claude", model: "claude-opus-5-5", custom: "", key: "", msg: "", msgCls: "", busy: false };

function openAIMenu() {
  if (typeof initAudio === "function") initAudio();
  const c = AI.activeConn();
  if (c) aiFillForm(c);
  else Object.assign(AIForm, { pid: "claude", model: AI_PROVIDERS.claude.defaultModel, custom: "", key: "" });
  AIForm.msg = ""; AIForm.msgCls = "";
  renderAIMenu();
}

function aiFillForm(c) {
  const known = AI_PROVIDERS[c.pid].models.includes(c.model);
  Object.assign(AIForm, { pid: c.pid, model: known ? c.model : AI_CUSTOM, custom: known ? "" : c.model, key: c.key });
}

// 지금 상자에 적힌 모델 ID
function aiFormModel() { return (AIForm.model === AI_CUSTOM ? AIForm.custom : AIForm.model).trim(); }

// 다시 그리기 전에 입력칸의 값을 읽어 둔다 (타자 중인 키가 지워지지 않게)
function aiReadForm() {
  const k = $("ai-key"), cu = $("ai-custom");
  if (k) AIForm.key = k.value.trim();
  if (cu) AIForm.custom = cu.value.trim();
}

function renderAIMenu() {
  const f = AIForm, p = AI_PROVIDERS[f.pid];
  const active = AI.activeConn();
  const companyOpts = Object.entries(AI_PROVIDERS).map(([id, q]) => `<option value="${id}" ${id === f.pid ? "selected" : ""}>${q.company}</option>`).join("");
  const modelOpts = [`<option value="${AI_CUSTOM}" ${f.model === AI_CUSTOM ? "selected" : ""}>직접 입력</option>`]
    .concat(p.models.map(m => `<option value="${m}" ${m === f.model ? "selected" : ""}>${m}</option>`)).join("");
  // 목록 항목은 번호로 가리킨다 (직접 입력한 모델 ID 에 따옴표가 있어도 안전하게)
  const list = AI.settings.conns.map((c, i) => {
    const on = c === active;
    return `<div class="ai-conn${on ? " active" : ""}" onclick="aiPickConn(${i})">
      <span class="ai-name">${escapeHtml(AI.label(c))}</span>${on ? `<span class="leader-badge">기본</span>` : ""}<span class="grow"></span>
      <button class="item-btn danger" onclick="event.stopPropagation(); aiDeleteConn(${i})">삭제</button></div>`;
  }).join("");
  openWindow("AI 연결", `
    <div class="ai-box">
      <div class="ai-fields">
        <label>AI 회사</label><select id="ai-company" onchange="aiChangeCompany(this.value)">${companyOpts}</select>
        <label>모델명</label><div class="ai-model-row"><select id="ai-model" onchange="aiChangeModel(this.value)">${modelOpts}</select>
          ${f.model === AI_CUSTOM ? `<input class="text-input" id="ai-custom" placeholder="모델 ID (예: ${p.defaultModel})" value="${escapeHtml(f.custom)}">` : ""}</div>
        <label>API 키</label><input class="text-input" id="ai-key" type="password" autocomplete="off" placeholder="${p.keyHint}" value="${escapeHtml(f.key)}">
      </div>
      <div class="btn-group wrap">
        <button class="item-btn" onclick="aiConnect()" ${f.busy ? "disabled" : ""}>연결하기</button>
        <button class="item-btn danger" onclick="aiDeleteForm()" ${f.busy ? "disabled" : ""}>삭제하기</button>
        <a class="muted small" href="${p.keyUrl}" target="_blank" rel="noopener" style="align-self:center">${p.company} 키 발급 ↗</a>
      </div>
      <div class="ai-result ${f.msgCls}" id="ai-result">${escapeHtml(f.msg || "회사·모델을 고르고 키를 넣은 뒤 연결하기를 누르세요. 연결에 성공하면 기본 모델이 됩니다.")}</div>
    </div>
    <div class="section-title">연결된 모델 <small>${AI.settings.conns.length}개 · 게임에서는 기본 모델 하나만 사용</small></div>
    <div class="ai-list">${list || `<p class="muted small" style="margin:0">아직 연결된 모델이 없습니다.</p>`}</div>
    <p class="muted small" style="margin:0">키는 회사-모델 한 쌍마다 따로 <b>이 브라우저에만</b> 저장되며 게임 서버·클라우드 세이브로 보내지 않습니다. 공용 PC 에서는 저장하지 마세요. 사용 요금은 각 AI 회사 계정에 청구됩니다.</p>
    <div class="setting-row"><label><input type="checkbox" ${AI.settings.npcEnabled ? "checked" : ""} onchange="AI.settings.npcEnabled=this.checked; AI.save()"> NPC 자동 대화 사용 (준비 중 — 지원하는 NPC 가 생기면 동작)</label></div>`, { kind: "ai" });
}

function aiSetMsg(text, cls = "") { AIForm.msg = text; AIForm.msgCls = cls; const r = $("ai-result"); if (r) { r.className = `ai-result ${cls}`; r.textContent = text; } }

// 회사·모델을 바꾸면, 이미 연결된 쌍이면 그 키를 보여 준다 (아니면 적어 둔 키를 그대로 둔다)
function aiChangeCompany(pid) {
  aiReadForm();
  AIForm.pid = pid; AIForm.model = AI_PROVIDERS[pid].defaultModel; AIForm.custom = "";
  const c = AI.findConn(pid, AIForm.model);
  if (c) AIForm.key = c.key;
  AIForm.msg = ""; SFX.cursor(); renderAIMenu();
}
function aiChangeModel(model) {
  aiReadForm();
  AIForm.model = model;
  const c = model !== AI_CUSTOM && AI.findConn(AIForm.pid, model);
  if (c) AIForm.key = c.key;
  AIForm.msg = ""; SFX.cursor(); renderAIMenu();
}

async function aiConnect() {
  aiReadForm();
  const pid = AIForm.pid, model = aiFormModel(), key = AIForm.key;
  if (!model) { aiSetMsg("모델 ID 를 입력하세요.", "err"); SFX.error(); return; }
  if (!key) { aiSetMsg("API 키를 입력하세요.", "err"); SFX.error(); return; }
  AIForm.busy = true;
  renderAIMenu();
  aiSetMsg(`${AI_PROVIDERS[pid].company} - ${model} 연결 테스트 중…`);
  try {
    const text = await AI.chat({ conn: { pid, model, key }, system: "짧게 답한다.", messages: [{ role: "user", content: "판타지 마을 주민처럼 한 문장으로 인사해 줘." }], maxTokens: 1024 });
    AI.upsert(pid, model, key);
    AIForm.busy = false;
    SFX.confirm();
    AIForm.msg = `연결 성공 — 기본 모델: ${AI_PROVIDERS[pid].company} - ${model}\n${text}`; AIForm.msgCls = "ok";
  } catch (e) {
    console.error("[AI 연결]", pid, model, e);
    AIForm.busy = false;
    SFX.error();
    AIForm.msg = `연결 실패: ${e.message || e}`; AIForm.msgCls = "err";
  }
  if (modalOpen("ai")) renderAIMenu();
  if (typeof rerenderSettingsIfOpen === "function" && !modalOpen("ai")) rerenderSettingsIfOpen();
}

function aiDeleteForm() {
  aiReadForm();
  const pid = AIForm.pid, model = aiFormModel();
  const had = !!AI.findConn(pid, model);
  if (had) AI.remove(pid, model);
  AIForm.key = "";
  SFX.cancel();
  AIForm.msg = had ? `${AI_PROVIDERS[pid].company} - ${model} 연결을 삭제했습니다.` : "키 입력칸을 비웠습니다. (연결된 모델이 아닙니다)";
  AIForm.msgCls = "";
  renderAIMenu();
}

function aiPickConn(i) {
  const c = AI.settings.conns[i];
  if (!c) return;
  AI.settings.active = aiConnId(c.pid, c.model);
  AI.save();
  aiFillForm(c);
  SFX.cursor();
  AIForm.msg = `기본 모델: ${AI.label(c)}`; AIForm.msgCls = "ok";
  renderAIMenu();
}

function aiDeleteConn(i) {
  const c = AI.settings.conns[i];
  if (!c) return;
  const { pid, model } = c;
  AI.remove(pid, model);
  if (AIForm.pid === pid && aiFormModel() === model) AIForm.key = "";
  SFX.cancel();
  AIForm.msg = `${AI_PROVIDERS[pid].company} - ${model} 연결을 삭제했습니다.`; AIForm.msgCls = "";
  renderAIMenu();
}
