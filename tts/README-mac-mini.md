# Mac mini 장별 성경 음성 생성

창세기 1장 31절을 장 안내와 절별로 합성하고, PCM에서 연결한 다음 모노 96kbps MP3로 한 번 인코딩합니다. 기존 일차별 생성기와 웹 플레이어는 변경하지 않습니다. 장별 JSON은 현재 플레이어에 자동 연동되지 않습니다.

## 최초 설치

실제 확인한 환경: macOS 15.5, arm64, 논리 CPU 10개, Python 3.11.17. 기존 시스템 Python은 변경하지 않았습니다. ONNX Runtime의 CPUExecutionProvider를 사용합니다. CUDA/MPS는 필요하지 않습니다.

저장소 루트에서 실행합니다. Homebrew가 없는 경우 먼저 공식 Homebrew 설치 안내에 따라 설치해야 합니다. 다음 명령은 Homebrew가 설치되어 있다는 전제입니다.

```bash
brew install python@3.11 ffmpeg
"$(brew --prefix python@3.11)/bin/python3.11" -m venv tts/.venv
tts/.venv/bin/python -m pip install -r tts/requirements-chapter.txt
tts/.venv/bin/python tts/scripts/download_chapter_model.py
```

정상 작동하는 기존 가상환경이 있다면 재생성하거나 패키지를 업그레이드하지 않아도 됩니다. requirements 파일은 실제 설치된 전체 의존성을 고정합니다. 다른 OS/아키텍처에서는 해당 버전의 wheel 지원 여부를 확인하세요.

SDK는 `supertone-oss-archive/supertonic-py`의 `df0f9686dac7fbbde391b759e2ee5286a3737622` 커밋(1.3.1), 모델은 `supertone-oss-archive/supertonic-3`의 `aafc6e32416a594460b32413efc49d7fe4ce6d46` 리비전을 사용합니다. 다운로드 스크립트는 모델을 `tts/models/supertonic-3/<리비전>/`에 저장하고 실제 파일 SHA256을 기록합니다. 생성기는 로컬 경로와 `auto_download=False`를 사용하며 실행마다 모델 해시를 확인합니다. 최초 설치와 모델 다운로드에는 인터넷 연결이 필요합니다.

## 생성과 재개

```bash
bash tts/scripts/run_genesis_1.sh
```

이 명령은 창세기 1장만 생성하고 검증합니다. 스크립트는 자신의 위치로 저장소를 찾으므로 다른 디렉터리에서도 절대 경로로 호출할 수 있습니다. 직접 실행:

```bash
tts/.venv/bin/python tts/scripts/generate_chapter.py --translation krv --book 창 --chapter 1
```

기본 CPU 스레드는 `min(2, max(1, CPU수 // 2))`, ONNX inter-op 스레드는 1입니다. 다른 작업에 부담이 있으면 1로 낮추세요.

```bash
TTS_THREADS=1 bash tts/scripts/run_genesis_1.sh
# 또는
bash tts/scripts/run_genesis_1.sh --threads 2
```

Ctrl+C로 중단한 뒤 같은 명령을 실행하면 정상 완료된 WAV를 재사용합니다. WAV와 별도 메타데이터의 해시·샘플레이트·샘플 수·유한값을 검사하므로 잘린 파일이나 저장이 끝나지 않은 파일은 재합성합니다. 같은 대상에 대한 동시 실행은 파일 잠금으로 방지합니다.

```bash
bash tts/scripts/run_genesis_1.sh --force
```

`--force`는 현재 생성조건의 해당 장만 재생성합니다. 다른 장이나 과거 조건의 결과는 삭제하지 않습니다. 본문, 스타일, 설정, 모델 파일, SDK/의존성, 생성 코드, 스레드 수 등이 바뀌면 새 해시 폴더를 사용합니다. 조건 해시는 입력 추적용이며, 다른 환경에서 비트 단위로 같은 합성 결과를 보장한다는 뜻은 아닙니다.

향후 다른 장은 명시적으로 지정할 수 있습니다. 이번 실행에서는 생성하지 않습니다.

