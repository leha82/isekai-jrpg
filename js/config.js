// ==========================================
// 공통 설정 (게임 index.html · 관리자 admin.html 공용)
// 여기 값은 모두 공개 정보다. 실제 접근 제어는 firestore.rules 가 담당한다.
// ==========================================

// Firebase 웹 앱 설정 (공개 식별자)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD9zsNGKyhxM5e4k4LQrH7jfyrW726ko_0",
  authDomain: "isekai-jrpg.firebaseapp.com",
  projectId: "isekai-jrpg",
  storageBucket: "isekai-jrpg.firebasestorage.app",
  messagingSenderId: "354478953656",
  appId: "1:354478953656:web:ad385c633ac5a1d344104d"
};

// 스크립트 관리자(마스터) 계정. firestore.rules 의 isMaster() 이메일과 반드시 같아야 한다.
const MASTER_EMAIL = "snowdrop.brandon@gmail.com";

// 암호화된 시나리오가 커밋되는 GitHub 저장소
const GITHUB_REPO = { owner: "leha82", repo: "isekai-jrpg", branch: "main" };

// 암호화된 시나리오 폴더 (manifest.json + *.script.enc.json)
const SCENARIO_DIR = "scenario";

// 키 교체 후에도 남겨 둘 이전 키 개수 (GitHub Pages 반영 지연 동안 이전 파일을 풀기 위함)
const SCENARIO_KEEP_KEYS = 3;
