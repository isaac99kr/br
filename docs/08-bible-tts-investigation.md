# 08. 성경 TTS 음원 — 조사·산출물

> **조사일:** 2026-10-10  
> **갱신:** 2026-10-10 — 엔진을 **Supertonic 3 + Angelina(여성만)** 으로 교체. Qwen3-TTS 산출 폐기.  
> **범위:** [07-bible-tts-plan.md](07-bible-tts-plan.md).  
> **원칙:** 확인하지 않은 사실은 단정하지 않음. 추정치에는 가정을 명시함.

원본 요청: [`qwen3_bible_tts_cursor_planning_ko.md`](qwen3_bible_tts_cursor_planning_ko.md)

### 엔진 전환 요약 (현재)

| 항목 | 값 |
|---|---|
| 엔진 | Supertonic 3 (`pip install supertonic`, ONNX/CPU) |
| 보이스 | 여성 Angelina — `tts/voices/angelina.json` (`lang=ko`) |
| 남성 | 제외 |
| 장 안내 | 단독 합성 + ~0.4s 무음 후 본문 |
| SDK 라이선스 | MIT |
| 모델 가중치 | **OpenRAIL-M** (MIT 아님) |
| 생성 스크립트 | `tts/scripts/generate_day.py` |

아래 본문의 Qwen·Sohee·Aiden·instruct 서술은 **초기 조사 기록**으로 남긴다. 구현·배포는 위 표를 따른다.

---

## 1. 현재 프로젝트 분석 보고서

### 1.1 기술 스택·배포

| 항목 | 현재 상태 |
|---|---|
| UI | React 19 + Vite 8 + TypeScript, `react-router-dom` **HashRouter** |
| base path | `vite.config.ts` → `base: '/br/'` (`import.meta.env.BASE_URL` 사용) |
| 데이터 빌드 | `npm run data` → `scripts/build-data.py` → `public/data/` |
| 배포 | `.github/workflows/deploy.yml` → GitHub Actions → Pages (`dist`) |
| 백엔드 | 없음 (정적 사이트) |
| TTS / 오디오 | **미구현** |

### 1.2 스케줄 (단일 기준)

| 항목 | 값 |
|---|---|
| 원본 | `asset/schedule/bible_reading_schedule.csv` |
| 앱 입력 | `public/data/schedule.json` (246항목) |
| 범위 | **1~246일차** (365일 아님) |
| 구약/신약 | 구약 31주, 신약 11주 |
| 1일차 | `창1-3장` |
| 246일차 | `계17-22장` |

음원 생성·매핑·용량은 이 246항목만 따른다. 스케줄 변경·재생성 금지.

### 1.3 성경 본문

| 번역본 | ID | 원본 | 빌드 산출 | 스케줄 커버 문자 수(실측) |
|---|---|---|---|---|
| 개역개정 | `krv` | `asset/bible/개역개정-text/` (CP949, 66권) | `public/data/bible/krv/*.json` (66) | **1,842,669**자 / 31,000절 |
| 표준새번역 | `rnksv` | `asset/bible/표준새번역개정판.txt` (UTF-8 단일) | `public/data/bible/rnksv/*.json` (66) | **2,257,930**자 / 31,025절 |

- 표준새번역 **원문 파일 존재함** (`asset/bible/표준새번역개정판.txt`, 약 5.7MB).
- 앱은 `src/lib/bible.ts` + `rangeParser.ts`로 범위→절 로드. 스케줄 전 항목 매핑 **누락 0**.
- 설정: `bibleReadingSettings:v1`에 `translationId` (`krv`\|`rnksv`) 저장.

### 1.4 읽기 상태·UI (재사용)

| 영역 | 경로 | TTS와의 관계 |
|---|---|---|
| 진행 저장 | `src/lib/progress.ts` — 키 `bibleReadingProgress:v1` | **유지**. 키 삭제·비호환 변경 금지 |
| 완료 판정 | `ReaderScreen` — 본문 끝 **스크롤** 시 `completed` | 오디오 종료만으로 완료할지 **정책 미확정** |
| 읽기 화면 | `src/components/ReaderScreen.tsx` | 절 선택·복사 있음. **오디오 플레이어·재생 동기 스크롤 없음** |
| 설정 | `src/pages/SettingsPage.tsx` | 번역본·글자크기·간격. **음성 성별 없음** |
| 라우팅 | `/`, `/find`, `/read/:day` | 읽기 화면에 플레이어 통합이 자연스러움 |

