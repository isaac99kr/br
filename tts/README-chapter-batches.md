# 성경 전체 장별 음성 운영 안내

장별 생성기·배치 운영·장별 신규음성 플레이어를 구현했다. 전체 2,378장 생성과 공개 배포는 서로 다른 단계다. `validated`는 자동 검증 완료이며 직접 청취 완료를 뜻하지 않는다. 상세 계획은 `docs/10-chapter-audio-migration-plan.md`, 진행 기록은 `docs/11-chapter-audio-progress.md`를 참고한다.

## 실행 환경

Python 3.11 가상환경, Supertonic SDK 1.3.1 고정 커밋, ONNX CPU, ffmpeg/ffprobe를 사용한다. 최초 설치는 `README-mac-mini.md`를 참고한다. 실행 중인 프로필은 Angelina·한국어·속도 0.9·12단계·2스레드다. 두 번역본을 동시에 합성하지 않는다.

웹 개발 도구는 Homebrew Node 22를 설치했다. 셸에서 npm이 보이지 않으면 먼저 다음을 실행한다.

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm ci
```

## 전체 생성 시작·상태·중단

저장소 루트에서:

```bash
# 가장 간단한 운영 명령(저장소 루트에서 실행)
tts/run-full-generation.sh start
tts/run-full-generation.sh status
tts/run-full-generation.sh log
tts/run-full-generation.sh stop

# 백그라운드에서 krv → rnksv 전체를 순차 생성한다.
# 각 실행 묶음은 최대 20장 또는 60분이며, 현재 장은 완료 후 멈춘다.
tts/.venv/bin/python tts/scripts/run_full_bible.py --start

# 실제 실행 여부와 두 번역 진행 상태
tts/.venv/bin/python tts/scripts/run_full_bible.py --status

# 현재 장 검증을 끝낸 뒤 중단한다.
tts/.venv/bin/python tts/scripts/run_full_bible.py --stop

