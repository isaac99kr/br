#!/usr/bin/env python3
"""Synthesize one chapter; sample-count cues, verified resume, CPU-only ONNX."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import importlib.metadata as metadata
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import time
import unicodedata

import numpy as np
import soundfile as sf

from download_chapter_model import MODEL_DIR, MODEL_REPO, MODEL_REVISION, sha256
from tts_text import get_book_name, korean_number
from chapter_sources import load_chapter, TEXT_VERSION

ROOT = Path(__file__).resolve().parents[2]
TTS_ROOT = ROOT / 'tts'
LOGIC_VERSION = 2
VALIDATION_VERSION = 3
BOOK_ABBRS = '창 출 레 민 신 수 삿 룻 삼상 삼하 왕상 왕하 대상 대하 스 느 에 욥 시 잠 전 아 사 렘 애 겔 단 호 욜 암 옵 욘 미 나 합 습 학 슥 말 마 막 눅 요 행 롬 고전 고후 갈 엡 빌 골 살전 살후 딤전 딤후 딛 몬 히 약 벧전 벧후 요일 요이 요삼 유 계'.split()
BOOK_CODES = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split()


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode()).hexdigest()


def atomic_json(path, value):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)


def run(command):
    result = subprocess.run(command, capture_output=True, check=True)
    return result.stdout


def require(condition, message):
    if not condition:
        raise ValueError(message)


def wave(path, sr):
    data, actual_sr = sf.read(path, dtype='float32')
    require(actual_sr == sr and data.ndim == 1 and data.size > 0
            and np.isfinite(data).all(), f'잘못된 WAV: {path}')
    require(sf.info(path).frames == len(data), f'WAV 샘플 수 오류: {path}')
    return data


def save_wave(path, data, sr):
    require(data.ndim == 1 and data.size > 0 and np.isfinite(data).all(), '비정상 합성 파형')
    temp = path.with_suffix('.tmp.wav')
    sf.write(temp, data, sr, subtype='FLOAT')
    wave(temp, sr)
    temp.replace(path)


def verified_part(path, sr, condition_hash):
    info = read_json(path.with_suffix('.json'))
    require(info['generationHash'] == condition_hash and info['sha256'] == sha256(path), 'WAV 해시 불일치')
    data = wave(path, sr)
    require(info['samples'] == len(data) and info['sampleRate'] == sr, 'WAV 메타데이터 불일치')
    return data


def validate(directory, expected, pcm=None):
    meta = read_json(directory / expected['jsonFile'])
    require(meta == expected['metadata'], '시간 JSON 또는 생성 메타데이터 불일치')
    mp3 = directory / meta['audio']
    require(sha256(mp3) == meta['audioSha256'], 'MP3 해시 불일치')
    sr = meta['sampleRate']
    cues = meta['verses']
    require([v['verse'] for v in cues] == expected['verseNumbers'], '절 누락/중복/순서 오류')
    total_samples = len(pcm) if pcm is not None else meta['totalSamples']
    last = meta['announcement']['endSample']
    for v in cues:
        require(last <= v['startSample'] < v['endSample'] <= total_samples, '절 시간 범위 오류')
        require(v['startMs'] == round(v['startSample'] * 1000 / sr, 3)
                and v['endMs'] == round(v['endSample'] * 1000 / sr, 3), 'ms 변환 오류')
        last = v['endSample']
    require(last == total_samples, '마지막 절 뒤 추가 샘플')
    probe = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(mp3)]))
    stream = probe['streams'][0]
    require(stream['codec_name'] == 'mp3' and stream['channels'] == 1
            and int(stream['sample_rate']) == sr, 'MP3 포맷 불일치')
    decoded = np.frombuffer(run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(mp3),
                                '-f', 'f32le', '-acodec', 'pcm_f32le', '-']), dtype='<f4')
    require(decoded.size > 0 and np.isfinite(decoded).all(), 'MP3 전체 디코딩 실패')
    difference = len(decoded) - total_samples
    padding = None
    if difference:
        packets = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'a',
                                  '-show_packets', '-of', 'json', str(mp3)]))['packets']
        first = next((d for d in packets[0].get('side_data_list', []) if d['side_data_type'] == 'Skip Samples'), {})
        final = next((d for d in packets[-1].get('side_data_list', []) if d['side_data_type'] == 'Skip Samples'), {})
        tail_peak = float(np.max(np.abs(decoded[total_samples:]))) if difference > 0 else None
        # LAME priming is 1105 samples. Some decoders cap final discard at one
        # 1152-sample frame; at most the preceding frame's last 47 samples remain.
        # ffprobe may expose side-data numbers as either JSON integers or
        # numeric strings depending on the FFmpeg build. Normalize them
        # before checking the measured, bounded final-frame remainder.
        skip_samples = int(first.get('skip_samples', -1))
        discard_padding = int(final.get('discard_padding', -1))
        require(0 < difference <= 47 and skip_samples == 1105
                and discard_padding == 1152
                and difference == 47 - total_samples % 1152 and tail_peak < 2e-4,
                f'설명되지 않은 MP3 길이 차이 {difference} samples: 조사 필요 '
                f'(total={total_samples},mod={total_samples % 1152},skip={skip_samples},discard={discard_padding},tail={tail_peak})')
        padding = {'kind': 'decoder-final-frame-discard-limit', 'leadingSkip': 1105,
                   'finalDiscard': 1152, 'extraTrailingSamples': difference, 'tailPeak': tail_peak,
                   'playbackEndSample': total_samples}

    # Measure alignment at multiple locations rather than infer it from length alone.
    alignment = []
    for v in ((cues[0], cues[len(cues)//2], cues[-1]) if pcm is not None else []):
        section = pcm[v['startSample']:v['endSample']]
        center = v['startSample'] + max(2048, min(int(np.argmax(np.abs(section))), len(section)-6144))
        center = max(2048, min(center, len(pcm)-6144))
        reference = pcm[center:center + min(4096, v['endSample'] - center)]
        radius = 2048
        search = decoded[center-radius:center+len(reference)+radius]
        corr = np.correlate(search, reference, mode='valid')
        energy = np.convolve(search * search, np.ones(len(reference)), mode='valid')
        normalized = corr / np.sqrt(np.maximum(energy * np.sum(reference * reference), 1e-20))
        require(float(np.max(normalized)) > 0.9, '정렬 검사 신호 상관도가 부족합니다.')
        lag = int(np.argmax(normalized)) - radius
        alignment.append({'verse': v['verse'], 'lagSamples': lag,
                          'correlation': float(np.max(normalized))})
    require(all(abs(x['lagSamples']) <= 1 for x in alignment), 'MP3 파형 정렬 차이: 조사 필요')
    for name, first, last_verse in [('verse-001', 1, 1), ('verse-010', 10, 10), ('verses-001-010', 1, 10)]:
        if len(cues) >= last_verse:
            save_wave(directory / f'preview-{name}.wav',
                      decoded[cues[first-1]['startSample']:cues[last_verse-1]['endSample']], sr)
    return {'passed': True, 'validationVersion': VALIDATION_VERSION, 'generationHash': meta['generationHash'], 'audioSha256': meta['audioSha256'],
            'verseCount': len(cues), 'pcmSamples': total_samples, 'decodedSamples': len(decoded),
            'differenceSamples': difference, 'differenceMs': difference * 1000 / sr,
            'paddingAnalysis': padding,
            'alignmentChecks': alignment, 'ffprobeDurationSec': float(probe['format']['duration']),
            'durationMs': meta['durationMs'], 'mp3Bytes': mp3.stat().st_size,
            'listeningVerified': False, 'note': '합성 구간 경계. 브라우저별 샘플 정확도나 발음 품질을 보장하지 않음.'}


def main():
    sys.stdout.reconfigure(line_buffering=True)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--translation', default='krv')
    parser.add_argument('--book', default='창')
    parser.add_argument('--chapter', type=int, default=1)
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--result-file', type=Path)
    parser.add_argument('--threads', type=int, default=min(2, max(1, (os.cpu_count() or 1)//2)))
    parser.add_argument('--output-dir', type=Path, default=TTS_ROOT / 'work' / 'chapters')
    args = parser.parse_args()
    require(args.threads > 0 and args.chapter > 0, 'threads/chapter는 양수여야 합니다.')
    require(all(shutil.which(tool) for tool in ['ffmpeg', 'ffprobe']), 'ffmpeg/ffprobe 설치 필요')
    cfg = read_json(TTS_ROOT / 'config' / 'voice-selection.json')
    require(cfg['engine'] == 'supertonic3' and cfg['modelId'] == 'supertonic-3', '지원하지 않는 엔진/모델')
    translations = {x['id']: x['label'] for x in read_json(ROOT / 'public/data/translations.json')['items']}
    require(args.translation in translations, '알 수 없는 번역본')
    aliases = read_json(ROOT / 'public/data/books.json').get('aliases', {})
    abbr = aliases.get(args.book, args.book)
    require(abbr in BOOK_ABBRS, '알 수 없는 책 약어')
    code = dict(zip(BOOK_ABBRS, BOOK_CODES))[abbr]
    source = ROOT / 'public/data/bible' / args.translation / f'{abbr}.json'
    source, entries = load_chapter(args.translation, abbr, args.chapter)
    numbers = [e['verse'] for e in entries]
    covered = {v for e in entries for v in range(e['verse'], e['verseEnd']+1)}
    require(covered == set(range(1, max(covered)+1)), '원문 절 번호 감사가 필요합니다.')
    verses = [e['text'] for e in entries]
    female, rules = cfg['female'], cfg['readingRules']
    style_path = TTS_ROOT / female['stylePath']
    require(style_path.is_file(), f'저장된 음성 스타일 JSON 필요: {style_path}')
    require(rules['announceSilenceSec'] >= 0 and rules['chunkGapSec'] >= 0, '무음은 음수일 수 없습니다.')
    announce = rules['chapterAnnounce'].format(bookName=get_book_name(abbr), koreanChapter=korean_number(args.chapter))
    model_manifest = read_json(MODEL_DIR / 'model-manifest.json')
    require(model_manifest['repo'] == MODEL_REPO and model_manifest['revision'] == MODEL_REVISION, '모델 리비전 불일치')
    for name, checksum in model_manifest['files'].items():
        require(sha256(MODEL_DIR / name) == checksum, f'모델 손상: {name}; download_chapter_model.py 재실행 필요')
    versions = {name: metadata.version(name) for name in ['supertonic', 'numpy', 'soundfile', 'onnxruntime', 'huggingface-hub']}
    sdk_origin = json.loads(metadata.distribution('supertonic').read_text('direct_url.json') or '{}')
    synthesis = {'logicVersion': LOGIC_VERSION, 'textVersion': TEXT_VERSION,
                 'translation': args.translation, 'book': code, 'chapter': args.chapter,
                 'verses': entries, 'announcement': announce,
                 'modelId': cfg['modelId'], 'language': cfg['language'],
                 'speed': female['speed'], 'totalSteps': female['totalSteps'],
                 'styleSha256': sha256(style_path), 'model': model_manifest,
                 'packages': {k: v for k, v in versions.items() if k != 'huggingface-hub'},
                 'sdkOrigin': sdk_origin, 'threads': args.threads,
                 'python': platform.python_version(), 'architecture': platform.machine(),
                 'seedPolicy': 'per-unit SHA256 seed'}
    condition = {'synthesis': synthesis, 'synthesisHash': digest(synthesis),
                 'assembly': {'version': 2, 'announceSilenceSec': rules['announceSilenceSec'],
                              'chunkGapSec': rules['chunkGapSec'], 'encoding': 'mono MP3 96kbps',
                              'ffmpeg': run(['ffmpeg', '-version']).decode().splitlines()[0]}}
    condition_hash = digest(condition)
    output_base = args.output_dir if args.output_dir.is_absolute() else ROOT / args.output_dir
    directory = output_base / args.translation / code / f'{args.chapter:03d}' / condition_hash[:16]
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / '.lock').open('w') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        generate(args, cfg, female, rules, style_path, announce, verses, numbers, abbr, code,
                 translations, condition, condition_hash, directory, entries)


def generate(args, cfg, female, rules, style_path, announce, verses, numbers, abbr, code,
             translations, condition, condition_hash, directory, entries):
    start = time.monotonic()
    provenance = {'sourceGitCommit': run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD']).decode().strip(),
                  'sourceGitStatus': run(['git', '-C', str(ROOT), 'status', '--porcelain']).decode(),
                  'platform': platform.platform(), 'cpuCount': os.cpu_count(),
                  'sourceBookSha256': sha256(ROOT / 'public/data/bible' / args.translation / f'{abbr}.json')}
    config_path = directory / 'generation-config.json'
    if config_path.exists():
        require(read_json(config_path)['conditions'] == condition, '생성조건 해시 충돌/메타데이터 손상')
    atomic_json(config_path, {'generationHash': condition_hash, 'conditions': condition, 'provenance': provenance})
    stem = f'{get_book_name(abbr)}_{args.chapter:03d}'
    timing = directory / f'{stem}.json'
    validation_path = directory / 'validation.json'
    if not args.force and validation_path.exists() and timing.exists():
        try:
            previous = read_json(validation_path)
            old = read_json(timing)
            require(previous['passed'] and previous['timingSha256'] == sha256(timing)
                    and old['generationHash'] == condition_hash, '완료 메타데이터 불일치')
            report = validate(directory, {'jsonFile': timing.name, 'metadata': old, 'verseNumbers': numbers})
            report.update({'timingSha256': sha256(timing), 'synthesizedUnits': 0,
                           'reusedUnits': len(numbers)+1, 'runSeconds': round(time.monotonic()-start, 3),
                           'initialGenerationSeconds': previous['initialGenerationSeconds'],
                           'alignmentChecks': previous['alignmentChecks']})
            atomic_json(validation_path, report)
            if args.result_file:
                atomic_json(args.result_file, {'directory': str(directory), **report})
            print(f'완료 자산 재검증 통과 (WAV 없이 재개 가능): {directory}')
            return
        except (OSError, ValueError, KeyError, subprocess.CalledProcessError):
            print('완료 자산 재검증 실패: 중간 WAV에서 복구합니다.')
    # Load lazily: a complete resume must not initialize the synthesis engine.
    from supertonic.loader import load_configs
    sample_rate = int(load_configs(MODEL_DIR)['ae']['sample_rate'])
    parts = directory.parent / ('parts-' + condition['synthesisHash'][:16])
    parts.mkdir(exist_ok=True)
    tts = style = None
    arrays, cues = [], []
    position = synthesized = reused = 0
    for index, text in enumerate([announce] + verses):
        name = 'announce' if index == 0 else f'verse-{numbers[index-1]:03d}'
        path = parts / f'{name}.wav'
        data = None
        if not args.force:
            try:
                data = verified_part(path, sample_rate, condition['synthesisHash'])
                reused += 1
                print(f'재사용 {name}: {len(data)} samples')
            except (OSError, ValueError, KeyError, RuntimeError):
                pass
        if data is None:
            print(f'합성 {name} ({index}/{len(verses)})')
            try:
                if tts is None:
                    from supertonic import TTS
                    tts = TTS(model=cfg['modelId'], model_dir=MODEL_DIR, auto_download=False,
                              intra_op_num_threads=args.threads, inter_op_num_threads=1)
                    require(tts.sample_rate == sample_rate, '모델 샘플레이트 불일치')
                    style = tts.get_voice_style_from_path(style_path)
                np.random.seed(int(hashlib.sha256((condition['synthesisHash'] + name).encode()).hexdigest()[:8], 16))
                audio, _ = tts.synthesize(text, voice_style=style, lang=cfg['language'],
                                          speed=female['speed'], total_steps=female['totalSteps'],
                                          silence_duration=0.0)
                data = np.asarray(audio, dtype=np.float32).reshape(-1)
                save_wave(path, data, sample_rate)
                atomic_json(path.with_suffix('.json'), {'generationHash': condition['synthesisHash'],
                            'sha256': sha256(path), 'samples': len(data), 'sampleRate': sample_rate})
                synthesized += 1
            except Exception:
                print(f'실패: {name}; 같은 명령으로 재개할 수 있습니다.', file=sys.stderr)
                raise
        cue = {'startSample': position, 'endSample': position + len(data),
               'startMs': round(position * 1000 / sample_rate, 3),
               'endMs': round((position + len(data)) * 1000 / sample_rate, 3)}
        arrays.append(data)
        position += len(data)
        if index == 0:
            announcement = dict(text=announce, **cue)
        else:
            cues.append(dict(verse=numbers[index-1], verseEnd=entries[index-1]['verseEnd'],
                             kind=entries[index-1]['kind'], **cue))
        if index < len(verses):
            gap = rules['announceSilenceSec'] if index == 0 else rules['chunkGapSec']
            silence = np.zeros(round(gap * sample_rate), dtype=np.float32)
            arrays.append(silence)
            position += len(silence)
    pcm = np.concatenate(arrays)
    stem = f'{get_book_name(abbr)}_{args.chapter:03d}'
    mp3 = directory / f'{stem}.mp3'
    timing = directory / f'{stem}.json'
    meta = {'schemaVersion': 1, 'translationId': args.translation, 'translationName': translations[args.translation],
            'book': code, 'abbr': abbr, 'chapter': args.chapter, 'audio': mp3.name,
            'engine': cfg['modelId'], 'speaker': female['speaker'], 'speed': female['speed'],
            'totalSteps': female['totalSteps'], 'sampleRate': sample_rate, 'timeUnit': 'ms',
            'durationMs': round(len(pcm) * 1000 / sample_rate, 3), 'totalSamples': len(pcm),
            'timingMethod': 'verse-synthesis-sample-count', 'announcement': announcement, 'verses': cues,
            'generationHash': condition_hash, 'styleSha256': condition['synthesis']['styleSha256'],
            'modelRepo': MODEL_REPO, 'modelRevision': MODEL_REVISION,
            'sdkVersion': condition['synthesis']['packages']['supertonic'], 'sdkOrigin': condition['synthesis']['sdkOrigin'],
            'sourceGitCommit': provenance['sourceGitCommit'],
            'sourceWorkingTreeDirty': bool(provenance['sourceGitStatus']),
            'sourceSha256': digest(entries), 'synthesisHash': condition['synthesisHash'],
            'assemblyHash': digest({'settings': condition['assembly'],
                                    'parts': [sha256(parts / ('announce.wav' if i == 0 else f'verse-{numbers[i-1]:03d}.wav')) for i in range(len(numbers)+1)]})}
    expected = {'jsonFile': timing.name, 'metadata': meta, 'verseNumbers': numbers}
    report = None
    if synthesized == 0 and not args.force:
        try:
            meta['audioSha256'] = sha256(mp3)
            # Preserve the original provenance; content conditions must still match exactly.
            old = read_json(timing)
            for field in ['sourceGitCommit', 'sourceWorkingTreeDirty']:
                meta[field] = old[field]
            report = validate(directory, expected, pcm)
            print('기존 MP3/JSON 전체 검증 통과; 인코딩 생략')
        except (OSError, ValueError, KeyError, subprocess.CalledProcessError):
            pass
    if report is None:
        joined = directory / 'chapter.wav'
        save_wave(joined, pcm, sample_rate)
        temp = directory / f'{stem}.tmp.mp3'
        run(['ffmpeg', '-v', 'error', '-y', '-i', str(joined), '-codec:a', 'libmp3lame',
             '-b:a', '96k', '-ac', '1', str(temp)])
        temp.replace(mp3)
        meta['audioSha256'] = sha256(mp3)
        atomic_json(timing, meta)
        report = validate(directory, expected, pcm)
    elapsed = round(time.monotonic() - start, 3)
    previous = read_json(directory / 'validation.json') if (directory / 'validation.json').exists() else {}
    report.update({'synthesizedUnits': synthesized, 'reusedUnits': reused, 'runSeconds': elapsed,
                   'initialGenerationSeconds': previous.get('initialGenerationSeconds', elapsed) if synthesized == 0 else elapsed})
    report['timingSha256'] = sha256(timing)
    atomic_json(directory / 'validation.json', report)
    if args.result_file:
        atomic_json(args.result_file, {'directory': str(directory), **report})
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f'MP3: {mp3}\nJSON: {timing}')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n중단됨: 같은 명령으로 완료된 WAV부터 재개합니다.', file=sys.stderr)
        sys.exit(130)
