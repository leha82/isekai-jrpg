// ==========================================
// AI 연결 기반 — Claude · Gemini · ChatGPT (향후 NPC 자동 대화용)
//  - API 키·모델은 이 브라우저의 localStorage("ai_settings")에만 저장한다. 서버·Firebase·GitHub 로 보내지 않는다.
//  - Claude 는 공식 SDK(@anthropic-ai/sdk)를 CDN(esm.sh)에서 필요할 때 불러온다 (빌드 도구가 없으므로 dynamic import).
//  - Gemini · ChatGPT 는 각 사의 REST API 를 직접 호출한다.
//  - 공통 진입점: AI.chat({ provider, system, messages:[{role:"user"|"assistant", content}] }) → 응답 문자열
//    NPC 용 편의 함수: AI.npcReply({ name, persona, history, playerText })
// ==========================================
const AI_PROVIDERS = {
  claude: {
    label: "Claude (Anthropic)",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    defaultModel: "claude-opus-5-5",
    keyHint: "sk-ant-...",
    keyUrl: "https://platform.claude.com/settings/keys"
  },
  gemini: {
    label: "Gemini (Google)",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    defaultModel: "gemini-2.5-flash",
    keyHint: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey"
  },
  openai: {
    label: "ChatGPT (OpenAI)",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o"],
    defaultModel: "gpt-4.1-mini",
    keyHint: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys"
  }
};

const AI_SDK_URL = "https://esm.sh/@anthropic-ai/sdk";

const AI = {
  settings: { active: "claude", npcEnabled: false, claude: { key: "", model: "" }, gemini: { key: "", model: "" }, openai: { key: "", model: "" } },
  _anthropic: null,

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem("ai_settings") || "{}");
      Object.keys(AI_PROVIDERS).forEach(p => { if (saved[p]) Object.assign(this.settings[p], saved[p]); });
      if (saved.active && AI_PROVIDERS[saved.active]) this.settings.active = saved.active;
      this.settings.npcEnabled = !!saved.npcEnabled;
    } catch (e) {}
  },
  save() {
    try { localStorage.setItem("ai_settings", JSON.stringify(this.settings)); } catch (e) {}
  },
  model(p) { return (this.settings[p] && this.settings[p].model) || AI_PROVIDERS[p].defaultModel; },
  hasKey(p) { return !!(this.settings[p] && this.settings[p].key); },
  ready() { return this.hasKey(this.settings.active); },

  async chat({ provider = this.settings.active, system = "", messages, maxTokens = 1024 }) {
    if (!AI_PROVIDERS[provider]) throw new Error(`알 수 없는 AI: ${provider}`);
    const key = this.settings[provider].key;
    if (!key) throw new Error(`${AI_PROVIDERS[provider].label} API 키가 없습니다.`);
    const model = this.model(provider);
    if (provider === "claude") return this._claude(key, model, system, messages, maxTokens);
    if (provider === "gemini") return this._gemini(key, model, system, messages, maxTokens);
    return this._openai(key, model, system, messages, maxTokens);
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
    return this.chat({ system, messages: history.concat([{ role: "user", content: playerText }]), maxTokens: 300 });
  }
};
AI.load();

// ---------- AI 연결 메뉴 ----------
function openAIMenu() {
  if (typeof initAudio === "function") initAudio();
  renderAIMenu();
}

function renderAIMenu() {
  const s = AI.settings;
  const cards = Object.entries(AI_PROVIDERS).map(([id, p]) => {
    const cfg = s[id];
    const opts = p.models.map(m => `<option value="${m}">`).join("");
    return `<div class="ai-card${s.active === id ? " active" : ""}">
      <div class="ai-head"><b>${p.label}</b>
        <span><button class="item-btn${s.active === id ? " on" : ""}" onclick="aiSetActive('${id}')">${s.active === id ? "✔ 기본 AI" : "기본으로"}</button></span></div>
      <div class="ai-fields">
        <span>API 키</span><input class="text-input" type="password" autocomplete="off" placeholder="${p.keyHint}" value="${escapeHtml(cfg.key)}" onchange="aiSetField('${id}','key',this.value)">
        <span>모델</span><input class="text-input" list="ai-models-${id}" placeholder="${p.defaultModel}" value="${escapeHtml(cfg.model)}" onchange="aiSetField('${id}','model',this.value)">
        <datalist id="ai-models-${id}">${opts}</datalist>
      </div>
      <div class="btn-group"><button class="item-btn" onclick="aiTest('${id}')">🔌 연결 테스트</button>
        <button class="item-btn" onclick="aiClearKey('${id}')">🗑️ 키 지우기</button>
        <a class="muted small" href="${p.keyUrl}" target="_blank" rel="noopener" style="align-self:center">키 발급 ↗</a></div>
      <div class="ai-result" id="ai-result-${id}">${AI.hasKey(id) ? "키 저장됨" : "키 없음"}</div>
    </div>`;
  }).join("");
  openWindow("🤖 AI 연결", `
    <p class="muted small" style="margin:0">향후 NPC 자동 대화에 쓸 AI 를 연결합니다. 키는 <b>이 브라우저에만</b> 저장되며 게임 서버·클라우드 세이브로 보내지 않습니다. 공용 PC 에서는 저장하지 마세요. 사용 요금은 각 AI 회사 계정에 청구됩니다.</p>
    ${cards}
    <div class="setting-row"><label><input type="checkbox" ${s.npcEnabled ? "checked" : ""} onchange="AI.settings.npcEnabled=this.checked; AI.save()"> NPC 자동 대화 사용 (준비 중 — 지원하는 NPC 가 생기면 동작)</label></div>`, { kind: "ai" });
}

function aiSetActive(id) { AI.settings.active = id; AI.save(); SFX.cursor(); renderAIMenu(); }
function aiSetField(id, field, value) { AI.settings[id][field] = value.trim(); AI.save(); const r = $(`ai-result-${id}`); if (r) { r.className = "ai-result"; r.textContent = "저장됨"; } }
async function aiClearKey(id) {
  if (!AI.hasKey(id)) return;
  if (!(await uiConfirm(`${AI_PROVIDERS[id].label} API 키를 이 브라우저에서 지울까요?`, { danger: true, ok: "지우기" }))) return;
  AI.settings[id].key = ""; AI.save(); renderAIMenu();
}
async function aiTest(id) {
  const r = $(`ai-result-${id}`);
  if (!AI.hasKey(id)) { r.className = "ai-result err"; r.textContent = "API 키를 먼저 입력하세요."; return; }
  r.className = "ai-result"; r.textContent = "⏳ 연결 중…";
  try {
    const text = await AI.chat({ provider: id, system: "짧게 답한다.", messages: [{ role: "user", content: "판타지 마을 주민처럼 한 문장으로 인사해 줘." }], maxTokens: 200 });
    r.className = "ai-result ok"; r.textContent = `✅ 연결 성공 (${AI.model(id)})\n${text}`;
  } catch (e) {
    console.error("[AI 연결]", id, e);
    r.className = "ai-result err"; r.textContent = `⚠️ ${e.message || e}`;
  }
}