# 중단/재부팅 후 동일한 명령으로 이어서 실행
tts/.venv/bin/python tts/scripts/run_full_bible.py --start
```

`start`는 이미 검증된 장을 건너뛰고 다음 장부터 이어서 생성한다. 터미널을 닫아도 작업은 계속되며, 재부팅 뒤에는 `start`를 다시 실행한다. MP3를 우선 만들 때는 `stage_chapter_audio.py`나 공개 호스팅 명령을 실행할 필요가 없다. 생성 결과는 `tts/work/chapters/`에 저장된다.

실행기는 터미널/대화 종료와 독립된 프로세스를 시작한다. macOS에서는 실행 중 `caffeinate -i`로 유휴 절전을 방지한다. 재부팅하면 자동 실행되지 않으며 `--start`로 재개한다. 별도 자동 예약이나 로그인 서비스는 설치하지 않는다. 오류가 난 배치는 요약을 남기고 전체 실행을 중단한다. 완료하지 못한 장을 무한 재시도하지 않는다.

- 전체 로그: `tts/work/batches/full-bible.log`
- 관리 상태: `tts/work/batches/supervisor.json`
- 장별 상태 DB: `tts/work/batches/state.sqlite`
- 세션별 로그/결과/요약: `tts/work/batches/<runId>/`
- STOP 파일: `tts/work/batches/STOP` — 다음 `--start`가 해제한다.

`generated`라는 관리 실행 상태는 합성 작업이 끝났다는 뜻이다. 장별 청취 검수, 호스팅 업로드, 사이트 공개 완료를 뜻하지 않는다.

## 한 번만 제한된 범위 실행

전체 실행기가 중단된 상태에서 사용한다. 동시 배치는 잠금으로 차단한다.

```bash
tts/.venv/bin/python tts/scripts/generate_chapters.py --translation krv --books 창 --chapters 1-10 --dry-run
tts/.venv/bin/python tts/scripts/generate_chapters.py --translation krv --max-chapters 20 --max-minutes 60 --threads 2
tts/.venv/bin/python tts/scripts/generate_chapters.py --translation krv --status
tts/.venv/bin/python tts/scripts/generate_chapters.py --translation krv --retry-failed --max-chapters 20
tts/.venv/bin/python tts/scripts/generate_chapters.py --translation krv --books 창 --chapters 1 --force
```

`--force`에는 책과 장을 반드시 명시한다. `--chapters`는 지정된 모든 책에 같은 범위를 적용하며 존재하지 않는 장이면 실패한다. `--min-free-gb` 기본값은 10GB다. 스레드 변경은 현재 합성 프로필을 바꾸므로 완료 자산 재사용이 달라질 수 있다. 대량 작업 중에는 고정한다.

개별 배치 Ctrl+C는 자식 합성기에 중단을 전달하고 상태를 재개 대기로 저장한다. 갑작스러운 종료로 `running`이 남아도 다음 실행이 작업 잠금을 얻은 뒤 복구한다. 상태 조회는 작업 중에도 가능하다.

## 본문과 합절

```bash
tts/.venv/bin/python tts/scripts/audit_chapter_sources.py
```

결과는 `tts/work/source-audit.json`이다. 기존 개역개정 변환기가 누락하던 11개 합절을 원문에서 복원했다. 합절은 첫 절 ID와 `verseEnd`로 표현하며 개별 절 시간을 추정하지 않는다. `롬9:2`를 선택하면 롬9:1-2 전체 본문·음성을 사용한다. 화면에 합절 번호와 안내가 표시된다. 한 입력 구간에서는 합절을 한 번만 넣고, 반복 입력된 범위는 반복 재생한다.

원문에서 ‘없음’으로 명시한 절은 `kind: absent`로 기록하고 “없음.”이라고 읽는다. 행24:7은 원문의 ‘6하반-8상반 없음’ 표기에 근거해 누락 표기만 복원했으며 성경 문장을 새로 작성하지 않았다. 원문 변형 표기 `<하나님께>`나 전체가 괄호로 둘러싸인 본문을 제목처럼 삭제하지 않도록 정리 규칙을 보강했다.

## 해시와 저장 공간

- 장별 실제 입력·음성·모델·SDK·합성 로직 버전으로 `synthesisHash`를 계산한다.
- 중간 WAV는 장 폴더의 `parts-<synthesisHash 앞 16자리>/`에 저장한다.
- 무음·인코딩 설정은 별도로 분리하며 최종 JSON에 실제 WAV 해시를 포함한 `assemblyHash`를 기록한다.
- 검증 로직 버전은 합성 해시에 포함하지 않는다. 검증 코드 수정으로 재합성하지 않는다.
- 최종 MP3·JSON·검증 메타데이터가 정상이면 중간 WAV 없이도 재개 시 재합성하지 않는다.
- 기존 첫 창1 실험 결과는 별도로 보존한다. 현재 프로필 결과를 사용할 때 DB에 등록된 경로를 기준으로 한다.

장별 소스·합성 로직을 변경했다면 해당 버전을 올리고 다시 검사한다. 모델/스타일/입력 변경을 기존 결과의 이름만 바꿔 적용하지 않는다.

청취 기록과 정리 도구:

```bash
# 실제 청취한 장에 대해서만 실행한다.
tts/.venv/bin/python tts/scripts/manage_chapter_audio.py --directory '<장 결과 폴더>' --review-note '청취한 구간과 확인 결과'

# 중복 결합 WAV의 정리 대상만 표시
tts/.venv/bin/python tts/scripts/manage_chapter_audio.py --directory '<장 결과 폴더>' --prune joined
# 실제 정리는 위 명령에 --apply 추가

