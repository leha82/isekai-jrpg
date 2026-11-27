// ==========================================
// 탭: 시나리오 작성 — 암호화된 스크립트 편집기
// 저장 흐름: 검사 → 새 키 생성·Firebase 등록 → 전체 재암호화 → GitHub 커밋 → 오래된 키 정리
// ==========================================
import { $, esc, S, backend, setStatus, setBusy, download, bus } from "./core.js";

const FILE_NAME_RE = /^[A-Za-z0-9_-]+\.script$/;
const MANIFEST_PATH = `${SCENARIO_DIR}/manifest.json`;
const encPath = (name) => `${SCENARIO_DIR}/${name}.enc.json`;

export const SC = {
  files: new Map(),   // 이름 → { text, saved }
  repoFiles: [], manifest: null, current: null, loaded: false, lastScn: null
};

const sortedNames = () => [...SC.files.keys()].sort((a, b) => a.localeCompare(b));
const isFileDirty = (n) => { const f = SC.files.get(n); return !f || f.text !== f.saved; };
export function isScenarioDirty() { return SC.repoFiles.some(n => !SC.files.has(n)) || sortedNames().some(isFileDirty); }

// ---------- 편집기 ----------
const ed = () => $("editor");

function updateGutter() {
  const n = ed().value.split("\n").length;
  let s = "";
  for (let i = 1; i <= n; i++) s += i + "\n";
  $("gutter").textContent = s;
  $("gutter").scrollTop = ed().scrollTop;
}
function updateCursorPos() {
  const before = ed().value.slice(0, ed().selectionStart).split("\n");
  $("cursor-pos").textContent = SC.current ? `줄 ${before.length}, 칸 ${before[before.length - 1].length + 1}` : "";
}

export function openFile(name) {
  SC.current = name && SC.files.has(name) ? name : null;
  ed().disabled = !SC.current;
  ed().value = SC.current ? SC.files.get(SC.current).text : "";
  $("current-file").textContent = SC.current || "파일 없음";
  ed().scrollTop = 0;
  updateGutter(); updateCursorPos(); renderFileList();
}

export function gotoLine(name, line) {
  if (!SC.files.has(name)) return;
  if (bus.openTab) bus.openTab("scenario");
  if (SC.current !== name) openFile(name);
  const lines = ed().value.split("\n");
  let pos = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
  ed().focus();
  ed().setSelectionRange(pos, pos + (lines[line - 1] || "").length);
  ed().scrollTop = Math.max(0, (line - 6) * 20);
  updateGutter(); updateCursorPos();
}

// 다른 탭(이벤트)에서 스크립트 내용을 바꿀 때
export function setFileText(name, text) {
  if (!SC.files.has(name)) SC.files.set(name, { text, saved: null });
  else SC.files.get(name).text = text;
  if (SC.current === name) { ed().value = text; updateGutter(); }
  renderFileList();
  validateAll();
}

function onEditorChanged() {
  if (!SC.current) return;
  SC.files.get(SC.current).text = ed().value;
  updateGutter(); updateCursorPos(); renderFileList(); scheduleValidate();
}

function renderFileList() {
  const errCount = {};
  if (SC.lastScn) SC.lastScn.errors.forEach(e => { errCount[e.file] = (errCount[e.file] || 0) + 1; });
  const ul = $("file-list");
  ul.innerHTML = "";
  sortedNames().forEach(name => {
    const li = document.createElement("li");
    if (name === SC.current) li.className = "active";
    li.innerHTML = `<span>${esc(name)}</span><span class="badge">${errCount[name] ? `<span class="errs">✖${errCount[name]}</span> ` : ""}${isFileDirty(name) ? `<span class="dirty">●</span>` : ""}</span>`;
    li.onclick = () => openFile(name);
    ul.appendChild(li);
  });
  if (!SC.files.size) ul.innerHTML = `<li class="muted">파일 없음</li>`;
}

// ---------- 검사 ----------
let validateTimer = null;
function scheduleValidate() { clearTimeout(validateTimer); validateTimer = setTimeout(validateAll, 400); }

export function parseCurrent() {
  const scn = ScenarioFormat.parseAll(sortedNames().map(name => ({ name, text: SC.files.get(name).text })));
  if (GameData.game) ScenarioFormat.validate(scn, buildScenarioContext());
  return scn;
}

