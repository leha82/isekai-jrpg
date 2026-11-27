# 10. Firebase 설정 가이드 (클라우드 세이브용)

> 상태: ✅ 프로젝트 `isekai-jrpg` 생성, 코드 연결 완료 (2026-11-27) — 동작 사양과 요금 조건은 [07_systems.md](07_systems.md#클라우드-세이브--로그인-)를 보세요.

## 현재 프로젝트 정보

| 항목 | 값 |
|---|---|
| 프로젝트 ID | `isekai-jrpg` |
| authDomain | `isekai-jrpg.firebaseapp.com` |
| 웹 앱 ID | `1:354478953656:web:ad385c633ac5a1d344104d` |
| 설정값 위치 | `js/config.js` 의 `FIREBASE_CONFIG` (마스터 계정 `MASTER_EMAIL` 도 여기) |
| 컬렉션 | `saves`(클라우드 세이브), `scriptKeys`(시나리오 키), `admin`(GitHub 토큰) — [08_tech.md](08_tech.md#firebase-연결-구조) |
| 보안 규칙 원본 | 저장소 루트 [`firestore.rules`](../firestore.rules) |
| 확인 결과 | 로그인하지 않은 상태의 Firestore 읽기·쓰기는 403 PERMISSION_DENIED로 차단됨 (2026-11-27) |
| 실사용 확인 | 배포 사이트에서 Google 로그인 성공, 클라우드 저장 성공 (2026-11-27, 사용자 확인) |
> Firebase 콘솔 화면은 수시로 바뀝니다. 메뉴 이름이 조금 달라도 같은 기능을 찾으면 됩니다.

## 0. 준비
- Google 계정
- **Spark(무료) 요금제만 사용한다.** 진행 중에 "Blaze로 업그레이드" 안내가 나와도 누르지 않는다.

## 1. 프로젝트 만들기
1. https://console.firebase.google.com 에 접속해 Google 계정으로 로그인한다.
2. **프로젝트 만들기**(Create a project)를 누른다.
3. 프로젝트 이름에 예를 들어 `arcadia-jrpg`를 입력한다. 아래에 표시되는 프로젝트 ID는 나중에 바꿀 수 없다.
4. 약관에 동의하고 계속한다.
5. Gemini/AI 지원 안내가 나오면 선택 사항이므로 꺼도 된다.
6. **Google 애널리틱스는 사용 안 함**으로 두고 프로젝트를 만든다. (나중에 켤 수 있다.)
7. 완료되면 프로젝트 개요(Project Overview) 화면이 나온다.

## 2. Google 로그인 켜기 (Authentication)
1. 왼쪽 메뉴에서 **빌드(Build) → Authentication**을 열고 **시작하기**(Get started)를 누른다.
2. **로그인 방법**(Sign-in method) 탭에서 **Google**을 고른다.
3. **사용 설정**(Enable)을 켠다.
4. **프로젝트 지원 이메일**에서 본인 Gmail을 고른다.
5. **저장**한다.
6. **설정**(Settings) 탭 → **승인된 도메인**(Authorized domains)에서 **도메인 추가**를 눌러 `leha82.github.io`를 넣는다.
   - `localhost`는 기본으로 들어 있어서 로컬 테스트도 된다.

## 3. Firestore 데이터베이스 만들기
1. 왼쪽 메뉴에서 **빌드 → Firestore Database**를 열고 **데이터베이스 만들기**를 누른다.
2. 에디션 선택 화면이 나오면 **Standard**를 고른다.
3. 데이터베이스 ID는 기본값 **`(default)`**를 그대로 둔다. **무료 한도는 기본 데이터베이스에만 적용된다.**
4. 위치(Location)는 **`asia-northeast3 (Seoul)`**을 고른다. 위치는 나중에 바꿀 수 없다.
5. 보안 규칙은 **프로덕션 모드**(Start in production mode)를 고른다.
   - 테스트 모드는 30일 동안 누구나 데이터를 읽고 쓸 수 있으므로 고르지 않는다.
6. **만들기**를 누른다.

## 4. 보안 규칙 적용
Firestore Database → **규칙**(Rules) 탭에서 내용을 아래로 바꾸고 **게시**(Publish)를 누른다.
같은 내용이 저장소의 [`firestore.rules`](../firestore.rules)에 있다. 규칙을 바꿀 때는 두 곳을 함께 고친다.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 로그인한 사용자는 자기 uid 아래(예전 단일 세이브 + 슬롯 6개)만 읽고 쓸 수 있다.
    match /saves/{uid} {
      allow read, delete: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['version', 'savedAt', 'player', 'inventory', 'party']);

      match /slots/{slot} {
        allow read, delete: if request.auth != null && request.auth.uid == uid;
        allow create, update: if request.auth != null && request.auth.uid == uid
          && slot in ['auto', '1', '2', '3', '4', '5']
          && request.resource.data.keys().hasOnly(['version', 'savedAt', 'player', 'inventory', 'party']);
      }
    }
    // (scriptKeys · admin · config/admins 규칙은 firestore.rules 전체를 참고)
    // 그 밖의 경로는 모두 차단
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## 5. 웹 앱 등록 & 설정값 복사
1. 프로젝트 개요 옆 ⚙️ → **프로젝트 설정**(Project settings)을 연다.
2. **일반** 탭 아래쪽 **내 앱**(Your apps)에서 **웹 아이콘 `</>`**을 누른다.
3. 앱 닉네임에 예를 들어 `arcadia-web`을 입력한다.
4. **Firebase 호스팅 설정은 체크하지 않는다.** 이 게임은 GitHub Pages로 배포한다.
5. **앱 등록**을 누른다.
6. SDK 추가 화면에서 **`<script>` 태그 사용**(또는 CDN)을 고르고, 아래 형태의 `firebaseConfig` 값을 복사한다.

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "arcadia-jrpg.firebaseapp.com",
  projectId: "arcadia-jrpg",
  storageBucket: "arcadia-jrpg.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef..."
};
```

- 이 값은 웹페이지에 공개되는 식별자라서 비밀번호가 아니다. 보안은 4번의 규칙이 담당한다.
- 복사한 값을 개발 담당(Claude)에게 전달하면 `js/config.js`에 연결한다.

## 7. 시나리오 스크립트용 추가 설정 (2026-11-27)
1. **보안 규칙 다시 게시:** 저장소의 [`firestore.rules`](../firestore.rules) 전체를 Firestore → 규칙에 붙여 넣고 **게시**. (`scriptKeys`, `admin` 규칙과 마스터 계정 `isMaster()` 추가됨)
   - 마스터 계정을 바꾸려면 `firestore.rules` 의 이메일과 `js/config.js` 의 `MASTER_EMAIL` 을 **둘 다** 바꾼다.
2. **GitHub 토큰:** 관리자 페이지 첫 접속 시 입력 ([11_scenario.md](11_scenario.md#github-토큰-최초-1회))
3. **첫 업로드:** 관리자 페이지 → `📁 폴더 가져오기` → 로컬 `scenario-src` 선택 → `🔒 암호화 저장 & 업로드`. 이 업로드 전까지 게임은 "시나리오가 아직 업로드되지 않았습니다" 상태다.

## 8. 세이브 슬롯 추가 설정 (2026-11-27)
1. **보안 규칙 다시 게시:** 저장소의 [`firestore.rules`](../firestore.rules) 전체를 Firestore → 규칙에 붙여 넣고 **게시**. (`saves/{uid}/slots/{slot}` 규칙 추가 — 게시 전에는 클라우드 슬롯 저장이 `permission-denied` 로 실패하고 이 기기에만 저장된다)
2. 따로 만들 컬렉션은 없다. 첫 저장 때 `saves/{uid}/slots/...` 문서가 생긴다.
3. 무료 한도: 자동 저장 클라우드 쓰기는 20초에 최대 1번, 불러오기 창을 열 때 읽기 6회. 혼자 테스트하는 수준에서는 하루 한도(쓰기 2만·읽기 5만)에 한참 못 미친다.

## 9. 플레이어 ID 추가 설정 (2026-11-28)
1. **보안 규칙 다시 게시:** 저장소의 [`firestore.rules`](../firestore.rules) 전체를 Firestore → 규칙에 붙여 넣고 **게시**. (`players/{uid}` 규칙 추가 — 게시 전에는 플레이어 ID 가 화면에는 나오지만 Firestore 저장이 `permission-denied` 로 실패한다. 콘솔에 경고만 남고 게임은 계속된다)
2. 따로 만들 컬렉션은 없다. 로그인하면 `players/{uid}` 문서가 생긴다: `{ playerId, name, createdAt, lastLoginAt }`.
3. 규칙: 본인만 읽기·쓰기(관리자는 읽기), `playerId` 는 `^[A-Z]{6}-[0-9]{10}$` 형식이어야 하고 한 번 정하면 바꿀 수 없다.

## 6. 설정 완료 체크리스트
- [x] 프로젝트 생성 (Spark 요금제 유지)
- [x] Authentication → Google 사용 설정
- [x] 승인된 도메인에 `leha82.github.io` 추가
- [x] Firestore `(default)` DB 생성, 프로덕션 모드 (비로그인 접근 차단 확인)
- [x] 보안 규칙 게시
- [x] 세이브 슬롯 규칙(`saves/{uid}/slots`) 재게시 (2026-11-27, 사용자 확인)
- [x] 플레이어 ID 규칙(`players/{uid}`) 재게시 (2026-11-28, 사용자 확인 — 배포 사이트 로그인 후 `players` 문서 생성 확인)
- [x] 웹 앱 등록 후 `firebaseConfig` 전달 → 코드 연결 완료
- [x] (시나리오) `firestore.rules` 게시 (2026-11-27 확인)
- [x] (시나리오) 관리자 페이지에서 GitHub 토큰 설정 + 첫 업로드 (커밋 fb552c4)
- [x] (관리자 지정) 최신 `firestore.rules` 다시 게시 — `isAdmin()`·`config/admins` 추가됨 (2026-11-28, 전체 규칙 게시로 함께 적용)
- [x] 시나리오 키 교체 (2026-11-28, 관리자 페이지 저장 → 키 `k20261127174034-eff6ab0d`, 커밋 38a8ccb)

## 문제 해결
로그인에 실패하면 게임 화면에 원인 토스트가 뜨고, F12 콘솔에 `[로그인 실패] <코드>`가 기록된다.

| 증상 | 원인 / 해결 |
|---|---|
| 관리자 페이지에서 "서버에서 관리자 권한을 확인하지 못했습니다" | 새 `firestore.rules` 가 게시되지 않음 → 7-1 |
| `index.html`을 더블클릭해 열었더니 버튼이 `☁️ 사용 불가` | `file://`에서는 Firebase 로그인이 안 됨 → VS Code `F5`(http://localhost:8000) 또는 배포 사이트로 접속 |
| Live Server(`127.0.0.1:5500`)에서 `auth/unauthorized-domain` | `127.0.0.1`은 `localhost`와 다른 도메인 → 주소를 `localhost:5500`으로 바꾸거나, 승인된 도메인에 `127.0.0.1` 추가 |
| 배포 사이트에 로그인 버튼이 없음 | 최신 코드가 `main`에 push되지 않음 |
| 로그인 팝업에 `auth/unauthorized-domain` 오류 | 2-6 승인된 도메인에 접속 주소가 없음 (현재: `localhost`, `isekai-jrpg.firebaseapp.com`, `isekai-jrpg.web.app`, `leha82.github.io`) |
| `auth/operation-not-allowed` | Authentication에서 Google 로그인이 꺼져 있음 |
| 로그인 팝업이 바로 닫힘 | 브라우저 팝업 차단 해제 |
| 저장 시 `permission-denied` | 보안 규칙 미게시, 또는 로그인하지 않은 상태 |
| 갑자기 저장이 안 됨 | 무료 한도 초과로 그날(또는 그 달) 기능 중지 — 콘솔 사용량 탭 확인 |

## 8. 관리자 지정 기능 (2026-11-27)
- `firestore.rules` 에 `isAdmin()` 이 추가되었다: 최고 관리자 또는 Firestore `config/admins` 문서의 `emails` 목록에 있는 계정(소문자, 이메일 인증된 Google 계정).
- `scriptKeys` 생성·삭제와 `admin/*` 읽기·쓰기는 관리자, `config/admins` 쓰기는 최고 관리자만.
- **최신 `firestore.rules` 전체를 콘솔에 다시 게시해야** 관리자 페이지의 '관리자 지정' 탭과 다른 관리자의 접속이 동작한다. 게시 전에도 최고 관리자는 이전 규칙으로 계속 쓸 수 있다.