# 모든 중간 WAV 정리는 청취 기록과 독립적인 최종 파일 백업이 있어야 한다.
tts/.venv/bin/python tts/scripts/manage_chapter_audio.py --directory '<장 결과 폴더>' --prune all-wav --backup-dir '<백업 폴더>'
```

정리는 배치 중단 상태에서 실행한다. 백업 폴더에 MP3·시간 JSON·config·validation·청취 기록 등 해당 폴더 JSON의 동일한 복사본이 있어야 한다. 데이터 손실을 피하도록 기본 동작은 목록 표시뿐이다. 현재는 디스크 여유가 충분하여 기존 WAV를 일괄 삭제하지 않았다.

## 로컬 웹 미리보기와 공개 릴리스

```bash
# 자동 검증 완료 자산을 로컬에서만 시험한다.
tts/.venv/bin/python tts/scripts/stage_chapter_audio.py --preview --output public/audio/chapters
npm run dev -- --host 127.0.0.1
```

전체 2,378장 생성이 끝난 뒤 위 명령으로 현재 검증 자산을 로컬 스테이징할 수 있다. 기존 일차 음원은 `tts/legacy-audio/`에 백업하고 배포 대상에서 제거한다. `public/audio/chapters/`는 Git 제외 경로이므로 정적 호스트에는 릴리스 디렉터리 전체를 별도로 업로드해야 한다.

사이트는 `http://127.0.0.1:5173/br/`이다. 예: `http://127.0.0.1:5173/br/#/collection/read?range=창1:10`.

`public/audio/chapters/`는 Git 제외 경로다. 원격 CI에 자동으로 올라가지 않는다. 실제 공개 릴리스는 `--preview` 없이 청취 검수된 장만 `tts/work/releases`에 만들고, 선정한 정적 호스트에 업로드한다. **stage 명령은 업로드·배포하지 않는다.**

Vite의 `VITE_CHAPTER_AUDIO_BASE_URL`에 HTTPS 음원 루트를 지정할 수 있다. 그 루트에 `current.json`, 불변 릴리스 매니페스트, 장별 MP3/JSON이 있어야 한다. JSON에는 CORS를 허용하고 음원은 올바른 MIME으로 제공한다. MP3와 JSON을 먼저 올리고 검증한 뒤 current 포인터를 전환한다. `previous.json`은 바로 이전 포인터를 보존한다. 호스팅 계정·요금제는 아직 지정하지 않았다.

두 화면은 같은 장별 큐를 사용한다. 입력 순서·반복·부분 범위를 보존하고 해당 장이 하나라도 없으면 누락 범위를 안내한다. 다른 번역이나 일차별 음원으로 자동 대체하지 않는다. 브라우저 TTS 버튼은 별도로 유지한다.

## 검증과 남은 확인

```bash
tts/.venv/bin/python tts/scripts/test_generate_chapter.py
npm run test:chapter-audio
npm run test:ranges
npm run build
npm run lint
```

MP3를 전체 디코딩하고 해시·절 경계·길이·첫/중간/마지막 파형 정렬을 검사한다. 드물게 FFmpeg가 마지막 프레임 패딩을 한 프레임까지만 버려 1~47샘플이 남는 경우가 있다. 이때 시작 skip=1105, 마지막 discard=1152, 정확한 잔여 샘플 공식, 매우 작은 꼬리 신호와 파형 정렬을 확인한다. 설명되지 않는 차이는 실패 처리한다. JSON의 원본 끝 샘플 이후는 재생하지 않는다.

부분 구간은 Web Audio의 source offset/duration으로 종료하며 UI 타이머로 다음 절을 멈추지 않는다. 원본 sampleRate로 초를 계산하므로 AudioContext 리샘플링을 고려한다. 현재 장 중심으로 최대 두 장의 버퍼를 캐시하고 큰 버퍼에서는 이전 장을 퇴출한다. 단일 긴 장 자체의 메모리는 남으므로 실제 모바일 장치 검증이 필요하다.

자동 검사와 데스크톱 재생 성공이 모든 브라우저의 샘플 단위 정확도·발음 품질을 보장하지 않는다. iPhone Safari/Android Chrome의 긴 장·배속·구간 경계 청취, 음원 호스팅, 공개 배포는 별도 완료해야 한다.
