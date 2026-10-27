#!/usr/bin/env python3
"""Upload the staged chapter release to Cloudflare R2 using .env.local."""
import mimetypes
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import boto3
from boto3.s3.transfer import TransferConfig

ROOT = Path(__file__).resolve().parents[2]

def load_env():
    for line in (ROOT / '.env.local').read_text().splitlines():
        line=line.strip()
        if line and not line.startswith('#') and '=' in line:
            k,v=line.split('=',1)
            os.environ.setdefault(k,v)

def main():
    load_env()
    required=['R2_ACCOUNT_ID','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_ENDPOINT']
    missing=[k for k in required if not os.environ.get(k) or '<' in os.environ[k]]
    if missing: raise SystemExit('누락된 R2 설정: '+', '.join(missing))
    root=ROOT/'public/audio/chapters'
    current=(root/'current.json').read_text().strip()
    release=__import__('json').loads(current)['releaseId']
    source=root/release
    if not source.is_dir(): raise SystemExit(f'릴리스 없음: {source}')
    s3=boto3.client('s3',endpoint_url=os.environ['R2_ENDPOINT'],
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'])
    cfg=TransferConfig(multipart_threshold=16*1024*1024,multipart_chunksize=16*1024*1024,max_concurrency=4,use_threads=True)
    files=[p for p in source.rglob('*') if p.is_file()]
    def upload(path):
        key=str(path.relative_to(root)).replace(os.sep,'/')
        content=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        s3.upload_file(str(path),os.environ['R2_BUCKET'],key,ExtraArgs={'ContentType':content,'CacheControl':'public,max-age=31536000,immutable'},Config=cfg)
        return key
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures=[pool.submit(upload,p) for p in files]
        for i,f in enumerate(as_completed(futures),1):
            f.result()
            if i%25==0: print(f'{i}/{len(files)}',flush=True)
    # current.json is intentionally short-cache so a release pointer can change.
    s3.upload_file(str(root/'current.json'),os.environ['R2_BUCKET'],'current.json',ExtraArgs={'ContentType':'application/json','CacheControl':'no-cache'},Config=cfg)
    print(f'업로드 완료: {len(files)}개, release={release}')

if __name__=='__main__': main()
