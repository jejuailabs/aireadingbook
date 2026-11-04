# Google 로그인

## 구현

- 상단 로그인 버튼과 마이페이지 계정 카드에서 로그인 창을 엽니다.
- Firebase SDK 13.2.0의 GoogleAuthProvider / signInWithPopup을 사용합니다.
- 로그인 상태는 Firebase SDK가 IndexedDB/local/session persistence로 관리합니다.
- 계정 이름·이메일 표시, 로그아웃, 팝업 취소·차단·미허용 도메인 등 오류 안내를 제공합니다.
- 이름·이메일은 textContent로 표시합니다. 앱 상태에 OAuth access token이나 관리자 키를 복사하지 않습니다.
- 로그인은 관리자 권한을 부여하지 않습니다. 기존 운영 화면은 로컬 미리보기이며 생성 API는 계속 차단됩니다.
- 로그인해도 책·발췌·녹음은 동일 브라우저의 공용 로컬 서재에 남습니다. 계정별 저장소 분리 및 클라우드 동기화는 아직 구현되지 않았습니다.

## 현재 Firebase 설정 (2026-11-04 읽기 전용 확인)

- 프로젝트: automovie-4498a
- 인증 유형: FIREBASE_AUTH (일반 Firebase Authentication)
- Google 제공자: 활성화, OAuth client ID 존재
- 허용 도메인: localhost, automovie-4498a.firebaseapp.com, automovie-4498a.web.app
- Cloud Billing 정보 조회는 403으로 확인 불가. 설정이나 요금제 변경은 하지 않았습니다.

Vercel에서 로그인하려면 **실제 서비스 도메인**을 Firebase Console → Authentication → Settings → Authorized domains에 추가해야 합니다. 프로토콜/경로 없이 호스트 이름만 입력합니다. 임의의 preview 도메인을 전부 허용하지 않습니다. 기존 다른 앱의 도메인은 삭제하지 않습니다.

## 비용 및 검증

일반 Firebase Authentication의 Google 로그인은 무료 서비스입니다. Identity Platform으로 업그레이드할 경우에는 월간 활성 사용자에 따른 다른 요금 정책이 적용됩니다. SMS/Identity Platform 업그레이드, Firestore, Storage, Analytics는 이 작업에서 활성화하지 않았습니다.

정적 검사 및 모의 인증 테스트로 중복 팝업 방지, 상태 복원, 로그아웃 성공/실패, 오류 메시지의 비밀정보 제외를 검증합니다. 실제 Google 계정 선택·로그인 완료는 사용자가 진행해야 합니다.

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/faq-and-troubleshooting
- https://firebase.google.com/pricing
