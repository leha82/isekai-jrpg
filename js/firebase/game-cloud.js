// ==========================================
// Firebase 연결 (게임용, ES module)
// 게임 본체는 Firebase를 직접 import 하지 않고 window.cloud 만 사용한다.
//  - signIn / signOut / load / save : 클라우드 세이브 (saves/{uid})
// 준비가 끝나면 document 에 "cloud-ready" 이벤트를 보낸다.
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const saveRef = () => doc(db, "saves", auth.currentUser.uid);

window.cloud = {
  signIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return signInWithPopup(auth, provider);
  },
  signOut() { return signOut(auth); },
  async load() {
    const snap = await getDoc(saveRef());
    return snap.exists() ? snap.data() : null;
  },
  save(data) { return setDoc(saveRef(), data); }
};

document.dispatchEvent(new Event("cloud-ready"));
updateAuthUI();
onAuthStateChanged(auth, (user) => onCloudAuthChanged(user));
