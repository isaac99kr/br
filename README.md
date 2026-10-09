# 성경 읽기 (Bible Reading Journey)

246일 성경 읽기 일정을 따라가며 **진행 상황을 확인하고 이어 읽는** React 웹앱입니다.

- 일정: `asset/schedule/bible_reading_schedule.csv` (1~246일, 구약 31주 / 신약 11주)
- 본문: 개역개정 / 표준새번역 (`asset/bible/…` → `public/data/bible/{krv|rnksv}/*.json`)
- 진행 기록: 브라우저 `localStorage` (`bibleReadingProgress:v1`)
- 서버/DB/로그인 없음
- 배포 대상: GitHub Pages (`/br/`)

기획 문서는 [`docs/`](docs/README.md)를 참고하세요.

## 로컬 실행

```bash
npm install
npm run data    # asset → public/data 재생성 (선택)
npm run dev
```

브라우저에서 Vite가 안내하는 주소(보통 `http://localhost:5173/br/`)로 엽니다.

> `base`가 `/br/` 이므로 개발 서버도 `/br/` 경로를 사용합니다.

## 빌드

```bash
npm run build
npm run preview
```

결과물은 `dist/` 입니다.

## GitHub Pages

- Vite `base: '/br/'`
- 라우팅: **HashRouter** (`/#/`, `/#/find`, `/#/read/1`) — Pages에서 새로고침·직접 접근에 안전
- 워크플로: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)

저장소 Settings → Pages → Source를 **GitHub Actions**로 두면 `main` 푸시 시 자동 배포됩니다.

로컬 변경을 Pages에 반영하려면 **먼저 커밋**한 뒤:

```bash
npm run pages          # origin/main 푸시 → 해당 커밋 배포 완료까지 대기
npm run pages:status   # 최근 배포 실행 목록
```

> `npm run pages`는 미커밋 변경이 있으면 중단합니다. 원격만 다시 돌리는 `workflow_dispatch`가 아니라, **방금 푸시한 커밋**의 Actions 배포를 기다립니다.

예상 URL: `https://isaac99kr.github.io/br/`

## 주요 화면

| 경로 | 설명 |
|---|---|
| `/#/` | 홈 — 진행률, 이어 읽기 |
| `/#/find` | 날짜 찾기 — 구약/신약·주차별 |
| `/#/read/:day` | 읽기 화면 (설정 오버레이 포함) |

## 진행 상태

| 코드 | 표시 |
|---|---|
| `unread` | 안읽음 |
| `in_progress` | 읽기 시작 |
| `completed` | 완료 |

- 안읽음 날짜를 열면 `읽기 시작`
- 본문 영역 끝으로 스크롤하면 `완료` (본문이 연결된 경우만)
- 완료 해제 시 `안읽음`
- 진행률은 **완료만** 집계
- 진행 기록은 **이 브라우저에만** 저장됩니다

## 폴더 구조

```text
asset/     원본 일정·본문·디자인
docs/      기획 문서
public/data/  앱이 읽는 JSON (schedule, books, translations, bible/{krv|rnksv})
src/       React 앱
```