```bash
tts/.venv/bin/python tts/scripts/generate_chapter.py --translation krv --book 창 --chapter 2 --threads 2
```

## 결과와 청취

최종 출력에 MP3/JSON의 절대 경로가 표시됩니다.

```text
tts/work/chapters/krv/GEN/001/<생성조건해시 앞 16자리>/
  창세기_001.mp3
  창세기_001.json
  generation-config.json
  validation.json
  chapter.wav
  preview-verse-001.wav
  preview-verse-010.wav
  preview-verses-001-010.wav
  parts/announce.wav
  parts/verse-001.wav ... verse-031.wav
```

청취 샘플은 최종 MP3 전체를 디코딩한 파형에서 JSON의 샘플 경계로 잘라 만듭니다. 1~10절 샘플에는 절 사이의 무음이 포함됩니다. Finder 또는 아래 명령으로 재생합니다. `<결과 폴더>`를 출력된 실제 경로로 바꾸세요.

```bash
afplay '<결과 폴더>/창세기_001.mp3'
afplay '<결과 폴더>/preview-verse-001.wav'
afplay '<결과 폴더>/preview-verse-010.wav'
afplay '<결과 폴더>/preview-verses-001-010.wav'
```

모델·가상환경·생성물은 기존 `.gitignore`에 의해 제외됩니다. `--output-dir`로 결과 루트를 바꿀 수 있지만 Git 제외 경로를 사용하세요. 상대 경로는 저장소 루트 기준입니다.

## 설정과 시간 JSON

`tts/config/voice-selection.json`과 `tts/voices/angelina.json`을 사용합니다. 현재 설정은 한국어, Angelina, 속도 0.9, 합성 단계 12, 장 안내 뒤 0.5초, 절 사이 0.12초입니다. 참조 WAV는 읽지 않으며 음성 복제도 수행하지 않습니다. 이전 Qwen용 `voice-styles.json`은 사용하지 않습니다. `krv`는 이 프로젝트의 개역개정 식별자입니다.

장 안내는 현재 템플릿에 따라 `창세기 일장 말씀입니다.`로 합성합니다. 저장소의 본문에서 단락 제목과 제어문자를 제거하며 절 번호는 낭독하지 않습니다. 절마다 별도로 합성하므로 절 경계에서 억양이 초기화될 수 있습니다. 긴 절은 SDK 내부에서 분할될 수 있지만 해당 절의 전체 출력 파형을 하나의 구간으로 기록합니다.

- `timeUnit: "ms"`: `startMs`, `endMs`, `durationMs`는 밀리초입니다.
- `sampleRate`: 모델 설정에서 읽은 실제 샘플레이트입니다.
- `startSample` / `endSample`: 시작 포함, 종료 제외인 원본 PCM 샘플 위치입니다. ms는 샘플 위치에서 소수점 세 자리로 변환합니다.
- `announcement`: 장 안내 구간이며 1절에 포함되지 않습니다.
- `verses`: 절마다 합성된 파형의 실제 샘플 수로 계산한 구간입니다. 절 사이에 추가한 무음은 제외하지만 합성 파형 내부의 앞뒤 무음은 포함합니다. 실제 발화 시작점을 탐지한 결과가 아닙니다.
- `audioSha256`: 최종 MP3의 SHA256입니다.
- `generationHash`, `styleSha256`, `modelRevision`, `sdkOrigin`, `sourceSha256`: 입력과 실행 조건 추적 정보입니다. 작업 트리가 수정되면 `sourceWorkingTreeDirty`가 참입니다. Git 커밋만으로 입력이 고정됐다고 간주하지 않습니다.

## 자동 검증과 한계

매 실행 시 절 번호·시간 순서·길이·MP3 해시를 검증하고 ffprobe 및 ffmpeg 전체 디코딩을 수행합니다. 원본 PCM과 디코딩된 샘플 수를 비교하며, 첫 절·중간 절·마지막 절에서 상관관계로 파형 정렬도 검사합니다. 차이가 발견되면 실패 처리하므로 원인을 조사한 뒤 다시 실행하세요. FFmpeg가 MP3의 지연/패딩 정보를 반영한 결과가 브라우저마다 동일하다는 보장은 없습니다.

