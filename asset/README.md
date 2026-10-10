# asset

프로젝트에서 사용하는 **원본 자료**를 모아 두는 폴더입니다.  
성경 본문 내용을 임의로 변조하지 않습니다. 읽기 일정은 등록된 CSV만 사용합니다.

## 하위 구조

| 경로 | 설명 |
|---|---|
| `schedule/chrono-246.csv` | 연대기순 246일 (구약 183 / 신약 63) |
| `schedule/yearly-365.csv` | 1년 1독 날짜별 통독표 (365일) |
| `schedule/README.md` | 스케줄 CSV 안내 |
| `bible/개역개정-text/` | 개역개정 성경 본문 txt 66권 |
| `bible/개역개정-text.zip` | 본문 원본 zip 보관본 |
| `design/bible_reading_screen_design_v2.html` | 화면 디자인 HTML 프로토타입 |
| `design/screenshots/` | 홈·날짜찾기·읽기 화면 스크린샷 |

## 일정 CSV

- 구분자: `;`, UTF-8
- 스케줄 ID·빌드 출력: [`schedule/README.md`](schedule/README.md), [docs/03-data-model.md](../docs/03-data-model.md)
- 새 일정 추가: CSV 작성 → `scripts/build-data.py`의 `SCHEDULES`에 등록 → `npm run data`

## 성경 본문

두 번역을 지원합니다. `npm run data`가 원본을 `public/data/bible/{krv|rnksv}/` UTF-8 JSON으로 정규화합니다.

### 개역개정 (`krv`)

- 경로: `bible/개역개정-text/`
- 파일: `1-01창세기.txt` ~ `2-27요한계시록.txt` (66개)
- 줄 형식 예: `창1:1 <천지 창조> 태초에 하나님이…`
- **인코딩: CP949 (EUC-KR)** — UTF-8로 열면 깨집니다.

### 표준새번역 (`rnksv`)

- 경로: `bible/표준새번역개정판.txt` (단일 UTF-8 파일)
- 책 헤더: `01 0:0 창,창세기,50`
- 절 형식 예: `01 1:1 <천지창조> …`
- 빌드 시 각주·단락 기호(`○`)를 제거하고, 약어 `라`→`스`, `더`→`에`로 정규화합니다.

원본 폴더/파일 내용은 보존합니다.

## 디자인

- HTML 프로토타입과 스크린샷은 UI 참고용입니다.
- 제품 상태 라벨은 기획 문서 기준으로 **`안읽음` / `읽기 시작` / `완료`** 를 사용합니다.
  (프로토타입의 “읽는 중”은 `읽기 시작`과 동일 의미로 통일)

## 원본 수정 금지

- 성경 본문 내용을 임의로 생성·변조하지 않습니다.
- 일정 CSV는 등록된 스케줄 범위에서만 추가·수정하며, 임의로 가짜 일차를 만들지 않습니다.
- 변경이 필요하면 `docs/`에 이슈를 남기고, 원본은 별도 합의 후에만 수정합니다.
