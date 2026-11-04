# Folio 제품 및 구현 계획

## 방향

읽는 책, 보는 책, 말하는 책을 하나의 서재에 담는다. 첨부 이미지의 따뜻한 북카페·나무·식물·자연광·종이 느낌을 바탕으로 눈이 편한 독서 경험을 만든다. 기술 구성은 GitHub → Vercel 프런트엔드/API, Firebase Auth + Firestore + Storage. 별도 과금은 서비스·목적·예산·기간을 설명하고 사용자 승인을 받은 후에만 활성화한다.

## 사용자 경험

라운지는 새로 발행된 검수 완료 도서를 우선 전시한다. 내 서재는 읽고 있는 책, 찜한 책, 업로드한 책을 구분한다. 마이페이지는 마지막 위치, 독서 기록, 책갈피, 발췌, 녹음을 통합한다. 발췌에는 책 ID, 판본 ID, 페이지, 문장 위치, 원문, 생성 시각을 보존한다. 개인 업로드는 기본 비공개이며 공동 카탈로그와 분리한다.

텍스트는 선택 가능한 DOM으로 읽고, PDF는 원래 레이아웃을 렌더링한다. 스캔 PDF도 즉시 열 수 있지만 검색·발췌·나레이션에는 OCR과 검수가 필요하다. 큰 PDF는 보이는 페이지 근처만 렌더링한다. 장기적으로 수천 쪽 책의 DOM 가상화와 페이지 캐시 상한을 검증해야 한다.

독서에서는 부드러운 넘김, 단면/양면, 휠 확대·축소, 확대 후 이동, 조도, 종이색, 다크 모드, 키보드 이동, 모바일 접근성을 제공한다. 문장 선택 모드에서는 넘김 제스처와 텍스트 드래그가 충돌하지 않게 분리한다.

## 나레이션과 녹음

기기 오프라인 음성 미리듣기는 현재 페이지의 텍스트 줄을 강조한다. 제작된 AI 음원은 문장별 `{segmentId, startMs, endMs, page, textOffset}`를 저장하고 오디오 시간에 따라 원문 위치를 강조한다. PDF는 텍스트 좌표도 보존한다. 실제 음원 제작은 서버에서 관리자 또는 제작 권한을 검증한 사용자만 요청할 수 있다.

사용자가 읽는 목소리는 명시적인 녹음 시작 버튼으로 수집한다. 중지, 리더 닫기 시 마이크 트랙을 해제한다. 파일, 녹음 시간, 책/페이지 연결을 저장하고 재생·내려받기를 제공한다. 배포 후 업로드 보존 기간, 개인별 용량, 삭제 정책을 정한다.

## 운영 대시보드

| 영역 | 운영 버전의 목적 | 현재 상태 |
| --- | --- | --- |
| 개요 | 도서 수, 원고, 검수 대기, 제작 상태, 비용 한도 | 로컬 데이터 집계 |
| 도서·원고 | 제목/저자/언어/출처/권리/표지/판본/상태 | 메타데이터 편집, 권리 기록 |
| 제작 대기열 | 표지/TTS/OCR, 승인, 취소, 실패, 재시도 | 승인 대기 목록만 저장 |
| 사용자·권한 | 사용자 조회, 관리자·편집자·제작자 구분 | 정책표만 표시, 실제 계정 미연결 |
| 발행 | 원고·이미지·음성 검수 후 공개 | 로컬 전시 상태, 온라인 발행 없음 |
| 감사 기록 | 누가 무엇을 승인·발행·변경했는지 추적 | 서버 연결 후 구현 |

권한은 Firebase custom claims와 서버 토큰 검증으로 판단한다. localStorage, UI 역할 선택, 클라이언트의 `isAdmin`은 신뢰하지 않는다. 관리자라도 별도 비용 승인 없는 생성은 실행할 수 없다. 편집자는 검수 가능, 제작 권한자는 허가된 원고 범위에서만 제작 요청 가능, 일반 사용자는 개인 자료만 관리한다.

## 데이터 모델 초안

- `users/{uid}`: displayName, locale, theme, updatedAt. 역할은 문서 수정으로 승격 불가.
- `users/{uid}/library/{bookId}`: 개인 업로드 메타데이터, favorite, progress, lastRead.
- `users/{uid}/collections/{entryId}`: kind, bookId, editionId, page, text, offset, createdAt.
- `users/{uid}/recordings/{recordingId}`: bookId, page, storagePath, mime, duration, createdAt.
- `catalog/{bookId}`: 검수된 공개 도서, 원문/번역/표지 권리 근거, 언어, 발행 시각.
- `productionJobs/{jobId}`: requester, input version, type, approved scope, state, attempts, output refs.
- `billingApprovals/{approvalId}`: provider, purpose, budget, currency, startsAt, expiresAt, usage. 서버 전용.
- `auditLog/{eventId}`: actor, action, entity, timestamp. 서버만 쓰기.
- Storage: `users/{uid}/uploads/*`, `users/{uid}/recordings/*`, 검수 카탈로그 원고·표지·음성은 별도 비공개 경로와 서버가 발급하는 접근 URL.

## 고전 제작 흐름

후보 수집 → 출처와 대상 국가/지역 검토 → 원문·번역본·삽화별 권리 검수 → 텍스트 정규화 → 표지 → TTS와 타임코드 → 사람의 검수 → 발행. 단순히 오래된 작품이라는 이유로 번역·삽화까지 사용 가능하다고 판단하지 않는다. 출처나 권리가 불확실한 항목은 공개 대기 상태로 남긴다. 현재 제공하는 네 편은 프로젝트에서 새로 작성한 창작 샘플이며 고전 완역본으로 표시하지 않는다.

## 배포와 남은 작업

1. 현재 로컬 리더의 브라우저 회귀 검증: 한 페이지/여러 페이지, TXT/PDF/이미지, 확대, 선택, 재접속 보존, 녹음 권한 거절, 모바일.
2. GitHub 저장소 확인, 기존 파일과 충돌 검토, Vercel 프로젝트·프리뷰 대상 확인. Git push가 자동 배포를 시작할 수 있으므로 비용 조건 승인 전 push하지 않는다.
3. Firebase 프로젝트 및 리전 확인. 에뮬레이터에서 개인 자료 격리, 무인증 차단, 관리자/제작 권한, 카탈로그 쓰기 차단 테스트.
4. Firebase Auth와 데이터 어댑터 구현, 서버 토큰/claims 검증, 사용자별 저장·동기화, 관리자 보안 경계 적용.
5. 공급자별 OCR/TTS/표지 단가·사용량·무료 한도·자동 초과 조건 확인 및 예산 승인. 승인이 없으면 생성 비활성화 유지.
6. 승인 범위 검사, 원자적 예산 예약, idempotency, 큐, 재시도 상한, 감사 기록 구현. 장시간 음원 작업은 Vercel 요청 수명에 의존하지 않는 검증된 작업 처리 구조 사용.
7. 고전 출처·번역 검수, AI 음원과 동기화, 전체 번역 리소스/날짜/숫자/접근성 및 작은 화면 검증.

## 참고한 공식 자료

- [Vercel 정적 프로젝트 설정](https://vercel.com/docs/project-configuration/vercel-json)
- [Firebase Authentication과 Security Rules](https://firebase.google.com/docs/rules/rules-and-auth)
- [Firebase custom claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Firebase Storage Rules API](https://firebase.google.com/docs/reference/security/storage)

이 규칙과 구성은 실제 클라우드에 적용하거나 에뮬레이터로 검증하지 않은 초안이다. 완성된 운영 보안으로 간주하지 않는다.
