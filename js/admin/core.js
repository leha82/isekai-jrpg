// ==========================================
// 관리자 페이지 공용 모듈: Firebase·GitHub 백엔드, 공유 상태, 데이터 로드/커밋, UI 헬퍼
// 테스트: window.__ADMIN_TEST_BACKEND 가 있으면 Firebase/GitHub 대신 그것을 쓴다.
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- GitHub API (fine-grained PAT, Contents 읽기/쓰기) ----------
export function createGithubApi() {
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

// ---------- Firebase 백엔드 ----------
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
    // 관리자가 아니면 보안 규칙에 의해 permission-denied (서버 측 권한 확인 겸용)
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
    async pruneKeys(keep, alwaysKeep = []) {
      const snap = await getDocs(query(collection(db, "scriptKeys"), orderBy("createdAt", "desc")));
      const victims = snap.docs.filter((d, i) => i >= keep && !alwaysKeep.includes(d.id));
      await Promise.all(victims.map(d => deleteDoc(d.ref)));
      return victims.length;
    },
    async readAdmins() {
      const snap = await getDoc(doc(db, "config", "admins"));
      return snap.exists() ? (snap.data().emails || []) : [];
    },
    async writeAdmins(emails) { await setDoc(doc(db, "config", "admins"), { emails, updatedAt: serverTimestamp() }); },
    github: createGithubApi()
  };
}

export const backend = window.__ADMIN_TEST_BACKEND || createFirebaseBackend();

// ---------- 공유 상태 ----------
export const S = {
  user: null,
  isMaster: false,
  dataSource: "site",   // 'repo' (GitHub 최신) | 'site' (배포본, 읽기 전용용)
  dataOriginal: {},     // 경로 → 불러온 원문 (변경 감지)
  busy: false
};

// ---------- 상태 표시 ----------
export function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = kind;
}

export function setBusy(b) {
  S.busy = b;
  document.querySelectorAll("[data-busy]").forEach(el => { el.disabled = b; });
}

// ---------- 게임 데이터 로드 (GitHub 최신 → 없으면 배포 사이트) ----------
async function readDataText(path) {
  if (backend.github.hasToken()) {
    const t = await backend.github.readText(path);
    if (t !== null) return t;
  }
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.text();
}

export async function loadAllData() {
  S.dataSource = backend.github.hasToken() ? "repo" : "site";
  const load = async (path) => { const t = await readDataText(path); S.dataOriginal[path] = t; return JSON.parse(t); };
  await Promise.all(DATA_FILES.map(async n => { GameData[n] = await load(`${DATA_DIR}/${n}.json`); }));
  GameData.maps = {};
  await Promise.all(GameData.game.maps.map(async id => { GameData.maps[id] = await load(`${DATA_DIR}/maps/${id}.json`); }));
  indexGameData();
  if (!Images.tiles) {
    Images.tiles = await loadImage(GameData.tiles.image);
    Images.characters = await loadImage(GameData.sprites.characters.image);
    Images.monsters = await loadImage(GameData.sprites.monsters.image);
  }
}

// ---------- JSON 직렬화 (생성기와 같은 형식) ----------
export function dataToText(obj) { return JSON.stringify(obj, null, 1) + "\n"; }

export function mapToText(m) {
  const keys = ["id", "name", "w", "h", "bgm", "battleBg", "encounter", "ground", "objects", "warps"];
  const lines = ["{"];
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? "," : "";
    if (k === "ground" || k === "objects") lines.push(` "${k}": [\n${m[k].map(r => "  " + JSON.stringify(r)).join(",\n")}\n ]${comma}`);
    else if (k === "warps") lines.push(` "${k}": [\n${(m.warps || []).map(w => "  " + JSON.stringify(w)).join(",\n")}\n ]${comma}`);
    else lines.push(` "${k}": ${JSON.stringify(m[k] ?? null)}${comma}`);
  });
  lines.push("}");
  return lines.join("\n") + "\n";
}

export function isDataDirty(path, text) { return S.dataOriginal[path] !== text; }

// 데이터 파일 커밋 (평문 JSON). changes: [{ path, content }]
export async function commitData(changes, message) {
  if (!backend.github.hasToken()) throw new Error("GitHub 토큰을 먼저 설정하세요 (상단 '🔐 토큰').");
  const real = changes.filter(c => c.content === null || isDataDirty(c.path, c.content));
  if (!real.length) return null;
  await backend.github.checkAccess();
  const sha = await backend.github.commit(real, message);
  real.forEach(c => { if (c.content === null) delete S.dataOriginal[c.path]; else S.dataOriginal[c.path] = c.content; });
  return sha;
}

// ---------- 작은 UI 헬퍼 ----------
export function options(list, selected, labelFn = (x) => x) {
  return list.map(v => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(labelFn(v))}</option>`).join("");
}

export function numInput(id, value, attrs = "") { return `<input type="number" id="${id}" value="${esc(value)}" ${attrs}>`; }

// 캐릭터 시트 프레임을 캔버스에 그린다
export function drawCharPreview(canvas, key, scale = 3) {
  const c = canvas.getContext("2d");
  c.imageSmoothingEnabled = false;
  canvas.width = 16 * scale * 4 + 12; canvas.height = 16 * scale;
  c.clearRect(0, 0, canvas.width, canvas.height);
  ["down", "left", "right", "up"].forEach((d, i) => {
    const s = charSrc(key, d, 1);
    if (s) c.drawImage(Images.characters, s.sx, s.sy, s.size, s.size, i * (16 * scale + 4), 0, 16 * scale, 16 * scale);
  });
}

export function drawMonsterPreview(canvas, key, scale = 3) {
  const s = monsterSrc(key);
  const c = canvas.getContext("2d");
  canvas.width = (s ? s.w : 32) * scale; canvas.height = (s ? s.h : 32) * scale;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, canvas.width, canvas.height);
  if (s) c.drawImage(Images.monsters, s.x, s.y, s.w, s.h, 0, 0, s.w * scale, s.h * scale);
}

export function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// 탭 사이 이동 (이벤트 → 시나리오 줄 이동 등)
export const bus = { openTab: null, gotoScript: null, scenarioChanged: [] };
