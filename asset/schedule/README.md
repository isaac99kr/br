# 읽기 일정 CSV

| 파일 | 스케줄 ID | 설명 |
|---|---|---|
| [`chrono-246.csv`](chrono-246.csv) | `chrono-246` | 연대기순 246일 (구약 183 / 신약 63) |
| [`yearly-365.csv`](yearly-365.csv) | `yearly-365` | 1년 1독 날짜별 통독표 (비윤년 365일) |
| [`mcheyne-365.csv`](mcheyne-365.csv) | `mcheyne-365` | 맥체인 1년 4본문 통독표 (비윤년 365일) |

- 구분자: 세미콜론 (`;`), UTF-8
- 빌드: `npm run data` → `public/data/schedules.json` + `public/data/schedules/{id}.json`
- 하위 호환용으로 예전 파일명 `bible_reading_schedule.csv`는 `chrono-246.csv`와 동일 내용을 유지합니다.
