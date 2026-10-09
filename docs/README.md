# docs — 성경 읽기 웹사이트 기획 문서

이 폴더는 구현 전에 정리한 **한글 기획 문서**입니다.

> **현재 단계:** 기획·자료 정리만 완료합니다.  
> React 앱 코딩, 빌드 설정, 컴포넌트 구현은 **아직 하지 않습니다.**

## 읽는 순서

1. [00-overview.md](00-overview.md) — 제품 개요와 핵심 원칙
2. [01-product-requirements.md](01-product-requirements.md) — 기능 요구사항
3. [02-information-architecture.md](02-information-architecture.md) — 화면 구조·흐름
4. [03-data-model.md](03-data-model.md) — CSV·성경 본문 데이터
5. [04-ui-screens.md](04-ui-screens.md) — 화면별 UI 스펙
6. [05-progress-storage.md](05-progress-storage.md) — 읽기 상태·localStorage
7. [06-implementation-roadmap.md](06-implementation-roadmap.md) — 후속 구현 순서

## 참조 자료 위치

| 자료 | 경로 |
|---|---|
| 원본 개발 지시서 | [`../cursor_bible_reading_development_guide.md`](../cursor_bible_reading_development_guide.md) |
| 일정 CSV | [`../asset/schedule/bible_reading_schedule.csv`](../asset/schedule/bible_reading_schedule.csv) |
| 성경 본문 | [`../asset/bible/개역개정-text/`](../asset/bible/개역개정-text/) |
| 화면 HTML | [`../asset/design/bible_reading_screen_design_v2.html`](../asset/design/bible_reading_screen_design_v2.html) |
| 스크린샷 | [`../asset/design/screenshots/`](../asset/design/screenshots/) |
| asset 안내 | [`../asset/README.md`](../asset/README.md) |

## 문서와 구현의 관계

- `docs/`의 결정은 이후 React 구현의 기준입니다.
- UI 시각 참고는 HTML·스크린샷을 따르고, **상태 규칙·저장 스키마는 본 기획 문서(개발 가이드 기반)** 를 우선합니다.
- 구현은 [06-implementation-roadmap.md](06-implementation-roadmap.md)의 별도 승인 후 진행합니다.