export function validateAll() {
  const scn = parseCurrent();
  SC.lastScn = scn;
  const ul = $("problems");
  ul.innerHTML = "";
  const add = (p, kind) => {
    const li = document.createElement("li");
    li.className = kind;
    li.innerHTML = `<div class="loc">${kind === "error" ? "오류" : "경고"} · ${esc(p.file)}${p.line ? ":" + p.line : ""}</div><div>${esc(p.message)}</div>`;
    if (p.line) li.onclick = () => gotoLine(p.file, p.line);
    ul.appendChild(li);
  };
  scn.errors.forEach(p => add(p, "error"));
  scn.warnings.forEach(p => add(p, "warn"));
  if (!scn.errors.length && !scn.warnings.length) {
    ul.innerHTML = `<li class="ok">문제 없음 ✓ (장면 ${Object.keys(scn.scenes).length} · 이벤트 ${scn.events.length} · 퀘스트 ${Object.keys(scn.quests).length})</li>`;
  }
  $("check-summary").textContent = `— 오류 ${scn.errors.length} · 경고 ${scn.warnings.length}`;
  renderFileList();
  bus.scenarioChanged.forEach(fn => fn(scn));
  return scn;
}

// ---------- 저장소에서 불러오기 ----------
export async function loadScenarioFromRepo(force = false) {
  if (!force && isScenarioDirty() && !confirm("저장하지 않은 스크립트 변경이 사라집니다. 저장소에서 다시 불러올까요?")) return;
  setBusy(true);
  setStatus("시나리오를 불러오는 중...");
  try {
    const manifestText = await backend.github.readText(MANIFEST_PATH);
    const files = new Map();
    let manifest = null;
    if (manifestText) {
      manifest = JSON.parse(manifestText);
      const keys = {};
      for (const name of manifest.files) {
        const encText = await backend.github.readText(encPath(name));
        if (encText == null) throw new Error(`${encPath(name)} 파일이 저장소에 없습니다`);
        const obj = JSON.parse(encText);
        if (!keys[obj.keyId]) keys[obj.keyId] = await backend.getKey(obj.keyId);
        const text = await ScenarioCrypto.decryptText(obj, keys[obj.keyId]);
        files.set(name, { text, saved: text });
      }
    }
    SC.files = files; SC.manifest = manifest;
    SC.repoFiles = manifest ? manifest.files.slice() : [];
    SC.loaded = true;
    openFile(sortedNames()[0] || null);
    renderRepoInfo();
    validateAll();
    if (manifest) setStatus(`시나리오 불러오기 완료 — ${manifest.files.length}개 파일 복호화 (키 ${manifest.keyId})`, "ok");
    else setStatus("저장소에 시나리오가 아직 없습니다. 📁 폴더 가져오기로 로컬 scenario-src 폴더를 불러온 뒤 저장하세요.", "error");
  } catch (e) {
    console.error(e);
    setStatus(`시나리오 불러오기 실패: ${e.message}`, "error");
  } finally {
    setBusy(false);
  }
}

function renderRepoInfo() {
  const m = SC.manifest;
  $("repo-info").textContent = `현재 키: ${m ? m.keyId : "없음"}\n마지막 저장: ${m ? new Date(m.updatedAt).toLocaleString("ko-KR") : "-"}`;
}

// ---------- 이전 키 삭제 (현재 manifest 키만 남김) ----------
// 저장 직후에는 GitHub Pages 반영(1~2분) 동안 이전 암호문이 풀리도록 직전 키를 남겨 둔다.
// 배포가 끝난 뒤 이 버튼으로 정리한다.
async function pruneOldKeys() {
  if (S.busy) return;
  const keyId = SC.manifest && SC.manifest.keyId;
  if (!keyId) { setStatus("저장소에서 현재 키를 아직 불러오지 않았습니다. ↻ 다시 불러오기 후 시도하세요.", "error"); return; }
  if (!confirm(`현재 키(${keyId})만 남기고 Firebase 의 이전 복호화 키를 모두 삭제합니다.\n마지막 저장 후 GitHub Pages 반영(1~2분)이 끝난 뒤에 하세요.\n\n계속할까요?`)) return;
  setBusy(true);
  try {
    // 저장소의 manifest 가 정말 이 키인지 다시 확인 (다른 곳에서 저장했을 수 있음)
    const live = JSON.parse(await backend.github.readText(MANIFEST_PATH) || "null");
    if (!live || live.keyId !== keyId) throw new Error(`저장소의 현재 키(${live ? live.keyId : "없음"})가 불러온 키와 다릅니다. 다시 불러온 뒤 시도하세요.`);
    const n = await backend.pruneKeys(0, [keyId]);
    setStatus(`✅ 이전 키 ${n}개 삭제 — 남은 키: ${keyId}`, "ok");
  } catch (e) {
    console.error(e);
    setStatus(`이전 키 삭제 실패: ${e.message}`, "error");
  } finally {
    setBusy(false);
  }
}