`validation.json`에는 길이 차이, 파형 정렬 결과, 생성/재사용 개수, 실행 시간, 최초 생성 시간, MP3 크기가 기록됩니다. 재실행 시 `synthesizedUnits: 0`, `reusedUnits: 32`를 확인할 수 있습니다. 시간 JSON과 MP3가 존재하는 것만으로 완료 처리하지 않습니다.

자동 검증은 발음, 낭독 누락·반복, 억양의 자연스러움까지 판단하지 않습니다. 전체 음원과 청취 샘플을 직접 듣고 특히 다른 절의 말소리가 경계에 섞이는지 확인하세요.

## 오류 대응

- `ModuleNotFoundError`: `tts/.venv/bin/python -m pip install -r tts/requirements-chapter.txt`로 전용 환경을 설치합니다.
- `ffmpeg/ffprobe` 없음: `brew install ffmpeg`를 실행하고 Homebrew의 bin 경로가 PATH에 포함되어 있는지 확인합니다.
- 모델/manifest 없음: `download_chapter_model.py`를 실행합니다. 네트워크 오류는 DNS·프록시·방화벽 접근을 확인한 뒤 재시도합니다. SDK의 기본 다운로드 저장소로 자동 전환하지 않습니다.
- 모델 해시 불일치: 해당 모델 파일의 손상을 확인하고 재다운로드합니다. 필요하면 모델 폴더를 별도 이름으로 이동한 뒤 다운로드 스크립트를 실행합니다.
- Angelina JSON 없음: 저장소의 `tts/voices/angelina.json`을 복원합니다. 참조 녹음이나 새 복제를 만들 필요는 없습니다.
- 절 합성 실패: 터미널에 실패한 절이 출력됩니다. 동일한 명령으로 재개합니다.
- 같은 대상 실행 잠금 오류: 이미 실행 중인 생성기가 끝나거나 중단된 뒤 다시 실행합니다.

로컬 회귀 테스트는 다음 명령으로 실행합니다. 정상 WAV 재사용, 조건 변경, 파일 손상, 샘플 메타데이터 불일치, 샘플레이트 불일치, 비유한 파형을 검사합니다.

```bash
tts/.venv/bin/python tts/scripts/test_generate_chapter.py
```

## 이번 실제 생성 결과

2026-10-23 실행 결과 폴더:

```text
tts/work/chapters/krv/GEN/001/81084b1491fe767f/
```

- 모델 실제 샘플레이트: 44,100Hz, CPU 합성 2스레드.
- SDK 1.3.1, ONNX Runtime 1.31.0, NumPy 2.4.6, SoundFile 0.14.0, ffmpeg 9.0.2.
- 최종 실행의 합성·인코딩·검증: 79.625초(설치·모델 다운로드 제외).
- 재생 길이: 252.855374초, MP3 크기: 3,035,054바이트.
- 원본/디코딩 파형: 각각 11,150,922샘플, 차이 0샘플. 1·16·31절 파형 정렬 지연 0샘플.
- 다른 작업 디렉터리(`/private/tmp`)에서 재실행: 32개 WAV 재사용, 새 합성 0개, MP3 재인코딩 없음, 내부 실행 시간 0.477초.
- 자동 검증 통과. 직접 청취는 수행하지 않았으며 발음·누락·반복·억양·절 경계 청취 확인이 남아 있습니다.

최초 시도에서는 에너지 정규화 없는 상관관계 검사가 작은 소리 구간에서 잘못된 지연을 보고했습니다. 정규화 후 지연 0을 확인했고, 검증 코드를 수정한 새 조건으로 위 최종 결과를 생성했습니다. 이전 시도 폴더는 Git 제외 작업 경로에 남아 있으므로 위 해시 폴더의 결과를 사용하세요.