### 1.5 용량 현황 (음원 제외)

| 경로 | 크기(대략) |
|---|---|
| `public/` (본문 JSON 포함) | ~11MB |
| `dist/` 빌드 | ~14MB |
| `.git` | ~11MB |
| 로컬 작업트리(전체, node_modules 포함) | ~233MB |

### 1.6 미구현 (TTS 관점)

- 오디오 파일·매니페스트·생성 파이프라인
- 남성/여성 음성 선택
- 재생/일시정지/정지·배속
- 재생 연동 자동 스크롤·현재 절 하이라이트
- 절 탭 → 해당 위치 재생

### 1.7 재사용 권장

- `loadVersesForRange` / `parseReadingRange` → 생성 파이프라인·동기화의 절 ID 기준
- `BASE_URL` 패턴 → 오디오 URL도 동일
- `useSettings` 확장으로 `voiceGender` 등 추가 (기존 키 마이그레이션 호환)
- 스케줄·진행 로직은 손대지 않고 읽기 화면에 플레이어 레이어만 추가

---

## 2. 기술 선택 비교표

### 2.1 TTS 모델 유형 (Qwen3-TTS)

조사 출처: [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS), Hugging Face 모델 카드 (조사일 2026-10-10)

| 유형 | 용도 | 한국어 | 비고 |
|---|---|---|---|
| **CustomVoice** (0.6B / 1.7B) | 프리셋 화자 + `instruct` 스타일 제어 | 지원 (10개 언어 중) | **우선 후보**. 화자 9명 |
| **VoiceDesign** | 자연어로 음색 설계 | 지원 | 한국어 **남성** 프리셋이 약할 때 후보 |
| **Base** | 보이스 클로닝 등 | 지원 | 참조 음성 권리·일관성 **별도 확인** |

**CustomVoice 화자 (공식 목록)**

| Speaker | 설명 | Native |
|---|---|---|
| Sohee | 따뜻한 한국어 여성, 감정 풍부 | **Korean** |
| Vivian, Serena | 여성 | Chinese |
| Uncle_Fu, Dylan, Eric | 남성 | Chinese (일부 방언) |
| Ryan, Aiden | 남성 | English |
| Ono_Anna | 여성 | Japanese |

→ 한국어 **네이티브 프리셋 남성은 목록에 없음**. 남성은 (a) 타 언어 화자로 한국어 생성, (b) VoiceDesign, (c) Base 클로닝 — **샘플 청취 후 결정**. 여성은 **Sohee**가 1차 후보.

### 2.2 배포 오디오 포맷

| 포맷 | 장점 | 단점 | 권고 |
|---|---|---|---|
| WAV | 검수 원본 | Pages에 넣기엔 과대 | 로컬 제작만 |
| **MP3** | 호환성 최고 | Opus보다 클 수 있음 | **배포 기본 후보** |
| Opus (Ogg/WebM) | 음성에 효율적 | Safari 등 호환·확장자 검증 필요 | 샘플로 비교 |

### 2.3 파일 분할

| 방식 | 4세트 파일 수(대략) | 동기화 | 권고 |
|---|---|---|---|
| **일차(스케줄 항목) 단위** | 246×4 = **984** | 절 동기화에 타임스탬프 또는 절 단위 메타 필요 | **1차 추천** (요청 수·관리 균형) |
| 장 단위 | ~1,172×4 ≈ **4,688** | 장 전환은 쉽고 절은 타임스탬프 | 용량 동일, 요청 증가 |
| 절 단위 | 수만~ | 스크롤·점프 쉬움 | 파일/HTTP 과도 — 비권장 |

**추천:** 일차 단위 MP3 + 매니페스트에 **절별 타임스탬프**(생성 시 절 단위로 합성·이어붙이거나, 절 단위 WAV를 합치며 cue 기록). 샘플 Phase에서 검증.

### 2.4 재생 구조