// ---------- 저장 (새 키로 전체 재암호화 → GitHub 커밋) ----------
export async function saveScenario() {
  if (S.busy) return;
  const scn = validateAll();
  if (!SC.files.size) { setStatus("저장할 파일이 없습니다.", "error"); return; }
  if (scn.errors.length) { setStatus(`오류 ${scn.errors.length}건을 먼저 고쳐 주세요. (검사 결과 클릭 → 해당 줄로 이동)`, "error"); return; }
  if (!backend.github.hasToken()) { setStatus("GitHub 토큰을 먼저 설정하세요.", "error"); return; }
  const names = sortedNames();
  const removed = SC.repoFiles.filter(n => !SC.files.has(n));
  const msg = `스크립트 ${names.length}개를 새 키로 다시 암호화해 GitHub에 커밋합니다.` +
    (removed.length ? `\n삭제할 파일: ${removed.join(", ")}` : "") +
    (scn.warnings.length ? `\n(경고 ${scn.warnings.length}건이 있습니다)` : "") + "\n\n계속할까요?";
  if (!confirm(msg)) return;
  const previousKeyId = SC.manifest ? SC.manifest.keyId : null;
  setBusy(true);
  try {
    setStatus("1/5 GitHub 권한 확인 중...");
    await backend.github.checkAccess();
    setStatus("2/5 새 암호화 키 생성 → Firebase 등록 중...");
    const { keyId, key } = ScenarioCrypto.newKey();
    await backend.putKey(keyId, key, S.user ? S.user.email : "");
    setStatus("3/5 스크립트 암호화 중...");
    const changes = [];
    for (const name of names) {
      const obj = await ScenarioCrypto.encryptText(SC.files.get(name).text, key, keyId, name);
      changes.push({ path: encPath(name), content: JSON.stringify(obj) + "\n" });
    }
    const manifest = { version: 1, keyId, files: names, updatedAt: new Date().toISOString() };
    changes.push({ path: MANIFEST_PATH, content: JSON.stringify(manifest, null, 2) + "\n" });
    removed.forEach(n => changes.push({ path: encPath(n), content: null }));
    setStatus("4/5 GitHub에 커밋 중...");
    const sha = await backend.github.commit(changes, `scenario: 스크립트 ${names.length}개 암호화 업데이트 (키 ${keyId})`);
    setStatus("5/5 오래된 키 정리 중...");
    let pruned = 0;
    try { pruned = await backend.pruneKeys(SCENARIO_KEEP_KEYS, [keyId, previousKeyId].filter(Boolean)); }
    catch (e) { console.warn("[키 정리 실패]", e); }
    names.forEach(n => { const f = SC.files.get(n); f.saved = f.text; });
    SC.repoFiles = names.slice(); SC.manifest = manifest;
    renderFileList(); renderRepoInfo();
    setStatus(`✅ 시나리오 저장 완료 — 커밋 ${String(sha).slice(0, 7)}, 새 키 ${keyId}, 오래된 키 ${pruned}개 삭제\nGitHub Pages 반영까지 1~2분 걸립니다.`, "ok");
  } catch (e) {
    console.error(e);
    setStatus(`저장 실패: ${e.message}\n커밋 전에 실패했다면 게임에는 영향이 없습니다. 다시 시도하세요.`, "error");
  } finally {
    setBusy(false);
  }
}

// ---------- 파일 관리 ----------
function askFileName(message, initial) {
  const name = (prompt(message, initial) || "").trim();
  if (!name) return null;
  if (!FILE_NAME_RE.test(name)) { alert("파일 이름은 영문·숫자·_·- 로 쓰고 .script 로 끝나야 합니다. (예: 50_ch4_dwarf.script)"); return null; }
  if (SC.files.has(name)) { alert(`이미 있는 파일입니다: ${name}`); return null; }
  return name;
}

export function importTexts(list) {
  const valid = list.filter(f => FILE_NAME_RE.test(f.name));
  const skipped = list.length - valid.length;
  if (!valid.length) { setStatus("가져올 .script 파일이 없습니다.", "error"); return 0; }
  const overwrite = valid.filter(f => SC.files.has(f.name) && SC.files.get(f.name).text !== f.text);
  if (overwrite.length && !confirm(`${overwrite.length}개 파일을 가져온 내용으로 덮어씁니다:\n${overwrite.map(f => f.name).join("\n")}\n\n계속할까요?`)) return 0;
  valid.forEach(f => {
    const prev = SC.files.get(f.name);
    SC.files.set(f.name, { text: f.text.replace(/\r\n?/g, "\n"), saved: prev ? prev.saved : null });
  });
  openFile(valid[0].name);
  validateAll();
  setStatus(`${valid.length}개 파일을 가져왔습니다.${skipped ? ` (형식이 맞지 않는 파일 ${skipped}개 제외)` : ""} 🔒 저장을 눌러야 업로드됩니다.`, "ok");
  return valid.length;
}

