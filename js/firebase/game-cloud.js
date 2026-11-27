// ==========================================
// Firebase 연결 (게임용, ES module)
// 게임 본체는 Firebase를 직접 import 하지 않고 window.cloud 만 사용한다.
//  - signIn / signOut
//  - loadSlots / saveSlot / deleteSlot : 세이브 슬롯 saves/{uid}/slots/{auto|1..5}
//  - loadLegacy : 슬롯 도입 전 단일 세이브 saves/{uid} (자동 저장 슬롯으로 옮길 때만 읽는다)
//  - loadProfile / saveProfile : 플레이어 정보 players/{uid} (플레이어 ID 등)
// 준비가 끝나면 document 에 "cloud-ready" 이벤트를 보낸다.
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const uid = () => auth.currentUser.uid;
const slotRef = (id) => doc(db, "saves", uid(), "slots", String(id));

window.cloud = {
  signIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return signInWithPopup(auth, provider);
  },
  signOut() { return signOut(auth); },
  async loadSlots() {
    const snap = await getDocs(collection(db, "saves", uid(), "slots"));
    const out = {};
    snap.forEach(d => { out[d.id] = d.data(); });
    return out;
  },
  saveSlot(id, data) { return setDoc(slotRef(id), data); },
  deleteSlot(id) { return deleteDoc(slotRef(id)); },
  async loadProfile() {
    const snap = await getDoc(doc(db, "players", uid()));
    return snap.exists() ? snap.data() : null;
  },
  // 처음이면 createdAt 도 기록. playerId 는 한 번 정하면 바꿀 수 없다 (firestore.rules)
  saveProfile({ playerId, name, created }) {
    const data = { playerId, name: String(name || "").slice(0, 60), lastLoginAt: serverTimestamp() };
    if (created) data.createdAt = serverTimestamp();
    return setDoc(doc(db, "players", uid()), data, { merge: true });
  },
  async loadLegacy() {
    const snap = await getDoc(doc(db, "saves", uid()));
    return snap.exists() ? snap.data() : null;
  }
};

document.dispatchEvent(new Event("cloud-ready"));
updateAuthUI();
onAuthStateChanged(auth, (user) => onCloudAuthChanged(user));
