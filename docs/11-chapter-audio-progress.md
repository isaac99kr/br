# 장별 음성 전환 진행 기록

최종 갱신: 2026-10-24

장별 MP3·절 타이밍 JSON 생성기, 중단/재개 가능한 SQLite 배치, 장별 신규음성 플레이어와 모아 읽기 큐를 구현했다. 개역개정과 표준새번역 모두를 대상으로 하며, 합절은 `verseEnd`로 보존한다.

전체 합성은 사용자가 직접 시작·중단할 수 있도록 다음 명령으로 운영한다.

```bash
tts/run-full-generation.sh start
tts/run-full-generation.sh status
tts/run-full-generation.sh log
tts/run-full-generation.sh stop
```

생성 파일은 `tts/work/chapters/`에 쌓인다. 이미 검증된 장은 해시와 MP3/JSON 검사를 통과하면 재사용하므로, 중단 후 `start`를 다시 실행해도 처음부터 합성하지 않는다. 현재 실행 상태는 `tts/work/batches/state.sqlite`, 전체 로그는 `tts/work/batches/full-bible.log`에서 확인한다.

자동 검증은 본문 감사, MP3 전체 디코드, JSON 해시, 절 경계와 파형 정렬을 포함한다. 신규음성 UI와 모아 읽기 UI는 같은 장별 MP3/JSON 자산을 사용한다. 음원 호스팅과 공개 배포는 생성 완료 후 별도 단계다.