async function readInputFiles(input) {
  const files = [...input.files].filter(f => f.name.endsWith(".script"));
  const list = await Promise.all(files.map(async f => ({ name: f.name, text: await f.text() })));
  input.value = "";
  importTexts(list);
}

async function exportAll() {
  const names = sortedNames();
  if (!names.length) return;
  if (!confirm(`${names.length}개 파일을 각각 다운로드합니다. 받은 파일은 로컬 scenario-src 폴더에 넣으면 됩니다.`)) return;
  for (const n of names) { download(n, SC.files.get(n).text); await new Promise(r => setTimeout(r, 300)); }
}

// ---------- 초기화 ----------
export function initScenarioTab() {
  const e = ed();
  e.addEventListener("input", onEditorChanged);
  e.addEventListener("scroll", () => { $("gutter").scrollTop = e.scrollTop; });
  e.addEventListener("click", updateCursorPos);
  e.addEventListener("keyup", updateCursorPos);
  e.addEventListener("keydown", (ev) => {
    if (ev.key === "Tab") { ev.preventDefault(); e.setRangeText("  ", e.selectionStart, e.selectionEnd, "end"); onEditorChanged(); }
    else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") { ev.preventDefault(); saveScenario(); }
  });
  $("btn-new").onclick = () => {
    const name = askFileName("새 파일 이름 (영문·숫자·_·-, .script 로 끝남)", "50_new_chapter.script");
    if (!name) return;
    SC.files.set(name, { text: "# ============================================\n# 새 스크립트\n# ============================================\n\n", saved: null });
    openFile(name); validateAll();
  };
  $("btn-rename").onclick = () => {
    if (!SC.current) return;
    const name = askFileName(`${SC.current} 의 새 이름`, SC.current);
    if (!name) return;
    const f = SC.files.get(SC.current);
    SC.files.delete(SC.current);
    SC.files.set(name, { text: f.text, saved: null });
    openFile(name); validateAll();
  };
  $("btn-delete").onclick = () => {
    if (!SC.current || !confirm(`${SC.current} 파일을 삭제할까요?\n(🔒 저장을 눌러야 저장소에 반영됩니다)`)) return;
    SC.files.delete(SC.current);
    openFile(sortedNames()[0] || null); validateAll();
  };
  $("import-files").onchange = (ev) => readInputFiles(ev.target);
  $("import-dir").onchange = (ev) => readInputFiles(ev.target);
  $("btn-export").onclick = () => { if (SC.current) download(SC.current, SC.files.get(SC.current).text); };
  $("btn-export-all").onclick = exportAll;
  $("btn-reload").onclick = () => loadScenarioFromRepo(false);
  $("btn-prune-keys").onclick = pruneOldKeys;
  $("btn-check").onclick = () => { const scn = validateAll(); setStatus(`검사 완료 — 오류 ${scn.errors.length}건, 경고 ${scn.warnings.length}건`, scn.errors.length ? "error" : "ok"); };
  $("btn-save").onclick = saveScenario;
  $("help-body").innerHTML = `
<pre># 주석
@scene 장면id             대사·명령 묶음
화자: 대사                 ({hero} = 주인공 이름, 들여쓴 다음 줄 = 줄바꿈)
> 명령 인자                아래 명령표
? 조건 -> 장면id           조건이 맞으면 이동
-> 장면id                  무조건 이동

@event id 맵id:x,y 이름    맵 이벤트 (장면과 같은 문법)
* sprite 캐릭터키 [when 조건]  NPC 표시 (있으면 말 걸기 이벤트)
* tile 타일id [when 조건]      그 칸 타일 바꿔 그리기 (열린 상자)
* trigger talk|touch|enter    말 걸기 / 밟기 / 맵에 들어올 때
* when 조건                    조건이 맞을 때만 이벤트 동작
* face down|up|left|right     NPC 기본 방향

@quest id main|side 제목   (다음 줄부터 설명)
@text 키                   title_desc / ending_title / ending_body

조건: flag == 1, lv >= 4, gold >= 100, var 상자 == 1,
      joined ria, !joined ria, item potion >= 1,
      quest id active|done|none  (and 로 여러 개)</pre>
<table>${ScenarioFormat.COMMAND_HELP.map(([c, d]) => `<tr><td>&gt; ${esc(c)}</td><td>${esc(d)}</td></tr>`).join("")}</table>
<p>필수 장면: <code>intro</code>, <code>party_wiped</code><br>id 목록은 '리소스'·'캐릭터·몬스터'·'전투 설정' 탭에서 확인하세요.</p>`;
}