| 방식 | 설명 | 권고 |
|---|---|---|
| 단일 `<audio>` + 매니페스트 큐 | 하루 파일 재생, `timeupdate`로 절 하이라이트 | **추천** |
| 절마다 `<audio>` 교체 | 구현 단순·전환 끊김 위험 | 비권장 |
| Web Audio API | 정밀 제어 | 초기 과함 |

---

## 3. 라이선스·권리 확인표

| 대상 | 조사 결과 (2026-10-10) | 상태 |
|---|---|---|
| Qwen3-TTS **코드** | GitHub: **Apache-2.0** | 사용 가능으로 보임 |
| Qwen3-TTS **가중치** (CustomVoice / VoiceDesign 카드) | Hugging Face `license: apache-2.0` | 코드와 동일하게 표기됨. **상용·배포 가능으로 FAQ에 명시**되나, 이용 전 카드·LICENSE 재확인 |
| 프리셋 화자(Sohee 등) | 별도 화자 이용약관은 README상 분리 고지 확인 안 됨 | **확인 필요** (추가 제한 여부) |
| **개역개정** 본문 | 대한성서공회 © 1998. 보호 대상 | **허가 필요** |
| **표준새번역/새번역** 본문 | 대한성서공회 © (표준새번역 1993 / 새번역 2001 등). 자산명 `표준새번역개정판` | **허가 필요** |
| 생성 음원 **공개 배포**(Pages) | 공회 「영상 및 오디오 성경」 안내: 본문을 음원으로 제작·업로드 시 **번역본당 연 저작권료(안내상 100만 원 등)**·허가 절차 | **확인 필요** — 정확한 요금·TTS 적용은 공회 문의 (안내: 성경 저작권 02-2103-8730) |
| 광고 수익 사이트 | 공회 오디오 안내상 광고 유무에 따른 갱신 조건 언급 | **확인 필요** |
| Git LFS | Pages 정적 파일 서빙을 자동 해결하지 않음 | 대안이 아님 |

출처:

- https://github.com/QwenLM/Qwen3-TTS  
- https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice  
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits  
- https://www.bskorea.or.kr/ (저작권 안내·이용 허락)  
- https://bible.bskorea.or.kr/copyright_notice  

**권고:** 샘플·전체 생성·공개 배포 전에 대한성서공회 **이용 허락을 문서화**한다. 허가 없이 전체 음원 생성·배포를 진행하지 않는다.

---

## 4. 음성 스타일 테스트 계획

### 4.1 후보 스타일 (지시문 초안 — 확정 아님)

| ID | 목표 | 지시문 초안 (한국어, 샘플용) |
|---|---|---|
| A | 편안·차분 | `차분하고 따뜻한 성경 낭독. 감정을 과장하지 말고 장시간 듣기 편하게.` |
| B | 이야기·생동 | `가족에게 읽듯 따뜻하고 자연스럽게. 적당한 억양, 과장된 연기는 금지.` |
| C | 오디오북·또렷 | `또렷하고 정돈된 오디오북 낭독. 문장 구분 명확, 기계적·과장 금지.` |

### 4.2 테스트 본문 (권한 확인 후)

동일 길이·난이도로 두 번역본에서 발췌 (예: 각 400~600자):

1. 서술·대화 혼합 (창세기 일부)  
2. 고유명사·지명 다수 (왕조/족보 짧은 구간)  
3. 숫자·단위 (민수기 등)  
4. 쉼표·절이 긴 시편/서신 문장  

### 4.3 화자 매트릭스

| 성별 | 1차 후보 | 대안 |
|---|---|---|
| 여성 | Sohee + A/B/C | Serena(교차 언어) 비교 |
| 남성 | Uncle_Fu / Aiden / Ryan 중 한국어 샘플 비교 | VoiceDesign으로 한국어 남성 설계 |

### 4.4 평가·도구

- WAV 생성 → 동일 환경 청취 → 동일 설정 MP3/Opus 압축본 비교  
- 점수(1~5): 발음, 자연스러움, 따뜻함, 감정 절제, 장시간 편안함, 음색 일관성, 속도감, 용량  
- 산출: `tts/config/voice-selection.json` (모델·화자·instruct·샘플레이트) + 선택 기록  
- 로컬 검수: 정적 HTML로 A/B 재생·메모 (구현은 승인 후)

