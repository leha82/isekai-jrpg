// ==========================================
// 스크립트 관리자 (admin.html, ES module)
//
// 접근 제어: Google 로그인 → MASTER_EMAIL 확인 → Firestore admin/github 읽기 시도(서버 규칙 검사).
//            보안 규칙(firestore.rules)이 마스터가 아니면 거부하므로, 화면 조작으로는 우회할 수 없다.
// 저장 흐름: 검사 → 새 키 생성·Firebase 등록 → 전체 파일 재암호화 → GitHub 커밋(Git Data API) → 오래된 키 정리
// 테스트:    window.__ADMIN_TEST_BACKEND 가 있으면 Firebase/GitHub 대신 그것을 쓴다.
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const FILE_NAME_RE = /^[A-Za-z0-9_-]+\.script$/;
const MANIFEST_PATH = `${SCENARIO_DIR}/manifest.json`;
const encPath = (name) => `${SCENARIO_DIR}/${name}.enc.json`;

// ==========================================
// GitHub API (fine-grained PAT, Contents 읽기/쓰기)
// ==========================================
function createGithubApi() {
  let token = null;
  const base = `https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}`;
  const headers = (extra = {}) => ({ Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...extra });

  async function toError(res) {
    let msg = "";
    try { msg = (await res.json()).message || ""; } catch (e) {}
    let hint = "";
    if (res.status === 401) hint = " — 토큰이 잘못되었거나 만료되었습니다";
    else if (res.status === 403 || res.status === 404) hint = " — 토큰에 이 저장소의 Contents 읽기/쓰기 권한이 있는지 확인하세요";
    else if (res.status === 409 || res.status === 422) hint = " — 저장소가 그 사이 바뀌었을 수 있습니다. 다시 시도하세요";
    const e = new Error(`GitHub ${res.status}: ${msg}${hint}`);
    e.status = res.status;
    return e;
  }

  async function call(path, opts = {}) {
    const extra = { Accept: "application/vnd.github+json" };
    if (opts.body) extra["Content-Type"] = "application/json";
    const res = await fetch(base + path, { cache: "no-store", ...opts, headers: headers(extra) });
    if (!res.ok) throw await toError(res);
    return res.status === 204 ? null : res.json();
  }

  return {
    setToken(t) { token = t; },
    hasToken() { return !!token; },
    async checkAccess() {
      const repo = await call("");
      if (repo.permissions && repo.permissions.push === false) throw new Error("이 토큰에는 저장소 쓰기 권한이 없습니다");
      return repo;
    },
    async readText(path) {
      const url = `${base}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(GITHUB_REPO.branch)}`;
      const res = await fetch(url, { cache: "no-store", headers: headers({ Accept: "application/vnd.github.raw+json" }) });
      if (res.status === 404) return null;
      if (!res.ok) throw await toError(res);
      return res.text();
    },
    // changes: [{ path, content }] — content 가 null 이면 삭제. 여러 파일을 커밋 1개로 묶는다.
    async commit(changes, message) {
      const ref = await call(`/git/ref/heads/${GITHUB_REPO.branch}`);
      const parent = ref.object.sha;
      const parentCommit = await call(`/git/commits/${parent}`);
      const tree = await call(`/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: parentCommit.tree.sha,
          tree: changes.map(c => c.content === null
            ? { path: c.path, mode: "100644", type: "blob", sha: null }
            : { path: c.path, mode: "100644", type: "blob", content: c.content })
        })
      });
      const commit = await call(`/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }) });
      await call(`/git/refs/heads/${GITHUB_REPO.branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
      return commit.sha;
    }
  };
}

// ==========================================
// Firebase 백엔드
// ==========================================
function createFirebaseBackend() {
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = getAuth(app);
  const db = getFirestore(app);
  return {
    onAuth: (cb) => onAuthStateChanged(auth, cb),
    signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return signInWithPopup(auth, provider);
    },
    signOut: () => signOut(auth),
    // 마스터가 아니면 보안 규칙에 의해 permission-denied 로 실패한다 (서버 측 권한 확인 겸용)
    async readToken() {
      const snap = await getDoc(doc(db, "admin", "github"));
      return snap.exists() ? (snap.data().token || null) : null;
    },
    async writeToken(token) { await setDoc(doc(db, "admin", "github"), { token, updatedAt: serverTimestamp() }); },
    async getKey(keyId) {
      const snap = await getDoc(doc(db, "scriptKeys", keyId));
      if (!snap.exists()) throw new Error(`복호화 키(${keyId})가 Firebase에 없습니다`);
      return snap.data().key;
    },
    async putKey(keyId, key, by) { await setDoc(doc(db, "scriptKeys", keyId), { key, createdAt: serverTimestamp(), by }); },
    // 최신 keep 개와 alwaysKeep 에 든 키만 남기고 삭제
    async pruneKeys(keep, alwaysKeep = []) {
      const snap = await getDocs(query(collection(db, "scriptKeys"), orderBy("createdAt", "desc")));
      const victims = snap.docs.filter((d, i) => i >= keep && !alwaysKeep.includes(d.id));
      await Promise.all(victims.map(d => deleteDoc(d.ref)));
      return victims.length;
    },
    github: createGithubApi()
  };
}

const backend = window.__ADMIN_TEST_BACKEND || createFirebaseBackend();

// ==========================================
// 상태
// ==========================================
const S = {
  user: null,
  files: new Map(),   // 이름 → { text, saved }  (saved: 저장소에 있는 내용, 새 파일은 null)
  repoFiles: [],      // 저장소 manifest 에 있는 파일 이름
  manifest: null,
  current: null,
  busy: false,
  loaded: false,
  lastScn: null
};

const sortedNames = () => [...S.files.keys()].sort((a, b) => a.localeCompare(b));
const isFileDirty = (name) => { const f = S.files.get(name); return !f || f.text !== f.saved; };
function isDirty() {
  if (S.repoFiles.some(n => !S.files.has(n))) return true;
  return sortedNames().some(isFileDirty);
}

// ==========================================
// 화면 공통
// ==========================================
function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = kind;
}

function showGate(icon, msg, showLogin) {
  $("gate").hidden = false;
  $("app").hidden = true;
  $("gate-icon").textContent = icon;
  $("gate-msg").textContent = msg;
  $("btn-login").hidden = !showLogin;
}

function setBusy(b) {
  S.busy = b;
  ["btn-save", "btn-check", "btn-reload", "btn-token-save"].forEach(id => { $(id).disabled = b; });
}

function renderRepoInfo() {
  const m = S.manifest;
  $("repo-info").textContent =
    `${GITHUB_REPO.owner}/${GITHUB_REPO.repo} (${GITHUB_REPO.branch})\n` +
    `현재 키: ${m ? m.keyId : "없음"}\n` +
    `마지막 저장: ${m ? new Date(m.updatedAt).toLocaleString("ko-KR") : "-"}`;
  $("repo-info").style.whiteSpace = "pre-line";
}

function renderFileList() {
  const errCount = {};
  if (S.lastScn) S.lastScn.errors.forEach(e => { errCount[e.file] = (errCount[e.file] || 0) + 1; });
  const ul = $("file-list");
  ul.innerHTML = "";
  sortedNames().forEach(name => {
    const li = document.createElement("li");
    if (name === S.current) li.className = "active";
    const label = document.createElement("span");
    label.textContent = name;
    const badge = document.createElement("span");
    badge.className = "badge";
    if (errCount[name]) badge.innerHTML += `<span class="errs">✖${errCount[name]}</span> `;
    if (isFileDirty(name)) badge.innerHTML += `<span class="dirty">●</span>`;
    li.append(label, badge);
    li.onclick = () => openFile(name);
    ul.appendChild(li);
  });
  if (!S.files.size) ul.innerHTML = `<li style="cursor:default;color:#64748b">파일 없음</li>`;
}

// ==========================================
// 편집기
// ==========================================
const ed = $("editor");

function updateGutter() {
  const n = ed.value.split("\n").length;
  let s = "";
  for (let i = 1; i <= n; i++) s += i + "\n";
  $("gutter").textContent = s;
  $("gutter").scrollTop = ed.scrollTop;
}

function updateCursorPos() {
  const before = ed.value.slice(0, ed.selectionStart).split("\n");
  $("cursor-pos").textContent = S.current ? `줄 ${before.length}, 칸 ${before[before.length - 1].length + 1}` : "";
}

function openFile(name) {
  S.current = name && S.files.has(name) ? name : null;
  ed.disabled = !S.current;
  ed.value = S.current ? S.files.get(S.current).text : "";
  $("current-file").textContent = S.current || "파일 없음";
  ed.scrollTop = 0;
  updateGutter();
  updateCursorPos();
  renderFileList();
}

function gotoLine(name, line) {
  if (!S.files.has(name)) return;
  if (S.current !== name) openFile(name);
  const lines = ed.value.split("\n");
  let pos = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
  ed.focus();
  ed.setSelectionRange(pos, pos + (lines[line - 1] || "").length);
  ed.scrollTop = Math.max(0, (line - 6) * 20);
  updateGutter();
  updateCursorPos();
}

function onEditorChanged() {
  if (!S.current) return;
  S.files.get(S.current).text = ed.value;
  updateGutter();
  updateCursorPos();
  renderFileList();
  scheduleValidate();
}

ed.addEventListener("input", onEditorChanged);
ed.addEventListener("scroll", () => { $("gutter").scrollTop = ed.scrollTop; });
ed.addEventListener("click", updateCursorPos);
ed.addEventListener("keyup", updateCursorPos);
ed.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    ed.setRangeText("  ", ed.selectionStart, ed.selectionEnd, "end");
    onEditorChanged();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveAll();
  }
});

// ==========================================
// 검사
// ==========================================
let validateTimer = null;
function scheduleValidate() {
  clearTimeout(validateTimer);
  validateTimer = setTimeout(validateAll, 400);
}

function validateAll() {
  const scn = ScenarioFormat.parseAll(sortedNames().map(name => ({ name, text: S.files.get(name).text })));
  ScenarioFormat.validate(scn, buildScenarioContext());
  S.lastScn = scn;

  const ul = $("problems");
  ul.innerHTML = "";
  const add = (p, kind) => {
    const li = document.createElement("li");
    li.className = kind;
    const loc = document.createElement("div");
    loc.className = "loc";
    loc.textContent = `${kind === "error" ? "오류" : "경고"} · ${p.file}${p.line ? ":" + p.line : ""}`;
    const msg = document.createElement("div");
    msg.textContent = p.message;
    li.append(loc, msg);
    if (p.line) li.onclick = () => gotoLine(p.file, p.line);
    ul.appendChild(li);
  };
  scn.errors.forEach(p => add(p, "error"));
  scn.warnings.forEach(p => add(p, "warn"));
  if (!scn.errors.length && !scn.warnings.length) {
    ul.innerHTML = `<li class="ok">문제 없음 ✓ (장면 ${Object.keys(scn.scenes).length}개 · 이벤트 ${scn.events.length}개)</li>`;
  }
  $("check-summary").textContent = `— 오류 ${scn.errors.length} · 경고 ${scn.warnings.length}`;
  renderFileList();
  return scn;
}

// ==========================================
// 저장소에서 불러오기 (GitHub 암호화 파일 + Firebase 키 → 복호화)
// ==========================================
async function loadFromRepo(force = false) {
  if (!force && isDirty() && !confirm("저장하지 않은 변경 사항이 사라집니다. 저장소에서 다시 불러올까요?")) return;
  setBusy(true);
  setStatus("저장소에서 불러오는 중...");
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
    S.files = files;
    S.manifest = manifest;
    S.repoFiles = manifest ? manifest.files.slice() : [];
    S.loaded = true;
    openFile(sortedNames()[0] || null);
    renderRepoInfo();
    validateAll();
    if (manifest) setStatus(`불러오기 완료 — ${manifest.files.length}개 파일 복호화 (키 ${manifest.keyId})`, "ok");
    else setStatus("저장소에 시나리오가 아직 없습니다. 📁 폴더 가져오기로 로컬 scenario-src 폴더를 불러온 뒤 저장하세요.", "error");
  } catch (e) {
    console.error(e);
    setStatus(`불러오기 실패: ${e.message}`, "error");
  } finally {
    setBusy(false);
  }
}

// ==========================================
// 저장 (새 키로 전체 재암호화 → GitHub 커밋)
// ==========================================
async function saveAll() {
  if (S.busy) return;
  const scn = validateAll();
  if (!S.files.size) { setStatus("저장할 파일이 없습니다.", "error"); return; }
  if (scn.errors.length) { setStatus(`오류 ${scn.errors.length}건을 먼저 고쳐 주세요. (오른쪽 검사 결과 클릭 → 해당 줄로 이동)`, "error"); return; }
  if (!backend.github.hasToken()) { showTokenPanel(false); setStatus("GitHub 토큰을 먼저 설정하세요.", "error"); return; }

  const names = sortedNames();
  const removed = S.repoFiles.filter(n => !S.files.has(n));
  const msg = `스크립트 ${names.length}개를 새 키로 다시 암호화해 GitHub에 커밋합니다.` +
    (removed.length ? `\n삭제할 파일: ${removed.join(", ")}` : "") +
    (scn.warnings.length ? `\n(경고 ${scn.warnings.length}건이 있습니다)` : "") +
    "\n\n계속할까요?";
  if (!confirm(msg)) return;

  const previousKeyId = S.manifest ? S.manifest.keyId : null;
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
      const obj = await ScenarioCrypto.encryptText(S.files.get(name).text, key, keyId, name);
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

    names.forEach(n => { const f = S.files.get(n); f.saved = f.text; });
    S.repoFiles = names.slice();
    S.manifest = manifest;
    renderFileList();
    renderRepoInfo();
    setStatus(`✅ 저장 완료 — 커밋 ${String(sha).slice(0, 7)}, 새 키 ${keyId}, 오래된 키 ${pruned}개 삭제\nGitHub Pages 반영까지 1~2분 걸립니다.`, "ok");
  } catch (e) {
    console.error(e);
    setStatus(`저장 실패: ${e.message}\n커밋 전에 실패했다면 게임에는 영향이 없습니다. 다시 시도하세요.`, "error");
  } finally {
    setBusy(false);
  }
}

// ==========================================
// 파일 관리 · 가져오기 · 내보내기
// ==========================================
function askFileName(message, initial) {
  const name = (prompt(message, initial) || "").trim();
  if (!name) return null;
  if (!FILE_NAME_RE.test(name)) { alert("파일 이름은 영문·숫자·_·- 로 쓰고 .script 로 끝나야 합니다. (예: 40_ch4_dwarf.script)"); return null; }
  if (S.files.has(name)) { alert(`이미 있는 파일입니다: ${name}`); return null; }
  return name;
}

function newFile() {
  const name = askFileName("새 파일 이름 (영문·숫자·_·-, .script 로 끝남)", "40_new_chapter.script");
  if (!name) return;
  S.files.set(name, { text: "# ============================================\n# 새 스크립트\n# ============================================\n\n", saved: null });
  openFile(name);
  validateAll();
}

function renameFile() {
  if (!S.current) return;
  const name = askFileName(`${S.current} 의 새 이름`, S.current);
  if (!name) return;
  const f = S.files.get(S.current);
  S.files.delete(S.current);
  S.files.set(name, { text: f.text, saved: null }); // 저장소에서는 이전 파일 삭제 + 새 파일 추가로 처리된다
  openFile(name);
  validateAll();
}

function deleteFile() {
  if (!S.current) return;
  if (!confirm(`${S.current} 파일을 삭제할까요?\n(🔒 저장을 눌러야 저장소에 반영됩니다)`)) return;
  S.files.delete(S.current);
  openFile(sortedNames()[0] || null);
  validateAll();
}

// list: [{ name, text }]
function importTexts(list) {
  const valid = list.filter(f => FILE_NAME_RE.test(f.name));
  const skipped = list.length - valid.length;
  if (!valid.length) { setStatus("가져올 .script 파일이 없습니다. (이름은 영문·숫자·_·-, .script 확장자)", "error"); return 0; }
  const overwrite = valid.filter(f => S.files.has(f.name) && S.files.get(f.name).text !== f.text);
  if (overwrite.length && !confirm(`${overwrite.length}개 파일을 가져온 내용으로 덮어씁니다:\n${overwrite.map(f => f.name).join("\n")}\n\n계속할까요?`)) return 0;
  valid.forEach(f => {
    const prev = S.files.get(f.name);
    S.files.set(f.name, { text: f.text.replace(/\r\n?/g, "\n"), saved: prev ? prev.saved : null });
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

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function exportAll() {
  const names = sortedNames();
  if (!names.length) return;
  if (!confirm(`${names.length}개 파일을 각각 다운로드합니다. (브라우저가 여러 파일 다운로드 허용을 물으면 허용하세요)\n받은 파일은 로컬 scenario-src 폴더에 넣으면 됩니다.`)) return;
  for (const n of names) {
    download(n, S.files.get(n).text);
    await new Promise(r => setTimeout(r, 300));
  }
}

// ==========================================
// GitHub 토큰
// ==========================================
function showTokenPanel(cancelable) {
  $("token-panel").hidden = false;
  $("btn-token-cancel").hidden = !cancelable;
  $("token-input").focus();
}

async function saveToken() {
  const token = $("token-input").value.trim();
  if (!token) return;
  setBusy(true);
  setStatus("토큰 확인 중...");
  const hadToken = backend.github.hasToken();
  try {
    const probe = createGithubApiFor(token);
    await probe.checkAccess();
    await backend.writeToken(token);
    backend.github.setToken(token);
    $("token-input").value = "";
    $("token-panel").hidden = true;
    setStatus("GitHub 토큰을 저장했습니다.", "ok");
    if (!S.loaded || !hadToken) { setBusy(false); await loadFromRepo(true); }
  } catch (e) {
    setStatus(`토큰 확인 실패: ${e.message}`, "error");
  } finally {
    setBusy(false);
  }
}

// 저장 전에 새 토큰만 따로 검사하기 위한 임시 API
function createGithubApiFor(token) {
  if (backend.github.probe) return backend.github.probe(token); // 테스트 백엔드용
  const api = createGithubApi();
  api.setToken(token);
  return api;
}

// ==========================================
// 로그인 · 권한
// ==========================================
async function enterApp(token) {
  $("gate").hidden = true;
  $("app").hidden = false;
  $("repo-label").textContent = `${GITHUB_REPO.owner}/${GITHUB_REPO.repo}`;
  renderRepoInfo();
  if (token) {
    backend.github.setToken(token);
    await loadFromRepo(true);
  } else {
    openFile(null);
    validateAll();
    showTokenPanel(false);
    setStatus("처음 사용하려면 GitHub 토큰을 설정하세요.", "error");
  }
}

backend.onAuth(async (user) => {
  S.user = user;
  $("user-label").textContent = user ? (user.email || "") : "";
  $("btn-logout").hidden = !user;
  if (!user) { showGate("🔒", "관리자 계정으로 로그인하세요.\n지정된 마스터 계정만 스크립트를 열고 수정할 수 있습니다.", true); return; }
  if ((user.email || "").toLowerCase() !== MASTER_EMAIL.toLowerCase()) {
    showGate("⛔", `${user.email} 계정에는 관리자 권한이 없습니다.\n다른 계정으로 로그인하려면 로그아웃하세요.`, false);
    return;
  }
  showGate("⏳", "서버에서 관리자 권한을 확인하는 중...", false);
  let token;
  try {
    token = await backend.readToken();
  } catch (e) {
    console.error(e);
    showGate("⛔", `서버에서 관리자 권한을 확인하지 못했습니다. (${e.code || e.message})\n\nFirebase 콘솔 → Firestore → 규칙에 최신 firestore.rules 가 게시되었는지 확인하세요.`, false);
    return;
  }
  await enterApp(token);
});

$("btn-login").onclick = async () => {
  try { await backend.signIn(); }
  catch (e) {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      showGate("⚠️", `로그인 실패: ${e.code || e.message}\n${location.protocol === "file:" ? "파일로 직접 열면 로그인할 수 없습니다. 배포 사이트나 localhost 에서 여세요." : ""}`, true);
    }
  }
};
$("btn-logout").onclick = async () => {
  if (isDirty() && !confirm("저장하지 않은 변경 사항이 있습니다. 로그아웃할까요?")) return;
  await backend.signOut();
};
$("btn-new").onclick = newFile;
$("btn-rename").onclick = renameFile;
$("btn-delete").onclick = deleteFile;
$("import-files").onchange = (e) => readInputFiles(e.target);
$("import-dir").onchange = (e) => readInputFiles(e.target);
$("btn-export").onclick = () => { if (S.current) download(S.current, S.files.get(S.current).text); };
$("btn-export-all").onclick = exportAll;
$("btn-reload").onclick = () => loadFromRepo(false);
$("btn-check").onclick = () => { const scn = validateAll(); setStatus(`검사 완료 — 오류 ${scn.errors.length}건, 경고 ${scn.warnings.length}건`, scn.errors.length ? "error" : "ok"); };
$("btn-save").onclick = saveAll;
$("btn-token-save").onclick = saveToken;
$("btn-token-change").onclick = () => showTokenPanel(true);
$("btn-token-cancel").onclick = () => { $("token-panel").hidden = true; };
window.addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });

// 문법 도움말
$("help-body").innerHTML = `
<pre># 주석
@scene 장면id          대사·명령 묶음
화자: 대사              대화 한 줄 (\\n 또는 들여쓴 다음 줄 = 줄바꿈)
> 명령 인자             아래 명령표
? 조건 -> 장면id        조건이 맞으면 이동
-> 장면id               무조건 이동

@event id x,y 장소이름  맵 좌표 이벤트 (장면과 같은 문법)
* sprite 키 [when 조건] 맵에 그릴 NPC

@quest N               플래그 N 이상일 때 HUD 목표
@text 키               title_desc / ending_title / ending_body

조건: flag == 1, lv >= 4, gold >= 100,
      joined elf, !joined elf, item potion >= 1
      (and 로 여러 개)</pre>
<table>${ScenarioFormat.COMMAND_HELP.map(([c, d]) => `<tr><td>&gt; ${c}</td><td>${d}</td></tr>`).join("")}</table>
<p>필수 장면: <code>intro</code>(새 게임), <code>party_wiped</code>(전멸 후)<br>
파티 id: ${PARTY_DEFAULTS.map(m => m.id).join(", ")}<br>
적 id: ${Object.keys(ENEMIES).join(", ")}<br>
스프라이트: ${Object.keys(SPRITES).join(", ")}</p>`;

window.adminApp = { S, validateAll, saveAll, loadFromRepo, importTexts, openFile, gotoLine, isDirty };
