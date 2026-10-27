#!/usr/bin/env python3
"""Download the pinned archive model and record local content hashes."""
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_REPO = 'supertone-oss-archive/supertonic-3'
MODEL_REVISION = 'aafc6e32416a594460b32413efc49d7fe4ce6d46'
MODEL_DIR = ROOT / 'models' / 'supertonic-3' / MODEL_REVISION


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    os.environ.setdefault('HF_HOME', str(ROOT / 'models' / '.hf-cache'))
    from huggingface_hub import snapshot_download
    snapshot_download(repo_id=MODEL_REPO, revision=MODEL_REVISION,
                      local_dir=MODEL_DIR, allow_patterns=['onnx/*', 'voice_styles/*', 'LICENSE*', 'README.md'],
                      max_workers=2)
    files = {str(p.relative_to(MODEL_DIR)): sha256(p)
             for p in sorted((MODEL_DIR / 'onnx').rglob('*')) if p.is_file()}
    if not files or not any(p.endswith('.onnx') for p in files):
        raise RuntimeError('모델 ONNX 파일이 없습니다.')
    manifest = {'repo': MODEL_REPO, 'revision': MODEL_REVISION, 'files': files}
    temp = MODEL_DIR / 'model-manifest.tmp'
    temp.write_text(json.dumps(manifest, indent=2) + '\n')
    temp.replace(MODEL_DIR / 'model-manifest.json')
    print(MODEL_DIR)


if __name__ == '__main__':
    main()