**지금 톤을 확정하지 않는다.**

---

## 5. 용량 산정 보고서

### 5.1 GitHub Pages 제한 (공식, 조사일 2026-10-10)

출처: [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

| 제한 | 값 |
|---|---|
| 게시 사이트 크기 | **최대 1GB** |
| 소스 저장소 | 권장 **1GB** |
| 대역폭 | soft **100GB/월** |
| 배포 타임아웃 | 10분 |

현재 사이트(음원 전) ≈ **14MB** → 음원 예산은 사실상 **~900MB대**가 현실적 상한(여유 포함).

### 5.2 본문 길이 실측 → 재생 시간·용량 **추정**

> **주의:** TTS 샘플 실측이 아님. 낭독 속도 가정 `chars_per_sec`(cps)와 비트레이트 가정에 의존.  
> Phase 1~2에서 **실제 생성 길이·kbps로 재계산**해야 확정이다.

스케줄 246일 합산 문자 수:

| 세트 | 문자 수 | cps=6 시 길이 |
|---|---|---|
| krv × 1음성 | 1,842,669 | ≈ **85.3시간** |
| rnksv × 1음성 | 2,257,930 | ≈ **104.5시간** |
| 4세트 (2번역×2음성) | — | ≈ **380시간** (cps=6) |

**4세트 추정 용량 (cps=6)**

| 비트레이트 | 4세트 합 | 1GB 대비 |
|---|---|---|
| 16 kbps | ≈ **2.6 GB** | 초과 |
| 24 kbps | ≈ **3.9 GB** | 초과 |
| 32 kbps | ≈ **5.2 GB** | 초과 |
| 64 kbps | ≈ **5.2 GB+** | 크게 초과 |

**1세트(개역개정×1음성)만 (cps=6)**

| 비트레이트 | 용량 | Pages 1GB |
|---|---|---|
| 16 kbps | ≈ 586 MB | 여유 가능 |
| 24 kbps | ≈ 879 MB | 빠듯 |
| 32 kbps | ≈ 1,172 MB | **초과 가능** |

일차 평균(krv): ≈ 7,491자/일 → cps=6이면 ≈ 21분/일, 32kbps ≈ **4.8MB/일**.

### 5.3 결론 (용량)

1. **4세트 전체를 Pages에 넣는 설계는 현 추정으로 불가능**에 가깝다.  
2. Pages에 두려면 예를 들어 **1번역×1음성**, 저비트레이트, 또는 **일부 일차만** 등 축소가 필요하다.  
3. 4세트 유지를 원하면 **오디오 전용 외부 정적 호스팅**(CORS·비용·중단 위험 조사 후 승인)이 사실상 필수다.  
4. Git LFS는 Pages 호스팅 문제를 해결하지 않는다.  
5. WAV·모델 가중치는 저장소/`dist`에 넣지 않는다.

### 5.4 다음 실측 과제 (승인 후 Phase 1~2)

- 동일 본문 N자로 생성 → 실제 초·파일 크기 → **유효 kbps·cps** 산출  
- MP3 vs Opus, 16/24/32 kbps 청취 비교  
- 4세트 재추정 표 갱신

---

## 6. 파일 구조·매니페스트 설계

### 6.1 제안 디렉터리

```text
# 로컬 제작 (git 제외 권장)
tts/
  config/
    voice-selection.json      # 확정 모델·화자·instruct
    encode.json               # ffmpeg 설정
  work/                       # WAV·중간 산출
  scripts/                    # 생성·검수·매니페스트 (승인 후)

# 배포용 (용량 승인된 것만 dist에 포함)
public/audio/
  manifest.json
  krv/
    female/
      day-001.mp3
      ...
    male/
      day-001.mp3
  rnksv/
    ...
```

`import.meta.env.BASE_URL + 'audio/...'` 로만 참조. URL 하드코딩 금지.

### 6.2 매니페스트 스키마 (초안)

```json
{
  "version": 1,
  "modelVersion": "Qwen3-TTS-12Hz-1.7B-CustomVoice",
  "configVersion": "voice-selection@1",
  "format": "mp3",
  "sets": [
    {
      "translationId": "krv",
      "voice": "female",
      "speakerId": "Sohee",
      "days": [
        {
          "day": 1,
          "path": "audio/krv/female/day-001.mp3",
          "durationMs": 0,
          "bytes": 0,
          "cues": [
            { "abbr": "창", "chapter": 1, "verse": 1, "startMs": 0, "endMs": 0 }
          ],
          "status": "approved"
        }
      ]
    }
  ]
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| translationId | ✓ | `krv` / `rnksv` |
| day | ✓ | 스케줄 `reading_day` |
| voice / speakerId | ✓ | 성별·화자 |
| path | ✓ | BASE_URL 상대 |
| durationMs / bytes | ✓ | 검수·용량 |
| cues[] | 권장 | 절 동기화 |
| modelVersion / configVersion | ✓ | 재현성 |
| status | ✓ | `draft` / `approved` |

---

## 7. UI/UX 변경 계획

### 7.1 설정

- 기존 「성경 종류」 유지  
- 추가: **음성** — 남성 / 여성 (`bibleReadingSettings:v1`에 `voiceGender` 필드, 기본값 사용자 결정)  
- 번역·음성 변경 시 재생 중지 후 해당 매니페스트 트랙 로드  

### 7.2 읽기 화면 플레이어 (모바일 세로 우선)

하단 고정(또는 chrome과 조화) 바:

- 재생 / 일시정지 / 정지  
- 배속: `0.75` · `1` · `1.25` · `1.5` · `2`  
- (선택) 진행 슬라이더 — 일차 파일 기준  

본문:

- 현재 cue 절에 `.verse-active`  
- 활성 절이 뷰포트 밖이면 `scrollIntoView({ behavior: 'smooth', block: 'center' })`  
- 사용자 수동 스크롤 중에는 자동 스크롤 짧게 억제(충돌 방지)  
- 절 탭 → 해당 cue `startMs`로 seek 후 재생 (**채택 여부 질문 §9**)  

### 7.3 완료 판정 (기존과의 충돌)

| 정책 | 내용 | 장단 |
|---|---|---|
| A. 스크롤만 (현행) | 오디오와 무관 | 기존과 동일, 듣기만 하면 미완료 |
| B. 오디오 종료 시 완료 | 듣기만으로 완료 | 스크롤 없이 완료 가능 |
| C. **둘 중 하나** | 스크롤 끝 **또는** 오디오 끝 | 유연, 구현·테스트 조금 복잡 |

**추천(초안):** **C** — 가족 청취·텍스트 읽기 모두 허용. 완료 해제는 기존대로 사용자 조작.

Chrome 숨김(스크롤 방향)과 플레이어 바 공존을 샘플 UI에서 확인.

---

## 8. 단계별 구현 계획

| Phase | 작업 | 영향(예상) | 완료 기준 | 위험 |
|---|---|---|---|---|
| **0** | 권리·본 조사 확정 | docs만 | 공회 문의 결과·Pages 전략 문서화 | 허가 지연 |
| **1** | 샘플 생성 (남/여×A/B/C, 소량 본문) | 로컬 `tts/` only | 청취 가능한 WAV 세트 | GPU/환경, 남성 음질 |
| **2** | 음질·용량·스타일 선정 | config 고정 | `voice-selection.json` + 실측 cps/kbps | Pages 불가 시 호스팅 결정 필요 |
| **3** | 소수 일차(예: 1~3일)×1세트 파이프라인+플레이어 스파이크 | `ReaderScreen`, manifest 초안 | 동기 스크롤·배속 동작 | cue 생성 방식 |
| **4** | 승인된 범위로 대량 생성·검수 | `public/audio` 또는 외부 | 매니페스트·용량 리포트 | **용량·저작권** |
| **5** | UI 통합·회귀 | settings, progress 정책 | 모바일 Safari/Chrome 체크리스트 | 백그라운드 재생 제한 |
| **6** | 배포 검증 | Actions, Pages 크기 | 게시 ≤1GB, 스모크 테스트 | 대역폭 soft limit |

테스트(공통): 번역/음성 전환, 일차 이동, 배속 유지, 완료 토글, `localStorage` 보존, BASE_URL 하위 경로.

---

## 9. 사용자 결정 (2026-10-10 답변)

| # | 질문 | 결정 |
|---|---|---|
| 1 | 대한성서공회 이용 허락 | **지금은 아니오.** 추후 상업적으로 열 경우 검토 예정 |
| 2 | Pages 배포 범위 | **(A) 1번역 × 1음성만** Pages에 포함. 나머지는 후속 |
| 3 | 남성 음성 | 옵션으로 시작 → 이후 **Aiden 확정** |
| 4 | 읽기 완료 판정 | **기존과 동일 — 본문 끝 스크롤만.** 오디오는 부가 기능이며 완료와 무관 |
| 5 | 절 탭 → 해당 위치 재생 | 설명 요청 → 아래 §9.1. **채택 여부는 미정** |
| 6 | Phase 1 샘플 생성 | **승인** (소량만. 246일×4 대량 생성은 금지) |
| 7 | 여성 스타일 | **A v6 확정** (`gen1_short_Sohee_A_v6.wav`) |
| 8 | 낭독 규칙 | 장 시작 `{책이름} {n}장` 안내 · 절 선두 `<…>` 단락 제목 **미낭독** |
| 9 | 남성 음성 | **Aiden 확정** (동일 A instruct) |

### 9.1 질문 5 설명 — 「절 탭 → 해당 위치부터 재생」

읽기 화면에서 이미 **절을 눌러 선택·복사**할 수 있습니다. TTS가 생기면 같은 동작을 이렇게 확장할지 묻는 항목입니다.

- 예: 창 1:10을 듣는 중인데, 화면에서 **창 1:15 줄을 탭**하면  
  오디오가 **1:15 시작 시점**으로 건너뛰어 이어서 재생하는가?
- **넣으면:** 듣고 싶은 절부터 바로 들을 수 있음 (절별 시간 cue 필요).
- **안 넣으면(또는 후속):** 재생은 처음부터/일시정지·시크만. 절 탭은 지금처럼 선택·복사만.

오디오가 옵션이고 완료는 스크롤만인 현재 결정과 맞추면, **1차에는 넣지 않고 후속**으로 두어도 됩니다. 원하시면 예/아니오로만 답해 주세요.

### 9.2 결정에 따른 범위 조정

| 항목 | 확정 방향 |
|---|---|
| Pages 음원 | **개역개정(`krv`) × 여성(`Sohee`) 1세트** |
| 여성 스타일 | **A v6** — 설정: `tts/config/voice-selection.json` |
| 낭독 규칙 | 장마다 `{정식명} {n}장` · `<단락제목>` TTS 제외 (`tts/scripts/tts_text.py`) |
| 남성 | **Aiden** 확정. 표준새번역 음원 세트는 후속 |
| 완료 UX | `ReaderScreen` 스크롤 완료 유지. 오디오 종료로 `completed` 하지 않음 |
| 공회 허가 | 미진행. 샘플은 **로컬 검수용** |

### 9.3 스타일 선정·샘플 (2026-10-10)

- 환경: Apple M4, MPS, `float32`, `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`
- 다수 A/B/C·D·N·F 라운드 후 **여성 = A v6 확정**
- 확정 instruct: `엄숙한 예배시간에 성경 낭독하는 느낌으로 보다 빨리 읽고, 우울하거나 비장하지 않게 담백하게 읽어줘`
- 남성 후보 샘플 후 **Aiden 확정** — `tts/work/samples/male_Aiden_A_v6.wav`

> `float16`+MPS는 NaN → **MPS는 float32**.

---

## 10. 요약 권고 (결정 반영)

| 주제 | 상태 |
|---|---|
| 스케줄 | 246일 CSV — 확인 완료 |
| Pages 음원 범위 | **1번역×1음성** — krv × 여성 Sohee |
| 여성 스타일 | **A v6 확정** |
| 낭독 규칙 | 장 안내 + `<>` 제외 |
| 남성 음성 | **Aiden** + 동일 instruct |
| 완료 판정 | **스크롤만** |
| 권리 | 공회 허가 **보류** |

다음 액션: 소수 일차 파이프라인·플레이어 스파이크 (승인 후).
