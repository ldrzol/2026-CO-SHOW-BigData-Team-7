> 분석 보고서 `myoung` 브랜치 변경·검증·미리보기: [2026-10-05 보고서 수정 내역](docs/report-update-20261005.md)

# 삐뚤 (ppittul)

2026 CO-SHOW 빅데이터 7팀 — 하루를 기록하는 일기 PWA.

React + Vite 프론트엔드, Firebase(Auth · Firestore · Hosting · Functions · FCM) 백엔드.

## 주요 기능

- 구글 로그인, 닉네임 설정
- 홈 캘린더 & 일기 작성
- 캐릭터 커스터마이징 (헤어·눈·입·옷 등 파츠 조합)
- 친구, 책
- 설정: 공지, 백업, 저장공간, 알림
- 매일 밤 9시(KST) 일기 알림 푸시

## 폴더 구조

```
frontend/          React + Vite PWA
  src/pages/       화면 (Home, Write, Customize, Setting ...)
  src/components/  공용 컴포넌트 (Calendar, CharacterCanvas, BottomNav ...)
  src/lib/         firebase, push, character 유틸
  public/          캐릭터 파츠 이미지, 아이콘, push-sw.js
backend/           Firebase Functions (TypeScript)
  src/index.ts     ping, dailyReminder(스케줄 푸시)
firestore.rules    Firestore 보안 규칙
firebase.json      Hosting / Functions / Firestore 설정
```

## 시작하기

### 1. 환경 변수

`frontend/.env.example`을 복사해 `frontend/.env`를 만들고 값을 채웁니다.

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_VAPID_KEY=
```

### 2. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

| 명령어 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 (`frontend/dist`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | oxlint 검사 |

### 3. 백엔드 (Node 22)

```bash
cd backend
npm install
npm run serve    # 에뮬레이터
```

## 배포

Firebase 프로젝트: `jbproject7-0705-c1d9`

```bash
cd frontend && npm run build && cd ..
firebase deploy --only hosting
firebase deploy --only firestore:rules
cd backend && npm run deploy
```

## 기여

커밋 메시지는 [commits rule.md](commits%20rule.md) (Conventional Commits)를 따릅니다.
