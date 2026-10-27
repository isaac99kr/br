#!/usr/bin/env python3
"""Re-encode an existing chapter release without re-running TTS synthesis."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def atomic(path, value):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--bitrate', default='64k')
    args = p.parse_args()
    source_manifest = json.loads((args.input / 'manifest.json').read_text(encoding='utf-8'))
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = dict(source_manifest)
    manifest['releaseId'] = f"{source_manifest['releaseId']}-{args.bitrate.replace('k','')}k"
    manifest['encoding'] = f'mono MP3 {args.bitrate}'
    started = time.monotonic()
    for index, item in enumerate(source_manifest['chapters'], 1):
        audio = args.input / item['audioUrl']
        timing = args.input / item['timingUrl']
        out_audio = args.output / item['audioUrl']
        out_timing = args.output / item['timingUrl']
        out_audio.parent.mkdir(parents=True, exist_ok=True)
        out_timing.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(audio),
                        '-codec:a', 'libmp3lame', '-b:a', args.bitrate, '-ac', '1', str(out_audio)], check=True)
        meta = json.loads(timing.read_text(encoding='utf-8'))
        meta['audioSha256'] = sha256(out_audio)
        atomic(out_timing, meta)
        updated = dict(item)
        updated['audioSha256'] = meta['audioSha256']
        updated['timingSha256'] = sha256(out_timing)
        updated['bytes'] = out_audio.stat().st_size
        manifest['chapters'][index - 1] = updated
        if index % 25 == 0:
            print(f'{index}/{len(source_manifest["chapters"])}', flush=True)
    atomic(args.output / 'manifest.json', manifest)
    print(json.dumps({'output': str(args.output), 'chapters': len(manifest['chapters']),
                      'seconds': round(time.monotonic() - started, 1)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
