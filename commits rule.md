# 커밋 메시지 규칙 (Conventional Commits)

이 프로젝트는 [Conventional Commits](https://www.conventionalcommits.org/) 규칙을 따릅니다.

## 기본 형식

```
<type>(<scope>): <subject>

<body>

<footer>
```

- `scope`, `body`, `footer`는 선택 사항입니다.
- 한 줄 요약(`subject`)만으로 충분하면 `body`/`footer`는 생략해도 됩니다.

## Type 종류

| type       | 설명                                             |
| ---------- | ------------------------------------------------ |
| `feat`     | 새로운 기능 추가                                  |
| `fix`      | 버그 수정                                         |
| `docs`     | 문서 수정 (README, 주석 등)                       |
| `style`    | 코드 동작에 영향 없는 포맷팅, 세미콜론 등 스타일 변경 |
| `refactor` | 기능 변경 없는 코드 구조 개선                     |
| `perf`     | 성능 개선                                         |
| `test`     | 테스트 추가/수정                                  |
| `build`    | 빌드 시스템, 패키지 의존성 변경 (npm, vite 설정 등) |
| `ci`       | CI 설정 변경                                      |
| `chore`    | 그 외 자잘한 작업 (빌드 산출물, 패키지 매니저 설정 등) |
| `revert`   | 이전 커밋 되돌리기                                |

## Subject 작성 규칙

- 명령문, 현재형으로 작성 (예: "추가" O, "추가함/추가했음" X)
- 첫 글자는 소문자 (영문 subject일 경우)
- 끝에 마침표(`.`) 붙이지 않기
- 50자 이내 권장

## Scope (선택)

변경 범위를 괄호 안에 명시합니다. 예: `feat(auth): 로그인 기능 추가`

이 프로젝트에서 자주 쓰는 scope 예시:
- `ui`, `api`, `router`, `store`, `config`, `deps`

## Body (선택)

- "무엇을"이 아니라 "왜" 변경했는지 설명
- 72자 단위로 줄바꿈 권장

## Footer (선택)

- Breaking Change: `BREAKING CHANGE: <설명>`
- 이슈 연결: `Closes #123`, `Refs #123`

## 예시

```
feat(auth): 소셜 로그인(Google) 추가

Closes #12
```

```
fix(router): 뒤로가기 시 스크롤 위치 초기화 안 되는 문제 수정
```

```
chore(deps): vite 5.4.0으로 업데이트
```

```
refactor: API 호출 로직을 커스텀 훅으로 분리
```

## Breaking Change 표기

기존 동작을 깨뜨리는 변경은 type 뒤에 `!`를 붙이고 footer에 설명을 남깁니다.

```
feat(api)!: 사용자 응답 필드명 변경

BREAKING CHANGE: `userName` 필드가 `name`으로 변경되었습니다.
```
