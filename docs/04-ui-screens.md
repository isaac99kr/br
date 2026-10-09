# 04. 화면 UI 스펙

시각 참고:

- HTML: [`asset/design/bible_reading_screen_design_v2.html`](../asset/design/bible_reading_screen_design_v2.html)
- 스크린샷: [`asset/design/screenshots/`](../asset/design/screenshots/)

상태 라벨은 **`안읽음` / `읽기 시작` / `완료`** 를 사용합니다.

---

## 공통 (모바일 우선)

- 앱 폭 기준 **480px**, 큰 화면에서도 중앙 컬럼
- 글꼴: **Pretendard** (무료, SIL OFL) 고정
- 성경 종류: `/#/settings` 에서 **개역개정 / 표준새번역** (`translationId`: `krv` | `rnksv`)
- 글자 크기: `/#/settings` 에서 **작게 / 보통 / 크게 / 아주 크게** (S/M/L/XL)
  - 저장 키: `bibleReadingSettings:v1`
  - `html[data-font-size]` + CSS 변수로 즉시 반영
- 터치 영역 최소 약 44px
- 홈·날짜찾기: 라이트 브랜드 톤 / 읽기: 다크 몰입형

### 디자인 토큰 (셸)

| 토큰 | 값 |
|---|---|
| `--purple` | `#6856d9` |
| `--paper` | `#f7f8fb` |
| `--ink` | `#252b36` |

### 읽기 다크 토큰

| 토큰 | 값 |
|---|---|
| `--reader-bg` | `#141416` |
| `--reader-fg` | `#ececec` |
| `--reader-accent` | `#c4a484` |

---

## 홈

- 진행률, 이어 읽기, RECENT/NEXT
- 설정·날짜 찾기 진입

## 날짜 찾기

- 필터: 전체 / 구약 / 신약 / 미완료만 (가로 스크롤)
- day 그리드 3열(기본)

## 설정

- 성경 종류 라디오 선택 (개역개정 / 표준새번역) — 읽기 화면 레이아웃은 동일, 본문만 교체
- 글자 크기 라디오 선택 + 미리보기
- 글꼴은 Pretendard로 고정 안내

## 읽기 (다크 전체화면)

참고: `05-bible-app-immersive.png`, `06-bible-app-chrome.png`

- 하단 시트 모달 아님 — 뷰포트 전체
- **아래 스크롤** → 상·하단 크롬 숨김 / **위 스크롤** → 표시
- 구절 탭 다중 선택 → 복사 바
- 복사 형식: `요 20:1 본문…`
- 상태 버튼·이전/다음 (크롬에 배치)
- 본문 끝 스크롤 시 자동 완료 (본문 연결 시에만)

## 접근성

- 키보드 포커스, 상태 텍스트, 선택 `aria-pressed` / `aria-checked`
