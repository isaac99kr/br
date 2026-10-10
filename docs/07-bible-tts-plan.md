# 07. 성경 TTS 음원 기능 기획

> **현재 단계:** Supertonic 3 + 여성 **Angelina**(ko)만. Qwen3-TTS 경로 폐기.  
> 조사·산출물 상세: [08-bible-tts-investigation.md](08-bible-tts-investigation.md)

원본 요청서: [`qwen3_bible_tts_cursor_planning_ko.md`](qwen3_bible_tts_cursor_planning_ko.md) (초기 조사; 엔진은 아래가 우선)

---

## 1. 목표

로컬 TTS로 만든 **고정 한국어 음원**을 정적 파일로 배포한다. 브라우저 내장 TTS·런타임 TTS API는 쓰지 않는다. React + GitHub Pages 구조를 유지한다.

### 필수 UX (기획)

- 번역본·음성 선택 (배포 범위는 아래 결정에 따라 축소 가능)
- 재생 / 일시정지 / 정지, 배속
- 재생에 맞춘 본문 자동 스크롤·현재 절 표시
- 기존 스케줄·`localStorage` 읽기 상태 유지
- 모바일 세로 우선

---

## 2. 스케줄 단일 기준

- **246일** CSV만 사용. 365일 가정·스케줄 변경 금지.
- 경로: `asset/schedule/bible_reading_schedule.csv` → `public/data/schedule.json`

---

## 3. 사용자 결정 (2026-10-10~)

| 항목 | 결정 |
|---|---|
| 대한성서공회 이용 허락 | **지금은 아니오.** 추후 상업화 시 검토 |
| Pages 음원 범위 | **(A) 1번역 × 1음성** — **개역개정(`krv`) × 여성(`Angelina`)** |
| **엔진** | **Supertonic 3** (CPU/ONNX). Qwen3-TTS 폐기 |
| **여성 낭독** | **Angelina** (`tts/voices/angelina.json`, `lang=ko`) |
| **남성 낭독** | **이번 전환에서 제외** |
| 읽기 완료 | **본문 끝 스크롤만** (기존). 오디오는 부가 기능, 완료와 무관 |
| 절 탭 → 그 절부터 재생 | 1차 미포함 권고, 채택 미정 |

설정: [`tts/config/voice-selection.json`](../tts/config/voice-selection.json)

---

## 4. 낭독 텍스트 규칙

1. **장 안내:** 장 시작 시 `{정식 책이름} {장}장`을 **단독 합성**한 뒤 **약 0.4초 무음**, 이어서 본문 청크를 합성한다.  
   (안내와 본문을 한 문자열로 붙이지 않음 — 중간 휴지 깨짐 방지)  
   예: `창세기 1장` |무음| `태초에…`  
   하루가 여러 장이면 **장마다** 안내.
2. **단락 제목 제외:** 절 선두의 `<…>` 제목은 TTS에서 읽지 않는다 (화면 JSON은 유지).  
   예: `"<천지 창조> 태초에…"` → `"태초에…"`.  
   구현: [`tts/scripts/tts_text.py`](../tts/scripts/tts_text.py)

책 정식명 매핑은 [`src/lib/bookNames.ts`](../src/lib/bookNames.ts)와 동일.

---

## 5. 라이선스 (MIT만으로 보지 말 것)

| 대상 | 라이선스 | 의미 |
|---|---|---|
| Python SDK·샘플 코드 | **MIT** | 코드 사용·수정·재배포는 비교적 자유 (저작권 고지) |
| **모델 가중치(ONNX)** | **OpenRAIL-M** (BigScience) | **MIT가 아님.** 이용 제한·고지·귀속 의무 |

공식 요지: *“OpenRAIL-M is not equivalent to MIT.”*  
상세·제한 조항: [08](08-bible-tts-investigation.md), [HF LICENSE](https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE).

TTS와 별개로 **개역개정 본문**은 대한성서공회 저작권 이슈가 남아 있음.

---

## 6. 기술·용량 요약

- 앱·본문(krv/rnksv)·Pages(`base: '/br/'`)는 **이미 구현**.
- Supertonic 3 — 99M, ONNX/CPU, 여성 Angelina 스타일 JSON.
- Pages 게시 **1GB** 한도. 1번역×1음성과 일치.
- 분할: **일차 단위 MP3 + 장 cue**. 생성: [`tts/scripts/generate_day.py`](../tts/scripts/generate_day.py)

상세: [08](08-bible-tts-investigation.md).

---

## 7. Phase

| Phase | 내용 | 상태 |
|---|---|---|
| 0 | 조사·권리·용량 | 조사 완료. 공회 허가 보류 |
| 1 | 엔진·보이스 선정 | **Supertonic 3 + Angelina (여성만)** |
| 2 | 장 안내 분리 + 음질 샘플 | 완료 (`{책} {한글}장 말씀입니다.`) |
| 3 | 소수 일차 + 플레이어 | day-001 `krv` 배포됨 |
| 3b | **213 이중번역 스파이크** | **완료** — `krv`+`rnksv` 여성, 2프로세스 (`--translation`, `--no-publish`) |
| 3c | **절 동기 스크롤 + 음성듣기 UX** | **완료** — 하단「음성듣기」토글, 절 경계 스크롤, 재생 1.5s 후 크롬 숨김 |
| 4 | 214–246 등 확장 생성 | 대기 (검수 후) |
| 5 | React UI 통합 | 스파이크 있음 (여성 고정) |
| 6 | Pages 용량·배포 검증 | 대기 |

### UX (오디오)

- 평소 재생 패널 숨김 → 하단 **음성듣기**로만 연다. 없는 날 → 토스트「준비중입니다」
- 재생 중 **절이 바뀔 때만** 다음 절로 스크롤 (연속 추종 없음). 절 cue 없으면 장 cue+본문 길이로 추정
- 재생 시작 ~1.5초 후 상·하 메뉴 숨김, 일시정지/정지 시 복귀
- 이후 생성분부터 `manifest` day entry에 `verses[].startMs` 기록

### 213 스파이크 실측 (2026-10-10)

| 번역 | 음원 | 생성 | 길이 |
|---|---|---|---|
| `krv` | `public/audio/krv/female/day-213.mp3` | ~549s | ~18.3분 |
| `rnksv` | `public/audio/rnksv/female/day-213.mp3` | ~660s | ~23.7분 |

2프로세스 벽시계 ≈ **11분** (`SUPERTONIC_INTRA_OP_THREADS=4`). 장 안내 예: `요한복음 이십장 말씀입니다.`

---

## 8. 작업 규칙

- 샘플·작업 산출은 로컬 `tts/` (WAV·venv·voice JSON은 git 정책에 따름).
- 공회 허가·상업화 전까지 공개 배포는 신중히.
- `localStorage`·완료 스크롤 로직을 깨지 않는다.
- 새 백엔드 없음. 웹 재생 음원은 정적 파일.

---

## 9. 완료 기준

- [x] `07` / `08` 기획·조사
- [x] 사용자 핵심 결정 반영
- [x] 엔진 교체 (Supertonic 3) + `voice-selection.json`
- [x] 낭독 규칙 모듈 (`tts_text.py`) + 장 안내 분리
- [x] 남성 UI/생성 경로 비활성
- [x] Angelina JSON + day-001(`krv`) 음원 생성·배포
- [x] day-213 `krv`+`rnksv` 이중번역 스파이크
- [x] 읽기 화면 오디오 플레이어 스파이크
- [x] 음성듣기 토글 + 절 경계 스크롤 + 재생 시 크롬 숨김
