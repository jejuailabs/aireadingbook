# Firebase 연결 메모

## 제공된 대상

- 프로젝트: `automovie-4498a`
- 웹 앱: `1:962678187965:web:02d9e4f8e3ad3e63b394d4`
- 인증 도메인: `automovie-4498a.firebaseapp.com`
- 버킷: `automovie-4498a.firebasestorage.app`
- Analytics 측정 ID: `G-0V69CVTQRQ`
- 설정 파일: `dist/firebase-config.js`

이 값들은 사용자가 제공한 설정을 그대로 저장한 것이며, Firebase 서버로 유효성 확인 요청을 보내지는 않았습니다. 설정 준비와 실제 연결은 구분합니다. 현재 `initialized`는 false이고 인증, Firestore, Storage는 미연결, Analytics는 비활성입니다. SDK import나 `getAnalytics()`를 실행하는 코드도 추가하지 않았습니다.

## 과금 확인 후 연결

설정 코드는 서비스 사용 비용의 승인이 아닙니다. 현재 프로젝트의 요금제, 잔여 무료 한도, 버킷 리전, 기존 사용량, 결제 계정 조건은 아직 확인되지 않았습니다.

Firebase 공식 안내상 Cloud Storage 접근에는 Blaze 요금제가 필요합니다. `firebasestorage.app` 버킷은 Google Cloud Storage의 저장량, 작업 수, 네트워크 사용량 등의 과금 조건을 따릅니다. 무료 사용량은 리전·조건에 따라 달라지며 예상 월비용은 현재 정보만으로 산정할 수 없습니다. 유료 초과 사용을 허용하거나 요금제를 올리지 않았습니다.

실제 연동 전에 다음을 확인합니다.

1. 현재 플랜(Spark/Blaze), 버킷 리전, 남은 무료 한도, 월별 비용 상한에 대한 사용자 요구와 과금 조건.
2. 이 프로젝트를 다른 앱과 공유하는지 확인. 공유 프로젝트라면 기존 Firestore/Storage 규칙·인증 사용자를 보존하고 책 서비스 데이터 경로를 분리.
3. 로그인 방식 선택, 실제 Vercel 도메인을 Auth 허용 도메인에 등록, 브라우저 SDK를 로컬 빌드에 포함.
4. Firebase 에뮬레이터에서 개인 데이터 격리, 무인증 차단, 관리자/제작자 권한, 파일 경로·크기·형식 제한 검증.
5. 서버의 ID 토큰 검증 및 custom claims로 관리자·제작 권한 적용. 웹 설정에 포함된 apiKey는 관리자 인증 정보가 아니며 권한을 부여하지 않음.
6. 승인된 서비스와 예산·기간 범위에서만 실제 인증/동기화/업로드를 활성화. Analytics도 별도의 활성화 상태로 관리.

현재의 `firebase/*.rules`는 독립 서비스용 초안입니다. 공유 여부와 기존 원격 규칙을 검토하기 전 `firebase deploy`로 적용하지 않습니다. 클라우드 호출을 허용하도록 CSP를 확장하거나 Vercel 환경변수를 변경하지 않았습니다. GitHub push 및 Vercel 자동 배포에 관한 이전 확인도 아직 대기 상태입니다.

## 공식 근거

- [웹 SDK 설정](https://firebase.google.com/docs/web/setup)
- [Storage 요금제 및 버킷 변경 안내](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
- [Firebase 요금표](https://firebase.google.com/pricing)

위 자료는 서비스의 일반 조건입니다. 이 프로젝트의 결제 상태·무료 잔여량을 확인한 결과로 간주하지 않습니다.


## 2026-11-04 Google 로그인 연결

이 문서의 초기 미연결 상태에서 Google Authentication을 추가했습니다. Google 제공자는 기존에 활성화되어 있었고 원격 설정은 변경하지 않았습니다. 앱의 CSP에는 인증 iframe과 Identity Toolkit / Secure Token 요청에 필요한 출처만 추가했습니다. 실제 배포 도메인 허용과 검증 범위는 [Google 로그인 안내](GOOGLE-LOGIN.md)를 기준으로 확인하세요.
