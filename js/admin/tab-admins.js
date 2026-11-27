// ==========================================
// 탭: 관리자 지정 — 최고 관리자(마스터)만 관리자 목록을 바꿀 수 있다 (Firestore config/admins)
// 관리자는 시나리오·데이터를 편집하고 저장할 수 있지만, 관리자 목록은 바꿀 수 없다.
// ==========================================
import { $, esc, S, backend, setStatus, setBusy } from "./core.js";

const AD = { list: [], loaded: false };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function load() {
  try { AD.list = await backend.readAdmins(); AD.loaded = true; }
  catch (e) { AD.list = []; AD.loaded = false; setStatus(`관리자 목록을 읽지 못했습니다: ${e.code || e.message} (최신 firestore.rules 가 게시되었는지 확인하세요)`, "error"); }
}

function render() {
  const master = S.isMaster;
  $("admins-body").innerHTML = `
    <div class="card-title">👑 최고 관리자</div>
    <div class="admin-row"><b>${esc(MASTER_EMAIL)}</b><span class="tag-master">최고 관리자 (변경 불가)</span></div>
    <p class="muted small">최고 관리자는 js/config.js 의 MASTER_EMAIL 과 firestore.rules 의 isMaster() 에 정해져 있습니다.</p>
    <div class="card-title">관리자 ${AD.list.length}명</div>
    ${AD.list.length ? AD.list.map((e, i) => `<div class="admin-row"><span>${esc(e)}</span>${master ? `<button class="btn small danger" data-del="${i}">삭제</button>` : ""}</div>`).join("") : `<p class="muted">지정된 관리자가 없습니다.</p>`}
    ${master ? `<div class="row"><input id="admin-email" type="email" placeholder="관리자로 지정할 Google 계정 이메일"><button class="btn primary" id="admin-add" data-busy>＋ 관리자 추가</button></div>
      <p class="muted small">관리자는 이 페이지에 로그인해 시나리오·맵·캐릭터·전투 설정을 편집하고 저장할 수 있습니다. 관리자 목록 변경은 최고 관리자만 할 수 있습니다.</p>`
      : `<p class="muted">관리자 목록은 최고 관리자만 바꿀 수 있습니다. (현재 계정: ${esc(S.user ? S.user.email : "")})</p>`}`;
  if (!master) return;
  $("admins-body").querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    const email = AD.list[+b.dataset.del];
    if (!confirm(`${email} 의 관리자 권한을 해제할까요?`)) return;
    save(AD.list.filter(e => e !== email));
  });
  $("admin-add").onclick = () => {
    const email = $("admin-email").value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setStatus("이메일 형식이 아닙니다.", "error"); return; }
    if (email === MASTER_EMAIL.toLowerCase() || AD.list.includes(email)) { setStatus("이미 관리자입니다.", "error"); return; }
    save([...AD.list, email]);
  };
}

async function save(list) {
  setBusy(true);
  try {
    await backend.writeAdmins(list);
    AD.list = list;
    setStatus("✅ 관리자 목록을 저장했습니다. 바로 적용됩니다.", "ok");
  } catch (e) { setStatus(`저장 실패: ${e.code || e.message}`, "error"); }
  finally { setBusy(false); render(); }
}

export function initAdminsTab() {}
export async function showAdminsTab() { if (!AD.loaded) await load(); render(); }
